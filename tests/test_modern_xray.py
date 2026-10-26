import base64
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from tests.hwid_support import Base, crud, load_file
import app
from app import xray
from app.models.proxy import ProxyHost, validate_vless_client_encryption, validate_xhttp_extra

app.__version__ = "test"
system = load_file("tests.modern_xray_system", "app/routers/system.py")
migration = load_file(
    "tests.modern_xray_migration",
    "app/db/migrations/versions/c8d2e4f607a1_add_modern_xray_host_settings.py",
)
xray_config = load_file("tests.modern_xray_config", "app/xray/config.py")


def b64url(size):
    return base64.urlsafe_b64encode(bytes([0x11]) * size).decode().rstrip("=")


def client_encryption(mode="native", rtt="0rtt", padding="", size=32):
    parts = ["mlkem768x25519plus", mode, rtt]
    if padding:
        parts.extend(padding.split("."))
    parts.append(b64url(size))
    return ".".join(parts)


def host(**kwargs):
    values = {"remark": "node", "address": "203.0.113.10"}
    values.update(kwargs)
    return ProxyHost(**values)


class EncryptionValidationTests(unittest.TestCase):
    def test_real_vlessenc_shape_and_explicit_none(self):
        for mode in ("native", "xorpub", "random"):
            for rtt in ("0rtt", "1rtt"):
                for size in (32, 1184):
                    value = client_encryption(mode, rtt, size=size)
                    self.assertEqual(validate_vless_client_encryption("  " + value + "  "), value)
        self.assertEqual(validate_vless_client_encryption(" none "), "none")
        self.assertIsNone(validate_vless_client_encryption("   "))
        self.assertIsNone(validate_vless_client_encryption(None))

    def test_padding_accepts_alternating_triples_only(self):
        valid = client_encryption(padding="100-111-1111.75-0-111.50-0-3333")
        self.assertEqual(validate_vless_client_encryption(valid), valid)
        secret = client_encryption(size=64)
        for value in (
            secret,
            client_encryption(padding="50-1-2"),
            client_encryption(padding="100-0-10"),
            client_encryption(padding="100-10-1"),
            client_encryption().replace("0rtt", "600s"),
            client_encryption() + "=",
            "mlkem768x25519plus.native.0rtt." + b64url(32)[:20] + "+" + b64url(32)[21:],
            "mlkem768x25519plus.native.0rtt.not a key",
        ):
            with self.subTest(value=value[:40]), self.assertRaises(ValueError) as caught:
                validate_vless_client_encryption(value)
            self.assertEqual(str(caught.exception), "Invalid VLESS client encryption")
            self.assertNotIn(secret, str(caught.exception))
            self.assertNotIn(value, str(caught.exception))


class XhttpExtraValidationTests(unittest.TestCase):
    def test_none_and_empty_object_stay_distinct_and_unmutated(self):
        empty = {}
        self.assertIsNone(validate_xhttp_extra(None))
        self.assertIs(validate_xhttp_extra(empty), empty)
        self.assertEqual(empty, {})

    def test_preserves_public_values_and_rejects_secrets_without_echo(self):
        extra = {
            "xPaddingBytes": "100-200",
            "xPaddingObfsMode": False,
            "noGRPCHeader": False,
            "futureOption": 0,
            "xmux": {"hKeepAlivePeriod": 0, "maxConcurrency": "1-2"},
            "downloadSettings": {"address": "cdn.example", "port": 443},
        }
        self.assertIs(validate_xhttp_extra(extra), extra)
        secret = "server-private-value"
        for value in (
            ["not-an-object"],
            "not-an-object",
            {"host": "cdn.example"},
            {"path": "/secret"},
            {"mode": "packet-up"},
            {"extra": {}},
            {"headers": {"Host": "cdn.example"}},
            {"headers": {"X-Token": 1}},
            {"xPaddingObfsMode": 0},
            {"xPaddingBytes": False},
            {"xmux": {"hKeepAlivePeriod": False}},
            {"xmux": []},
            {"downloadSettings": []},
            {"nested": [{"privateKey": secret}]},
            {"downloadSettings": {"realitySettings": {"mldsa65Seed": secret}}},
            {"certificates": []},
            {"clients": []},
            {"decryption": secret},
            {"xPaddingBytes": float("nan")},
        ):
            with self.subTest(value=type(value).__name__), self.assertRaises(ValueError) as caught:
                validate_xhttp_extra(value)
            self.assertNotIn(secret, str(caught.exception))


