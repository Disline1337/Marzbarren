import json
import os
import subprocess
import tempfile
import unittest
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import quote

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from tests.hwid_support import Base, load_file
import app
from app import xray
from app.models.proxy import HysteriaSettings, ProxySettings, ProxyTypes
from app.models.user import UserStatus

app.__version__ = "test"
xray_config = load_file("tests.hysteria_config", "app/xray/config.py")


def minimal_config(inbounds):
    return {
        "inbounds": inbounds,
        "outbounds": [{"protocol": "freedom", "tag": "direct"}],
    }


def cache_host(**kwargs):
    values = {
        "remark": "node",
        "address": ["203.0.113.10"],
        "port": None,
        "path": None,
        "sni": [],
        "host": [],
        "alpn": "",
        "fingerprint": "",
        "tls": None,
        "allowinsecure": False,
        "mux_enable": False,
        "fragment_setting": None,
        "noise_setting": None,
        "random_user_agent": False,
        "use_sni_as_host": False,
        "vless_encryption": None,
        "xhttp_mode": None,
        "xhttp_extra": None,
        "finalmask": None,
    }
    values.update(kwargs)
    return values


def hysteria_inbound():
    return {
        "tag": "hy2",
        "protocol": "hysteria",
        "port": 11451,
        "settings": {"version": 2},
        "streamSettings": {
            "method": "hysteria",
            "security": "tls",
            "tlsSettings": {"serverName": "hy.example"},
            "hysteriaSettings": {
                "version": 2,
                "auth": "transport-auth",
                "masquerade": "https://example.com/dir",
            },
        },
    }


class SettingsTests(unittest.TestCase):
    def test_default_auth_and_empty_rejected_without_echo(self):
        settings = HysteriaSettings()
        self.assertTrue(settings.auth)
        generated = ProxySettings.from_dict("hysteria", {})
        self.assertIsInstance(generated, HysteriaSettings)
        self.assertTrue(generated.auth)
        with self.assertRaises(ValidationError) as caught:
            HysteriaSettings(auth="  ")
        msgs = [item["msg"] for item in caught.exception.errors()]
        self.assertTrue(any("Hysteria auth is required" in msg for msg in msgs))
        self.assertFalse(any("  " in item["msg"] for item in caught.exception.errors()))


class InboundTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)

    def test_resolve_and_include_users_not_clients(self):
        from app.db.models import Proxy, User

        loaded = xray_config.XRayConfig(minimal_config([hysteria_inbound()]), api_port=18091)
        resolved = loaded.inbounds_by_tag["hy2"]
        self.assertEqual(resolved["network"], "hysteria")
        self.assertEqual(resolved["tls"], "tls")
        self.assertIn("hy.example", resolved["sni"])
        self.assertNotIn("masquerade", resolved)
        self.assertNotIn("masquerade", json.dumps(resolved))

        stored = {"auth": "s3cret-auth"}
        self.db.add(Proxy(
            user=User(username="alice", status=UserStatus.active),
            type=ProxyTypes.Hysteria,
            settings=stored,
        ))
        self.db.commit()

        @contextmanager
        def use_test_db():
            yield self.db

        with patch.object(xray_config, "GetDB", use_test_db):
            generated = loaded.include_db_users()
        raw = next(item for item in generated["inbounds"] if item.get("tag") == "hy2")
        self.assertEqual(raw["streamSettings"]["method"], "hysteria")
        self.assertNotIn("clients", raw["settings"])
        users = raw["settings"]["users"]
        self.assertEqual(users[0]["auth"], "s3cret-auth")
        self.assertTrue(users[0]["email"].endswith(".alice"))
        self.assertEqual(set(users[0]), {"email", "auth"})


