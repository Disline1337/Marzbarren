import base64
import json
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.requests import Request
from alembic.migration import MigrationContext
from alembic.operations import Operations
import yaml

from tests.hwid_support import Base, crud, load_file
from app import xray
from app.db.models import Admin, ClientRoutingSettings, Proxy, User
from app.models.admin import Admin as AdminSchema
from app.models.client_routing import (
    ClientRoutingUpdate,
    HappRoutingProfile,
    MihomoRoutingProfile,
    MihomoRoutingRule,
)
from app.models.proxy import ProxyTypes
from app.models.user import UserResponse, UserStatus
from app.utils.jwt import create_admin_token

subscription = load_file("tests.subscription_router_routing", "app/routers/subscription.py")
client_routing_router = load_file("tests.client_routing_router", "app/routers/client_routing.py")
migration = load_file(
    "tests.client_routing_migration",
    "app/db/migrations/versions/b7c9e1f203a4_add_client_routing_settings.py",
)

PASSWORD = "secret-pass"
DEVICE = "routing-device-12345"


def request(**headers):
    raw = [(key.replace("_", "-").encode(), value.encode()) for key, value in headers.items()]
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/sub/token",
        "raw_path": b"/sub/token",
        "query_string": b"",
        "headers": raw,
        "scheme": "http",
        "server": ("test", 80),
        "client": ("127.0.0.1", 1234),
    })


def install_xray(remark="Node {USERNAME}", with_hosts=True):
    inbound = {
        "tag": "Shadowsocks TCP",
        "protocol": "shadowsocks",
        "network": "tcp",
        "port": 1080,
        "tls": "none",
        "sni": "",
        "host": "",
        "path": "",
        "header_type": "none",
        "fp": "",
        "alpn": "",
        "fragment_setting": "",
        "noise_setting": "",
    }
    xray.config = SimpleNamespace(
        inbounds_by_tag={"Shadowsocks TCP": inbound} if with_hosts else {},
        inbounds_by_protocol={ProxyTypes.Shadowsocks: [inbound]} if with_hosts else {},
    )
    xray.hosts = {
        "Shadowsocks TCP": [{
            "remark": remark,
            "address": ["203.0.113.10"],
            "port": 1080,
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
        }]
    } if with_hosts else {}


def routing(happ=None, mihomo=None):
    return ClientRoutingUpdate(
        happ=happ or HappRoutingProfile(),
        mihomo=mihomo or MihomoRoutingProfile(),
    )


def enabled_happ(**kwargs):
    values = {
        "enabled": True,
        "direct_sites": ["example.com", "geosite:CN"],
        "direct_ips": ["geoip:cn", "10.1.2.3/8"],
        "block_sites": ["ads.example.com"],
    }
    values.update(kwargs)
    return HappRoutingProfile(**values)


def enabled_mihomo(**kwargs):
    values = {
        "enabled": True,
        "rules": [
            MihomoRoutingRule(type="domain", value="ads.example.com", action="block"),
            MihomoRoutingRule(type="domain_suffix", value="Example.COM", action="direct"),
            MihomoRoutingRule(type="geosite", value="CN", action="direct"),
            MihomoRoutingRule(type="geoip", value="cn", action="direct"),
            MihomoRoutingRule(type="ip_cidr", value="2001:db8::1", action="block"),
        ],
    }
    values.update(kwargs)
    return MihomoRoutingProfile(**values)


class RoutingStoreTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)

    def test_get_returns_defaults_without_writing(self):
        loaded = crud.get_client_routing_settings(self.db)
        self.assertEqual(loaded.happ_updated_at, 0)
        self.assertFalse(loaded.happ.enabled)
        self.assertFalse(loaded.mihomo.enabled)
        self.assertEqual(self.db.query(ClientRoutingSettings).count(), 0)

    def test_save_survives_a_new_session_and_keeps_order(self):
        saved = crud.update_client_routing_settings(self.db, routing(
            happ=enabled_happ(direct_sites=["b.example", "a.example", "b.example"]),
            mihomo=enabled_mihomo(),
        ))
        self.db.close()
        reopened = Session(self.engine)
        self.addCleanup(reopened.close)
        loaded = crud.get_client_routing_settings(reopened)
        self.assertEqual(loaded.happ.direct_sites, ["b.example", "a.example"])
        self.assertEqual(loaded.happ.direct_ips, ["geoip:cn", "10.0.0.0/8"])
        self.assertEqual(loaded.happ.direct_sites[1:2], ["a.example"])
        self.assertEqual([rule.type for rule in loaded.mihomo.rules],
                         ["domain", "domain_suffix", "geosite", "geoip", "ip_cidr"])
        self.assertEqual(loaded.mihomo.rules[2].value, "CN")
        self.assertEqual(loaded.mihomo.rules[1].value, "example.com")
        self.assertEqual(loaded.mihomo.rules[4].value, "2001:db8::1/128")
        self.assertEqual(loaded.happ_updated_at, saved.happ_updated_at)

    def test_invalid_values_do_not_replace_saved_settings(self):
        crud.update_client_routing_settings(self.db, routing(happ=enabled_happ()))
        before = crud.get_client_routing_settings(self.db).model_dump()
        for payload in (
            {"happ": {"direct_sites": ["https://bad.example"]}, "mihomo": {}},
            {"happ": {"direct_sites": ["*.example.com"]}, "mihomo": {}},
            {"happ": {"direct_ips": ["10.0.0.0/99"]}, "mihomo": {}},
            {"happ": {"direct_sites": ["example.com"], "proxy_sites": ["example.com"]}, "mihomo": {}},
            {"happ": {"geoip_url": "https://user:pass@example.com/geoip.dat"}, "mihomo": {}},
            {"happ": {"geosite_url": "https://example.com/geosite.dat#frag"}, "mihomo": {}},
            {"happ": {}, "mihomo": {"default_action": "drop"}},
            {"happ": {}, "mihomo": {"rules": [
                {"type": "domain", "value": "example.com", "action": "proxy", "extra": 1}
            ]}},
            {"happ": {}, "mihomo": {}, "happ_updated_at": 9},
        ):
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                ClientRoutingUpdate.model_validate(payload)
        self.assertEqual(crud.get_client_routing_settings(self.db).model_dump(), before)
        self.assertEqual(self.db.query(ClientRoutingSettings).count(), 1)

    def test_idna_geo_case_and_cidr_are_normalized(self):
        saved = crud.update_client_routing_settings(self.db, routing(
            happ=HappRoutingProfile(
                direct_sites=[" Example.COM. ", "münchen.de", "geosite:CN"],
                direct_ips=["10.1.2.3/8", "2001:0db8:0000::1"],
            )
        ))
        self.assertEqual(saved.happ.direct_sites, ["example.com", "xn--mnchen-3ya.de", "geosite:CN"])
        self.assertEqual(saved.happ.direct_ips, ["10.0.0.0/8", "2001:db8::1"])

    def test_happ_stamp_advances_only_when_happ_changes(self):
        with patch("app.db.crud.time.time", return_value=1_700_000_000):
            first = crud.update_client_routing_settings(self.db, routing(happ=enabled_happ()))
            second = crud.update_client_routing_settings(
                self.db, routing(happ=enabled_happ(block_sites=["ads.example.com", "track.example"]))
            )
            mihomo_only = crud.update_client_routing_settings(
                self.db,
                routing(happ=enabled_happ(block_sites=["ads.example.com", "track.example"]),
                        mihomo=enabled_mihomo()),
            )
        self.assertGreater(second.happ_updated_at, first.happ_updated_at)
        self.assertEqual(second.happ_updated_at, first.happ_updated_at + 1)
        self.assertEqual(mihomo_only.happ_updated_at, second.happ_updated_at)
        self.assertTrue(mihomo_only.mihomo.enabled)

    def test_first_disabled_save_keeps_zero_stamp_and_disable_keeps_lists(self):
        disabled = crud.update_client_routing_settings(
            self.db, routing(happ=HappRoutingProfile(enabled=False, direct_sites=["example.com"]))
        )
        self.assertEqual(disabled.happ_updated_at, 0)
        self.assertEqual(disabled.happ.direct_sites, ["example.com"])
        crud.update_client_routing_settings(self.db, routing(happ=enabled_happ()))
        turned_off = crud.update_client_routing_settings(
            self.db, routing(happ=HappRoutingProfile(enabled=False, direct_sites=["example.com"]))
        )
        self.assertGreater(turned_off.happ_updated_at, 0)
        self.assertFalse(turned_off.happ.enabled)
        self.assertEqual(turned_off.happ.direct_sites, ["example.com"])

    def test_insert_conflict_rolls_back(self):
        self.db.execute(text(
            "CREATE TRIGGER client_routing_insert_conflict BEFORE INSERT ON client_routing_settings "
            "BEGIN SELECT RAISE(ABORT, 'UNIQUE constraint failed: client_routing_settings.id'); END"
        ))
        self.db.commit()
        with self.assertRaises(IntegrityError):
            crud.update_client_routing_settings(self.db, routing(happ=enabled_happ()))
        self.assertEqual(self.db.query(ClientRoutingSettings).count(), 0)


class RoutingApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)
        self.secret = patch("app.utils.jwt.get_secret_key", return_value="routing-test-secret")
        self.secret.start()
        self.addCleanup(self.secret.stop)

    def test_anonymous_and_non_sudo_are_rejected(self):
        with self.assertRaises(HTTPException) as anonymous:
            AdminSchema.check_sudo_admin(self.db, "not-a-token")
        self.assertEqual(anonymous.exception.status_code, 401)
        self.db.add(Admin(username="plain", hashed_password="x", is_sudo=False, users_usage=0))
        self.db.commit()
        with self.assertRaises(HTTPException) as denied:
            AdminSchema.check_sudo_admin(self.db, create_admin_token("plain", is_sudo=False))
        self.assertEqual(denied.exception.status_code, 403)
        self.assertEqual(self.db.query(ClientRoutingSettings).count(), 0)

    def test_sudo_put_returns_saved_profile(self):
        admin = AdminSchema(username="root", is_sudo=True)
        saved = client_routing_router.put_client_routing(routing(happ=enabled_happ()), self.db, admin)
        self.assertEqual(saved.happ.direct_sites, ["example.com", "geosite:CN"])
        loaded = client_routing_router.get_client_routing(self.db, admin)
        self.assertEqual(loaded.happ_updated_at, saved.happ_updated_at)

    def test_invalid_model_is_rejected_without_replacing_settings(self):
        admin = AdminSchema(username="root", is_sudo=True)
        client_routing_router.put_client_routing(routing(happ=enabled_happ()), self.db, admin)
        with self.assertRaises(ValidationError):
            ClientRoutingUpdate.model_validate({
                "happ": {"direct_sites": ["example.com", "bad domain"], "proxy_sites": ["example.com"]},
                "mihomo": {},
            })
        loaded = client_routing_router.get_client_routing(self.db, admin)
        self.assertEqual(loaded.happ.direct_sites, ["example.com", "geosite:CN"])

    def test_insert_conflict_is_409(self):
        self.db.execute(text(
            "CREATE TRIGGER client_routing_insert_conflict BEFORE INSERT ON client_routing_settings "
            "BEGIN SELECT RAISE(ABORT, 'UNIQUE constraint failed: client_routing_settings.id'); END"
        ))
        self.db.commit()
        with self.assertRaises(HTTPException) as caught:
            client_routing_router.put_client_routing(
                routing(happ=enabled_happ()), self.db, AdminSchema(username="root", is_sudo=True)
            )
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(caught.exception.detail, "Routing settings changed; reload and try again")
        self.assertEqual(self.db.query(ClientRoutingSettings).count(), 0)


class SubscriptionRoutingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)
        self.secret = patch("app.utils.jwt.get_secret_key", return_value="routing-test-secret")
        self.secret.start()
        self.addCleanup(self.secret.stop)
        install_xray()
        self.user = User(
            username="alice",
            status=UserStatus.active,
            used_traffic=0,
            created_at=datetime.utcnow(),
            hwid_device_limit=1,
            proxies=[Proxy(
                type=ProxyTypes.Shadowsocks,
                settings={"password": PASSWORD, "method": "chacha20-ietf-poly1305"},
            )],
        )
        self.db.add(self.user)
        self.db.commit()

    def fetch(self, user_agent, client_type=None, **headers):
        scope = request(**headers)
        if client_type is None:
            return subscription.user_subscription(scope, self.db, self.user, user_agent)
        return subscription.user_subscription_with_client_type(
            scope, self.user, client_type, self.db, user_agent
        )

    def decoded(self, response):
        self.assertEqual(response.media_type, "text/plain")
        return base64.b64decode(response.body).decode("utf-8")

    def payload(self, line, scheme):
        prefix = f"{scheme}://routing/onadd/"
        self.assertTrue(line.startswith(prefix), line[:40])
        return json.loads(base64.b64decode(line[len(prefix):]))

    def test_happ_and_incy_responses_carry_one_routing_profile(self):
        crud.update_client_routing_settings(self.db, routing(happ=enabled_happ()))
        for agent, scheme in (("Happ/1.63.1", "happ"), ("hApP/2", "happ"), ("INCY/1.0.0/Android", "incy")):
            with self.subTest(agent=agent):
                response = self.fetch(agent)
                body = self.decoded(response)
                lines = body.splitlines()
                profile = self.payload(lines[0], scheme)
                self.assertEqual(profile["Name"], "Marzban Routing")
                self.assertEqual(profile["GlobalProxy"], "true")
                self.assertIsInstance(profile["GlobalProxy"], str)
                self.assertEqual(profile["DirectSites"], ["example.com", "geosite:CN"])
                self.assertEqual(profile["DirectIp"], ["geoip:cn", "10.0.0.0/8"])
                self.assertEqual(profile["BlockSites"], ["ads.example.com"])
                self.assertIn("203.0.113.10", body)
                self.assertNotIn(PASSWORD, json.dumps(profile))
                self.assertNotIn("routing", response.headers)
                self.assertEqual(sum(line.startswith(f"{scheme}://routing/") for line in lines), 1)

    def test_cleared_list_is_sent_as_an_empty_array(self):
        crud.update_client_routing_settings(self.db, routing(happ=enabled_happ()))
        crud.update_client_routing_settings(self.db, routing(happ=enabled_happ(direct_sites=[])))
        profile = self.payload(self.decoded(self.fetch("Happ/1.63.1")).splitlines()[0], "happ")
        self.assertEqual(profile["DirectSites"], [])
        self.assertIn("LastUpdated", profile)

    def test_disabled_stamp_controls_off_header_without_erasing_lists(self):
        crud.update_client_routing_settings(
            self.db, routing(happ=HappRoutingProfile(enabled=False, direct_sites=["example.com"]))
        )
        untouched = self.fetch("Happ/1.63.1")
        self.assertNotIn("routing", untouched.headers)
        self.assertNotIn("routing/onadd", self.decoded(untouched))
        crud.update_client_routing_settings(self.db, routing(happ=enabled_happ()))
        crud.update_client_routing_settings(
            self.db, routing(happ=HappRoutingProfile(enabled=False, direct_sites=["example.com"]))
        )
        disabled = self.fetch("INCY/1.0/iOS")
        self.assertEqual(disabled.headers["routing"], "incy://routing/off")
        self.assertNotIn("example.com", disabled.headers["routing"])
        self.assertEqual(crud.get_client_routing_settings(self.db).happ.direct_sites, ["example.com"])

    def test_enabled_happ_profile_replaces_custom_json_but_explicit_json_stays(self):
        crud.update_client_routing_settings(self.db, routing(happ=enabled_happ()))
        with patch.object(subscription, "USE_CUSTOM_JSON_FOR_HAPP", True):
            main = self.fetch("Happ/1.63.1")
            explicit = self.fetch("Happ/1.63.1", "v2ray-json")
        self.assertEqual(main.media_type, "text/plain")
        self.assertTrue(self.decoded(main).splitlines()[0].startswith("happ://routing/onadd/"))
        parsed = json.loads(explicit.body)
        self.assertNotIn("routing", explicit.headers)
        self.assertNotIn("happ://routing", explicit.body.decode())
        self.assertIn("outbounds", json.dumps(parsed))

    def test_explicit_v2ray_still_receives_happ_routing(self):
        crud.update_client_routing_settings(self.db, routing(happ=enabled_happ()))
        response = self.fetch("Happ/1.63.1", "v2ray")
        self.assertTrue(self.decoded(response).startswith("happ://routing/onadd/"))

    def test_hwid_failure_returns_404_without_routing_data(self):
        crud.update_client_routing_settings(self.db, routing(happ=enabled_happ()))
        with patch.object(subscription, "HWID_ENABLED", True):
            with self.assertRaises(HTTPException) as missing:
                self.fetch("Happ/1.63.1")
            allowed = self.fetch("INCY/1.0/Android", x_hwid=DEVICE)
            with self.assertRaises(HTTPException) as extra:
                self.fetch("Happ/1.63.1", x_hwid="device-234567")
        self.assertEqual(missing.exception.status_code, 404)
        self.assertEqual(extra.exception.status_code, 404)
        for caught in (missing, extra):
            self.assertNotIn("routing", caught.exception.headers or {})
            self.assertNotIn("geosite", str(caught.exception.detail))
            self.assertNotIn(PASSWORD, str(caught.exception.detail))
        self.assertIn("incy://routing/onadd/", self.decoded(allowed))

    def test_html_without_hwid_hides_links_and_routing(self):
        crud.update_client_routing_settings(self.db, routing(happ=enabled_happ()))
        with patch.object(subscription, "HWID_ENABLED", True):
            response = self.fetch("", accept="text/html")
        page = response.body.decode()
        self.assertNotIn("ss://", page)
        self.assertNotIn("routing/onadd", page)
        self.assertNotIn(PASSWORD, page)
        self.assertIn("hidden", page)

    def test_info_and_usage_do_not_attach_routing(self):
        crud.update_client_routing_settings(self.db, routing(happ=enabled_happ()))
        info = subscription.user_subscription_info(request(), self.db, self.user)
        usage = subscription.user_get_usage(request(), self.user, "", "", self.db)
        self.assertEqual(info.username, "alice")
        self.assertNotIn("routing", usage)
        self.assertNotIsInstance(info, type(self.fetch("Happ/1.0")))

    def test_mihomo_overlay_preserves_proxies_and_replaces_rules(self):
        crud.update_client_routing_settings(self.db, routing(mihomo=enabled_mihomo()))
        for agent in ("koala-clash/1.0.0", "mihomo.party/v1.0.0 (clash.meta)", "Clash-Meta/1.0"):
            with self.subTest(agent=agent):
                loaded = yaml.safe_load(self.fetch(agent).body)
                self.assert_mihomo(loaded, "Marzban Routing")
        explicit = yaml.safe_load(self.fetch("CustomApp/1.0", "clash-meta").body)
        self.assert_mihomo(explicit, "Marzban Routing")

    def test_name_conflict_and_empty_proxies_do_not_fall_back_to_direct(self):
        install_xray(remark="Marzban Routing")
        crud.update_client_routing_settings(self.db, routing(mihomo=enabled_mihomo()))
        conflicted = yaml.safe_load(self.fetch("koala-clash/1.0.0").body)
        self.assert_mihomo(conflicted, "Marzban Routing 2")
        install_xray(with_hosts=False)
        self.db.refresh(self.user)
        empty = yaml.safe_load(self.fetch("clash-party/1.0.0").body)
        group = next(item for item in empty["proxy-groups"] if item["name"] == "Marzban Routing")
        self.assertEqual(group["proxies"], ["REJECT"])
        self.assertNotIn("DIRECT", group["proxies"])
        self.assertTrue(all("no-resolve" not in rule for rule in empty["rules"]))

    def test_disabled_mihomo_and_legacy_clash_keep_the_template(self):
        user = UserResponse.model_validate(self.user)
        original = subscription.generate_subscription(user, "clash-meta", False, False)
        disabled = self.fetch("koala-clash/1.0.0")
        self.assertEqual(disabled.body.decode(), original)
        crud.update_client_routing_settings(self.db, routing(mihomo=enabled_mihomo()))
        legacy = yaml.safe_load(self.fetch("Clash/1.18.0").body)
        explicit_legacy = yaml.safe_load(self.fetch("CustomApp/1.0", "clash").body)
        unknown = self.decoded(self.fetch("UnknownClient/1.0"))
        for loaded in (legacy, explicit_legacy):
            self.assertEqual(loaded["mode"], "Global")
            self.assertNotIn("geodata-mode", loaded)
        self.assertNotIn("routing/onadd", unknown)
        self.assertNotIn("routing", self.fetch("UnknownClient/1.0").headers)

    def test_invalid_template_becomes_503_without_template_text(self):
        crud.update_client_routing_settings(self.db, routing(mihomo=enabled_mihomo()))
        sentinel = "secret-template-should-not-leak"
        with self.assertRaises(HTTPException) as caught:
            subscription._with_mihomo_routing(self.db, f"[{sentinel}]")
        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(caught.exception.detail, "Unable to apply client routing to the subscription template")
        self.assertNotIn(sentinel, caught.exception.detail)

    def assert_mihomo(self, loaded, group_name):
        self.assertEqual(loaded["mode"], "rule")
        self.assertIs(loaded["geodata-mode"], True)
        self.assertEqual(loaded["geox-url"]["geosite"], MihomoRoutingProfile().geosite_url)
        names = [item["name"] for item in loaded["proxies"]]
        self.assertIn("Node alice" if group_name == "Marzban Routing" else "Marzban Routing", names)
        self.assertIn(PASSWORD, json.dumps(loaded["proxies"]))
        groups = [item["name"] for item in loaded["proxy-groups"]]
        self.assertIn("♻️ Automatic", groups)
        self.assertIn(group_name, groups)
        self.assertEqual(loaded["rules"], [
            f"DOMAIN,ads.example.com,REJECT",
            f"DOMAIN-SUFFIX,example.com,DIRECT",
            f"GEOSITE,CN,DIRECT",
            f"GEOIP,cn,DIRECT",
            f"IP-CIDR,2001:db8::1/128,REJECT",
            f"MATCH,{group_name}",
        ])
        self.assertTrue(all("no-resolve" not in rule for rule in loaded["rules"]))


class MigrationTests(unittest.TestCase):
    def test_upgrade_and_downgrade_preserve_user_and_hwid_rows(self):
        engine = create_engine("sqlite:///:memory:")
        self.addCleanup(engine.dispose)
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR(34))"))
            connection.execute(text("INSERT INTO users VALUES (1, 'alice')"))
            connection.execute(text(
                "CREATE TABLE hwid_user_devices (id INTEGER PRIMARY KEY, hwid VARCHAR(64), user_id INTEGER)"
            ))
            connection.execute(text("INSERT INTO hwid_user_devices VALUES (1, 'device-123456', 1)"))
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
                self.assertIn("client_routing_settings", inspect(connection).get_table_names())
                self.assertEqual(connection.execute(text("SELECT COUNT(*) FROM client_routing_settings")).scalar(), 0)
                migration.downgrade()
            self.assertNotIn("client_routing_settings", inspect(connection).get_table_names())
            self.assertEqual(connection.execute(text("SELECT username FROM users")).scalar(), "alice")
            self.assertEqual(connection.execute(text("SELECT hwid FROM hwid_user_devices")).scalar(), "device-123456")


if __name__ == "__main__":
    unittest.main()