class InboundFlagTests(unittest.TestCase):
    def test_flag_is_public_and_decryption_is_not(self):
        secret = "mlkem768x25519plus.native.600s." + b64url(64)
        config = xray_config.XRayConfig({
            "inbounds": [
                {"tag": "encrypted", "protocol": "vless", "port": 443, "settings": {"decryption": secret}},
                {"tag": "plain", "protocol": "vless", "port": 444, "settings": {"decryption": "none"}},
                {"tag": "blank", "protocol": "vless", "port": 445, "settings": {"decryption": "  "}},
                {"tag": "other", "protocol": "trojan", "port": 446, "settings": {"decryption": secret}},
            ],
            "outbounds": [{"protocol": "freedom", "tag": "direct"}],
        }, api_port=18080)
        self.assertTrue(config.inbounds_by_tag["encrypted"]["vless_encryption_required"])
        self.assertFalse(config.inbounds_by_tag["plain"]["vless_encryption_required"])
        self.assertFalse(config.inbounds_by_tag["blank"]["vless_encryption_required"])
        self.assertFalse(config.inbounds_by_tag["other"]["vless_encryption_required"])
        for settings in config.inbounds_by_tag.values():
            self.assertNotIn("decryption", settings)
            rendered = str(settings)
            self.assertNotIn(secret, rendered)


class HostStorageTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)
        self.updates = 0
        xray.config = SimpleNamespace(inbounds_by_tag={
            "VLESS XHTTP": {"protocol": "vless", "network": "xhttp", "vless_encryption_required": True},
            "VLESS TCP": {"protocol": "vless", "network": "tcp", "vless_encryption_required": False},
            "Shadowsocks TCP": {"protocol": "shadowsocks", "network": "tcp", "vless_encryption_required": False},
        })
        xray.hosts = SimpleNamespace(update=self._updated)

    def _updated(self):
        self.updates += 1

    def test_round_trip_distinguishes_empty_extra_from_inheritance(self):
        encryption = client_encryption()
        saved = system.modify_hosts({
            "VLESS XHTTP": [
                host(vless_encryption=encryption, xhttp_mode="packet-up", xhttp_extra={"futureOption": False}),
                host(remark="clear", xhttp_extra={}, is_disabled=True),
                host(remark="inherit", is_disabled=True),
            ],
        }, self.db, None)
        rows = saved["VLESS XHTTP"]
        self.assertEqual(rows[0].vless_encryption, encryption)
        self.assertEqual(rows[0].xhttp_mode, "packet-up")
        self.assertEqual(rows[0].xhttp_extra, {"futureOption": False})
        self.assertEqual(rows[1].xhttp_extra, {})
        self.assertIsNone(rows[2].xhttp_extra)
        self.assertIsNone(rows[2].xhttp_mode)
        self.assertEqual(self.updates, 1)
        again = crud.get_hosts(self.db, "VLESS XHTTP")
        self.assertEqual(again[1].xhttp_extra, {})
        self.assertIsNone(again[2].xhttp_extra)

    def test_invalid_payload_does_not_replace_saved_hosts(self):
        encryption = client_encryption()
        system.modify_hosts({"VLESS XHTTP": [host(vless_encryption=encryption, xhttp_mode="auto")]}, self.db, None)
        before = [(row.remark, row.vless_encryption, row.xhttp_mode) for row in crud.get_hosts(self.db, "VLESS XHTTP")]
        payloads = (
            {"VLESS XHTTP": [host(vless_encryption="none")]},
            {"VLESS XHTTP": [host(vless_encryption=None)]},
            {"VLESS TCP": [host(vless_encryption=encryption)]},
            {"Shadowsocks TCP": [host(vless_encryption=encryption)]},
            {"Shadowsocks TCP": [host(xhttp_mode="stream-one", xhttp_extra={})]},
            {"missing": [host()]},
        )
        for payload in payloads:
            with self.subTest(payload=next(iter(payload))):
                with self.assertRaises(HTTPException) as caught:
                    system.modify_hosts(payload, self.db, None)
                self.assertIn(caught.exception.status_code, (400, 422))
                if caught.exception.status_code == 422:
                    self.assertIsInstance(caught.exception.detail, dict)
                    self.assertTrue(all(isinstance(item, str) for item in caught.exception.detail.values()))
                    self.assertNotIn(encryption, str(caught.exception.detail))
        self.assertEqual(
            [(row.remark, row.vless_encryption, row.xhttp_mode) for row in crud.get_hosts(self.db, "VLESS XHTTP")],
            before,
        )
        self.assertEqual(self.updates, 1)

    def test_model_rejects_invalid_json_before_storage(self):
        with self.assertRaises(ValidationError) as caught:
            host(xhttp_extra={"privateKey": "do-not-echo", "xPaddingBytes": float("inf")})
        self.assertNotIn("do-not-echo", str(caught.exception))
        with self.assertRaises(ValidationError):
            host(vless_encryption=client_encryption(size=64))
        self.assertEqual(crud.get_hosts(self.db, "VLESS XHTTP")[0].vless_encryption, None)