class SubscriptionTests(unittest.TestCase):
    def test_hy2_json_and_legacy_clients_omit(self):
        from app.subscription.clash import ClashMetaConfiguration
        from app.subscription.share import _project_host
        from app.subscription.singbox import SingBoxConfiguration
        from app.subscription.v2ray import V2rayJsonConfig, V2rayShareLink

        loaded = xray_config.XRayConfig(minimal_config([hysteria_inbound()]), api_port=18092)
        projected = _project_host(loaded.inbounds_by_tag["hy2"], cache_host(), {})
        address = projected.pop("address")
        settings = {"auth": "s3cret-auth"}

        share = V2rayShareLink()
        share.add(remark="node", address=address, inbound=dict(projected), settings=settings)
        self.assertEqual(len(share.links), 1)
        link = share.links[0]
        self.assertTrue(link.startswith("hy2://"))
        self.assertIn(quote("s3cret-auth", safe=""), link)
        self.assertIn("sni=hy.example", link)
        self.assertNotIn("masquerade", link)
        self.assertNotIn("dir", link)

        native = V2rayJsonConfig()
        native.add(remark="node", address=address, inbound=dict(projected), settings=settings)
        rendered = json.loads(native.render())
        outbound = next(item for item in rendered[0]["outbounds"] if item.get("tag") == "proxy")
        self.assertEqual(outbound["protocol"], "hysteria")
        self.assertEqual(outbound["streamSettings"]["method"], "hysteria")
        self.assertEqual(outbound["streamSettings"]["hysteriaSettings"]["auth"], "s3cret-auth")
        self.assertNotIn("masquerade", json.dumps(outbound))
        self.assertNotIn("network", outbound["streamSettings"])

        clash = ClashMetaConfiguration()
        clash.add(remark="node", address=address, inbound=dict(projected), settings=settings)
        self.assertEqual(clash.data["proxies"], [])

        box = SingBoxConfiguration()
        before = list(box.config.get("outbounds") or [])
        box.add(remark="node", address=address, inbound=dict(projected), settings=settings)
        self.assertFalse(any(item.get("type") == "hysteria" for item in box.config["outbounds"]))
        self.assertEqual(len(box.config["outbounds"]), len(before))

        xray_bin = os.environ.get("XRAY_EXECUTABLE_PATH") or "/usr/local/bin/xray"
        if os.path.isfile(xray_bin) and os.access(xray_bin, os.X_OK):
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
                json.dump(rendered[0], handle)
                path = handle.name
            try:
                completed = subprocess.run(
                    [xray_bin, "run", "-test", "-config", path],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                self.assertEqual(completed.returncode, 0, completed.stderr or completed.stdout)
            finally:
                os.unlink(path)


class OperationsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)

    def test_add_user_restarts_without_grpc(self):
        import sys
        import types
        from app.db.models import Proxy, User

        loaded = xray_config.XRayConfig(minimal_config([hysteria_inbound()]), api_port=18093)
        user = User(username="alice", status=UserStatus.active)
        self.db.add(Proxy(user=user, type=ProxyTypes.Hysteria, settings={"auth": "s3cret-auth"}))
        self.db.commit()
        self.db.refresh(user)

        node_mod = types.ModuleType("app.xray.node")
        node_mod.XRayNode = object
        sys.modules["app.xray.node"] = node_mod
        operations = load_file("tests.hysteria_operations", "app/xray/operations.py")

        grpc_calls = []

        def fail_add(*args, **kwargs):
            grpc_calls.append((args, kwargs))
            raise AssertionError("gRPC add should not run for hysteria")

        operations._add_user_to_inbound = fail_add
        restarted = []
        xray.config = loaded
        xray.api = object()
        xray.nodes = {}
        xray.core = SimpleNamespace(restart=lambda config: restarted.append(config))

        fake_user = SimpleNamespace(
            inbounds={ProxyTypes.Hysteria: ["hy2"]},
            proxies={ProxyTypes.Hysteria: HysteriaSettings(auth="s3cret-auth")},
        )

        @contextmanager
        def use_test_db():
            yield self.db

        with patch.object(operations.UserResponse, "model_validate", return_value=fake_user), \
                patch.object(xray_config, "GetDB", use_test_db):
            operations.add_user(SimpleNamespace(id=user.id, username="alice"))

        self.assertEqual(grpc_calls, [])
        self.assertEqual(len(restarted), 1)
        raw = next(item for item in restarted[0]["inbounds"] if item.get("tag") == "hy2")
        email = f"{user.id}.alice"
        self.assertTrue(any(item.get("email") == email for item in raw["settings"]["users"]))


if __name__ == "__main__":
    unittest.main()