class MigrationTests(unittest.TestCase):
    def test_upgrade_and_downgrade_preserve_existing_rows(self):
        engine = create_engine("sqlite:///:memory:")
        self.addCleanup(engine.dispose)
        with engine.begin() as connection:
            connection.execute(text(
                "CREATE TABLE hosts (id INTEGER PRIMARY KEY, remark VARCHAR(256) NOT NULL, "
                "address VARCHAR(256) NOT NULL, inbound_tag VARCHAR(256) NOT NULL)"
            ))
            connection.execute(text(
                "INSERT INTO hosts (id, remark, address, inbound_tag) VALUES (1, 'keep-remark', '203.0.113.10', 'VLESS')"
            ))
            connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR(34))"))
            connection.execute(text("INSERT INTO users VALUES (1, 'alice')"))
            connection.execute(text(
                "CREATE TABLE client_routing_settings (id INTEGER PRIMARY KEY, settings JSON NOT NULL, "
                "happ_updated_at BIGINT NOT NULL)"
            ))
            connection.execute(text("INSERT INTO client_routing_settings VALUES (1, '{\"happ\":{}}', 7)"))
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
                columns = {column["name"] for column in inspect(connection).get_columns("hosts")}
                self.assertTrue({"vless_encryption", "xhttp_mode", "xhttp_extra"} <= columns)
                row = connection.execute(text(
                    "SELECT remark, address, vless_encryption, xhttp_mode, xhttp_extra FROM hosts"
                )).one()
                self.assertEqual(tuple(row), ("keep-remark", "203.0.113.10", None, None, None))
                migration.downgrade()
            columns = {column["name"] for column in inspect(connection).get_columns("hosts")}
            self.assertFalse(columns & {"vless_encryption", "xhttp_mode", "xhttp_extra"})
            self.assertEqual(connection.execute(text("SELECT remark, address FROM hosts")).one(), ("keep-remark", "203.0.113.10"))
            self.assertEqual(connection.execute(text("SELECT username FROM users")).scalar(), "alice")
            self.assertEqual(connection.execute(text("SELECT happ_updated_at FROM client_routing_settings")).scalar(), 7)
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
    }
    values.update(kwargs)
    return values


class ProjectionTests(unittest.TestCase):
    def config(self, inbounds):
        return xray_config.XRayConfig(minimal_config(inbounds), api_port=18081)

    def test_xhttp_precedence_preserves_values_and_server_json(self):
        secret = "server-seed-value"
        original = {
            "tag": "xhttp",
            "protocol": "vless",
            "port": 443,
            "settings": {"decryption": "none"},
            "streamSettings": {
                "network": "splithttp",
                "splithttpSettings": {"path": "/old", "xPaddingBytes": "1-2"},
                "xhttpSettings": {
                    "path": "/new",
                    "host": "cdn.example",
                    "mode": "",
                    "xPaddingBytes": "9-9",
                    "noSSEHeader": True,
                    "extra": {
                        "xPaddingBytes": "100-200",
                        "xPaddingObfsMode": False,
                        "scMaxEachPostBytes": 0,
                        "noSSEHeader": True,
                        "xmux": {"hKeepAlivePeriod": 0},
                        "futureOption": False,
                    },
                },
            },
        }
        loaded = self.config([original])
        resolved = loaded.inbounds_by_tag["xhttp"]
        self.assertEqual(resolved["network"], "xhttp")
        self.assertEqual(resolved["path"], "/new")
        self.assertEqual(resolved["mode"], "auto")
        self.assertEqual(resolved["xhttp_extra"], {
            "xPaddingBytes": "100-200",
            "xPaddingObfsMode": False,
            "scMaxEachPostBytes": 0,
            "xmux": {"hKeepAlivePeriod": 0},
            "futureOption": False,
        })
        self.assertNotIn("noSSEHeader", resolved["xhttp_extra"])
        original_inbound = next(item for item in loaded["inbounds"] if item.get("tag") == "xhttp")
        self.assertEqual(original_inbound["streamSettings"]["network"], "splithttp")
        self.assertNotIn(secret, str(resolved))
    def test_raw_settings_win_over_tcp_settings(self):
        loaded = self.config([{
            "tag": "raw",
            "protocol": "vless",
            "port": 443,
            "settings": {"decryption": "none"},
            "streamSettings": {
                "network": "tcp",
                "tcpSettings": {"header": {"type": "none"}},
                "rawSettings": {"header": {"type": "http", "request": {"path": ["/raw"], "headers": {"Host": ["raw.example"]}}}},
            },
        }])
        resolved = loaded.inbounds_by_tag["raw"]
        self.assertEqual(resolved["network"], "tcp")
        self.assertEqual(resolved["header_type"], "http")
        self.assertEqual(resolved["path"], "/raw")
        self.assertEqual(loaded["inbounds"][1]["streamSettings"]["network"], "tcp")



    def test_flat_options_do_not_override_nested_extra_or_add_defaults(self):
        loaded = self.config([{
            "tag": "flat",
            "protocol": "vless",
            "port": 8443,
            "settings": {"decryption": "none"},
            "streamSettings": {
                "network": "xhttp",
                "xhttpSettings": {
                    "path": "/flat",
                    "xPaddingBytes": "100-200",
                    "xPaddingObfsMode": False,
                    "scMaxBufferedPosts": 4,
                    "privateKey": "do-not-copy",
                },
            },
        }])
        extra = loaded.inbounds_by_tag["flat"]["xhttp_extra"]
        self.assertEqual(extra["xPaddingBytes"], "100-200")
        self.assertIs(extra["xPaddingObfsMode"], False)
        self.assertNotIn("scMaxBufferedPosts", extra)
        self.assertNotIn("privateKey", extra)
        self.assertNotIn("scMaxConcurrentPosts", loaded.inbounds_by_tag["flat"])
        self.assertNotIn("keepAlivePeriod", loaded.inbounds_by_tag["flat"])

    def test_secret_extra_is_rejected_without_echo(self):
        secret = "reality-seed-secret"
        with self.assertRaises(ValueError) as caught:
            self.config([{
                "tag": "bad-extra",
                "protocol": "vless",
                "port": 443,
                "settings": {"decryption": "none"},
                "streamSettings": {
                    "network": "xhttp",
                    "xhttpSettings": {"extra": {"privateKey": secret}},
                },
            }])
        self.assertIn("bad-extra", str(caught.exception))
        self.assertNotIn(secret, str(caught.exception))

    def test_reality_public_fields_and_derivation_failure(self):
        verify = b64url(1952)
        seed = "server-seed-secret"
        calls = []

        def derive(value):
            calls.append(value)
            return verify

        xray.core = SimpleNamespace(get_mldsa65_verify=derive, get_x25519=lambda key: {"public_key": "derived"})
        loaded = self.config([{
            "tag": "reality",
            "protocol": "vless",
            "port": 443,
            "settings": {"decryption": "none"},
            "streamSettings": {
                "network": "raw",
                "security": "reality",
                "realitySettings": {
                    "password": "client-public",
                    "publicKey": "legacy-public",
                    "privateKey": "server-private",
                    "mldsa65Seed": seed,
                    "shortIds": ["", "abcd"],
                    "spiderX": "/canonical",
                    "SpiderX": "/legacy",
                },
            },
        }])
        resolved = loaded.inbounds_by_tag["reality"]
        self.assertEqual(resolved["pbk"], "client-public")
        self.assertEqual(resolved["spiderX"], "/canonical")
        self.assertEqual(resolved["spx"], "/canonical")
        self.assertEqual(resolved["mldsa65Verify"], verify)
        self.assertEqual(calls, [seed])
        rendered = str(resolved)
        self.assertNotIn(seed, rendered)
        self.assertNotIn("server-private", rendered)
        self.assertNotIn("mldsa65Seed", resolved)
        self.assertNotIn("privateKey", resolved)

        xray.core = SimpleNamespace(get_mldsa65_verify=lambda value: (_ for _ in ()).throw(RuntimeError(value)))
        with self.assertRaises(ValueError) as caught:
            self.config([{
                "tag": "broken-reality",
                "protocol": "vless",
                "port": 443,
                "settings": {"decryption": "none"},
                "streamSettings": {
                    "network": "tcp",
                    "security": "reality",
                    "realitySettings": {
                        "publicKey": "client-public",
                        "mldsa65Seed": seed,
                        "shortIds": ["abcd"],
                    },
                },
            }])
        self.assertNotIn(seed, str(caught.exception))

    def test_host_copies_do_not_share_sid_or_extra(self):
        from app.utils import system as system_utils
        with patch.object(system_utils, "get_public_ip", return_value="127.0.0.1"), patch.object(
            system_utils, "get_public_ipv6", return_value="::1"
        ):
            from app.subscription.share import _project_host
        inbound = {
            "tag": "reality",
            "protocol": "vless",
            "network": "xhttp",
            "tls": "reality",
            "port": 443,
            "sni": ["a.example"],
            "host": ["origin.example"],
            "path": "/inbound",
            "sids": ["", "one", "two"],
            "vless_encryption_required": True,
            "xhttp_extra": {"xPaddingBytes": "1-2", "futureOption": False},
            "mode": "auto",
        }
        sid_choices = iter(["one", "two"])

        def choose(values):
            if list(values) == ["one", "two"]:
                return next(sid_choices)
            return values[0]

        with patch("app.subscription.share.random.choice", side_effect=choose):
            first = _project_host(inbound, cache_host(
                vless_encryption=client_encryption(),
                xhttp_mode="packet-up",
                xhttp_extra={"xPaddingBytes": "100-200"},
            ), {})
            second = _project_host(inbound, cache_host(
                remark="other",
                vless_encryption=client_encryption(),
                xhttp_extra={},
            ), {})
        self.assertEqual(first["sid"], "one")
        self.assertEqual(second["sid"], "two")
        self.assertNotIn("sid", inbound)
        self.assertEqual(first["mode"], "packet-up")
        self.assertEqual(second["mode"], "auto")
        self.assertEqual(first["xhttp_extra"], {"xPaddingBytes": "100-200"})
        self.assertEqual(second["xhttp_extra"], {})
        self.assertTrue(second["xhttp_extra_override"])
        self.assertEqual(inbound["xhttp_extra"], {"xPaddingBytes": "1-2", "futureOption": False})
        self.assertIsNone(_project_host(inbound, cache_host(vless_encryption="none"), {}))
        plain = dict(inbound, vless_encryption_required=False, network="tcp")
        self.assertEqual(_project_host(plain, cache_host(), {})["vless_encryption"], "none")
        self.assertIsNone(_project_host(plain, cache_host(vless_encryption=client_encryption()), {}))




class MldsaCliTests(unittest.TestCase):
    def test_parser_accepts_verify_and_hides_failures(self):
        core_mod = load_file("tests.modern_xray_core", "app/xray/core.py")
        verify = b64url(1952)
        seed = "seed-must-not-leak"
        runner = core_mod.XRayCore.get_mldsa65_verify
        fake = SimpleNamespace(executable_path="xray")

        def success(cmd, capture_output, text):
            self.assertEqual(cmd[:3], ["xray", "mldsa65", "-i"])
            self.assertNotIn("shell", cmd)
            return SimpleNamespace(returncode=0, stdout=f"Seed: hidden\nVerify: {verify}\n", stderr="hidden")

        with patch.object(core_mod.subprocess, "run", side_effect=success) as run:
            self.assertEqual(runner(fake, seed), verify)
            self.assertFalse(run.call_args.kwargs.get("shell"))
        for result in (
            SimpleNamespace(returncode=1, stdout=f"Verify: {verify}\n", stderr=seed),
            SimpleNamespace(returncode=0, stdout="Seed: only\n", stderr=""),
            SimpleNamespace(returncode=0, stdout="Verify: not-a-key\n", stderr=""),
        ):
            with patch.object(core_mod.subprocess, "run", return_value=result), self.assertRaises(ValueError) as caught:
                runner(fake, seed)
            self.assertEqual(str(caught.exception), "Unable to derive REALITY verification key")
            self.assertNotIn(seed, str(caught.exception))

class FlowTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)

    def test_startup_live_and_exports_share_flow_policy(self):
        from contextlib import contextmanager
        from app.db.models import Proxy, User
        from app.models.proxy import ProxyTypes, VLESSSettings
        from app.models.user import UserStatus
        from xray_api.types.account import XTLSFlows

        loaded = xray_config.XRayConfig(minimal_config([
            {
                "tag": "raw",
                "protocol": "vless",
                "port": 443,
                "settings": {"decryption": "none"},
                "streamSettings": {"network": "raw", "security": "reality", "realitySettings": {
                    "password": "pbk", "shortIds": ["abcd"],
                }},
            },
            {
                "tag": "plain-xhttp",
                "protocol": "vless",
                "port": 8443,
                "settings": {"decryption": "none"},
                "streamSettings": {"network": "xhttp", "xhttpSettings": {"path": "/plain", "mode": "packet-up"}},
            },
            {
                "tag": "enc-xhttp",
                "protocol": "vless",
                "port": 8444,
                "settings": {"decryption": "mlkem768x25519plus.native.600s.secret"},
                "streamSettings": {"network": "xhttp", "security": "none", "xhttpSettings": {"path": "/enc"}},
            },
        ]), api_port=18082)
        stored = {"id": "11111111-1111-1111-1111-111111111111", "flow": "xtls-rprx-vision"}
        self.db.add(Proxy(user=User(username="alice", status=UserStatus.active), type=ProxyTypes.VLESS, settings=stored))
        self.db.commit()

        @contextmanager
        def use_test_db():
            yield self.db

        with patch.object(xray_config, "GetDB", use_test_db):
            generated = loaded.include_db_users()
        by_tag = {}
        for inbound in generated["inbounds"]:
            if inbound.get("protocol") != "vless":
                continue
            client = inbound["settings"]["clients"][0]
            by_tag[inbound["tag"]] = client.get("flow", "")
        self.assertEqual(by_tag["raw"], "xtls-rprx-vision")
        self.assertEqual(by_tag["plain-xhttp"], "")
        self.assertEqual(by_tag["enc-xhttp"], "xtls-rprx-vision")
        self.assertEqual(stored["flow"], "xtls-rprx-vision")

        import sys
        import types
        node_mod = types.ModuleType("app.xray.node")
        node_mod.XRayNode = object
        sys.modules["app.xray.node"] = node_mod
        operations = load_file("tests.modern_xray_operations", "app/xray/operations.py")
        captured = []
        operations._add_user_to_inbound = lambda api, tag, account: captured.append((tag, account.flow))
        operations._alter_inbound_user = lambda api, tag, account: captured.append(("update:" + tag, account.flow))
        xray.config = loaded
        xray.api = object()
        xray.nodes = {}
        fake_user = SimpleNamespace(
            inbounds={ProxyTypes.VLESS: ["raw", "plain-xhttp", "enc-xhttp"]},
            proxies={ProxyTypes.VLESS: VLESSSettings(flow=XTLSFlows.VISION)},
        )
        with patch.object(operations.UserResponse, "model_validate", return_value=fake_user):
            operations.add_user(SimpleNamespace(id=1, username="alice"))
            operations.update_user(SimpleNamespace(id=1, username="alice"))
        self.assertEqual(dict(item for item in captured if not item[0].startswith("update")), {
            "raw": XTLSFlows.VISION,
            "plain-xhttp": XTLSFlows.NONE,
            "enc-xhttp": XTLSFlows.VISION,
        })
        self.assertEqual(fake_user.proxies[ProxyTypes.VLESS].flow, "xtls-rprx-vision")

        from app.subscription.v2ray import V2rayJsonConfig, V2rayShareLink
        from app.subscription.clash import ClashMetaConfiguration
        from app.subscription.singbox import SingBoxConfiguration
        settings = {"id": stored["id"], "flow": stored["flow"]}
        for tag, expect in (("raw", "xtls-rprx-vision"), ("plain-xhttp", None), ("enc-xhttp", "xtls-rprx-vision")):
            inbound = dict(loaded.inbounds_by_tag[tag])
            inbound["header_type"] = inbound.get("header_type", "")
            inbound["fragment_setting"] = inbound.get("fragment_setting")
            inbound["noise_setting"] = inbound.get("noise_setting")
            inbound["sni"] = inbound.get("sni") or ""
            host = inbound.get("host") or ""
            inbound["host"] = host[0] if isinstance(host, list) and host else ""
            inbound["path"] = inbound.get("path") or ""
            native = V2rayJsonConfig()
            native.add("node", "203.0.113.10", inbound, settings)
            flow = native.config[0]["outbounds"][0]["settings"]["vnext"][0]["users"][0].get("flow")
            self.assertEqual(flow, expect)
            link = V2rayShareLink()
            link.add("node", "203.0.113.10", inbound, settings)
            self.assertEqual("flow=xtls-rprx-vision" in link.links[0], expect == "xtls-rprx-vision")
            if tag == "raw":
                meta = ClashMetaConfiguration()
                meta.add("node", "203.0.113.10", inbound, settings)
                self.assertEqual(meta.data["proxies"][0].get("flow"), "xtls-rprx-vision")
                box = SingBoxConfiguration()
                box.add("node", "203.0.113.10", inbound, settings)
                self.assertEqual(box.config["outbounds"][-1].get("flow"), "xtls-rprx-vision")

class ExportContractTests(unittest.TestCase):
    def test_uri_json_and_mihomo_keep_or_skip_modern_fields(self):
        from urllib.parse import parse_qs, urlsplit
        from app.subscription.clash import ClashConfiguration, ClashMetaConfiguration
        from app.subscription.singbox import SingBoxConfiguration
        from app.subscription.v2ray import V2rayJsonConfig, V2rayShareLink
        from app.templates import render_template

        encryption = client_encryption()
        pqv = b64url(1952)
        extra = {"xPaddingBytes": "100-200", "xmux": {"maxConcurrency": 0}, "note": "ключ+/"}
        inbound = {
            "protocol": "vless",
            "network": "xhttp",
            "tls": "reality",
            "port": 443,
            "sni": "cdn.example",
            "host": "cdn.example",
            "path": "/secret path",
            "header_type": "",
            "fragment_setting": None,
            "noise_setting": None,
            "pbk": "public-key",
            "sid": "abcd",
            "spx": "/spider",
            "mldsa65Verify": pqv,
            "vless_encryption": encryption,
            "vless_encryption_required": True,
            "mode": "packet-up",
            "xhttp_extra": extra,
            "xhttp_extra_override": True,
            "fp": "chrome",
            "alpn": "",
            "ais": False,
            "mux_enable": False,
            "random_user_agent": False,
        }
        settings = {"id": "11111111-1111-1111-1111-111111111111", "flow": "xtls-rprx-vision"}
        link = V2rayShareLink()
        link.add("node", "203.0.113.10", inbound, settings)
        query = parse_qs(urlsplit(link.links[0]).query, keep_blank_values=True)
        self.assertEqual(query["encryption"], [encryption])
        self.assertEqual(query["pqv"], [pqv])
        self.assertEqual(json.loads(query["extra"][0]), extra)
        self.assertEqual(query["type"], ["xhttp"])
        native = V2rayJsonConfig()
        native.add("node", "203.0.113.10", inbound, settings)
        outbound = native.config[0]["outbounds"][0]
        user = outbound["settings"]["vnext"][0]["users"][0]
        reality = outbound["streamSettings"]["realitySettings"]
        self.assertEqual(user["encryption"], encryption)
        self.assertEqual(reality["password"], "public-key")
        self.assertNotIn("publicKey", reality)
        self.assertEqual(reality["mldsa65Verify"], pqv)
        self.assertEqual(outbound["streamSettings"]["xhttpSettings"]["extra"]["xPaddingBytes"], "100-200")
        self.assertNotIn(encryption, "")  # credentials are asserted above, not printed
        meta = ClashMetaConfiguration()
        meta.add("modern", "203.0.113.10", inbound, settings)
        meta.add("plain", "203.0.113.10", {**inbound, "mldsa65Verify": "", "vless_encryption": "none", "xhttp_extra": {"xPaddingBytes": 0}}, settings)
        names = [item["name"] for item in meta.data["proxies"]]
        self.assertNotIn("modern", names)
        self.assertIn("plain", names)
        self.assertEqual(meta.data["proxies"][-1]["xhttp-opts"]["x-padding-bytes"], "0")
        legacy = ClashConfiguration()
        legacy.add("enc", "203.0.113.10", {**inbound, "network": "tcp", "tls": "tls"}, settings)
        self.assertEqual(legacy.data["proxies"], [])
        box = SingBoxConfiguration()
        box.add("enc", "203.0.113.10", {**inbound, "network": "tcp", "tls": "tls", "header_type": ""}, settings)
        self.assertFalse(any(item.get("type") == "vless" for item in box.config.get("outbounds", [])))
        rendered = render_template("clash/default.yml", {"proxy_remarks": [], "conf": {}})
        self.assertIn("proxies: [REJECT]", rendered)
        self.assertNotIn("DIRECT", rendered)

if __name__ == "__main__":
    unittest.main()
