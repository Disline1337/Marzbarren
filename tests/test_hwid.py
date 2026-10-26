import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.requests import Request
from alembic.migration import MigrationContext
from alembic.operations import Operations

from tests.hwid_support import Base, HwidUserDevice, User, crud, load_file
from app.models.hwid import HwidDeviceCreate
from app.models.user import UserModify
from app.utils.hwid import HwidCheckResult, HwidHeaders, extract_hwid_headers, hwid_response_headers

subscription = load_file("tests.subscription_router", "app/routers/subscription.py")
migration = load_file(
    "tests.hwid_migration",
    "app/db/migrations/versions/a1b2c3d4e5f6_add_hwid_device_limit.py",
)


def request(**headers):
    return Request({
        "type": "http", "method": "GET", "path": "/sub/token",
        "headers": [(key.replace("_", "-").encode(), value.encode()) for key, value in headers.items()],
        "client": ("127.0.0.1", 1234),
    })


class HeaderTests(unittest.TestCase):
    def test_valid_header_and_metadata(self):
        result = extract_hwid_headers(request(
            x_hwid=" device-123456 ", x_device_os="Android", x_ver_os="14", x_device_model="Pixel"
        ))
        self.assertEqual(result, HwidHeaders("device-123456", "Android", "14", "Pixel"))

    def test_missing_and_invalid_identifiers(self):
        for value in ("", "short", "a" * 65, "device_123456", "device/123456"):
            with self.subTest(value=value):
                self.assertIsNone(extract_hwid_headers(request(x_hwid=value)))
        self.assertIsNone(extract_hwid_headers(request()))

    def test_identifier_boundaries(self):
        for value in ("a" * 10, "a" * 64, "a=-12345678"):
            with self.subTest(value=value):
                self.assertEqual(extract_hwid_headers(request(x_hwid=value)).hwid, value)

    def test_status_headers(self):
        self.assertEqual(hwid_response_headers(HwidCheckResult(True, False, False, True)), {})
        self.assertEqual(hwid_response_headers(HwidCheckResult(True, False, False, False)),
                         {"x-hwid-active": "true"})
        headers = hwid_response_headers(HwidCheckResult(False, True, False, False), "Limit reached")
        self.assertEqual(headers["x-hwid-max-devices-reached"], "true")
        self.assertEqual(headers["x-hwid-limit"], "true")
        self.assertEqual(headers["announce"], "Limit reached")
        headers = hwid_response_headers(HwidCheckResult(False, False, True, False))
        self.assertEqual(headers["x-hwid-not-supported"], "true")
        self.assertNotIn("x-hwid-max-devices-reached", headers)

    def test_admin_input_validation(self):
        for value in ("short", "a" * 65, "device_123456"):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                HwidDeviceCreate(hwid=value)
        with self.assertRaises(ValidationError):
            UserModify(hwid_device_limit=-1)


class DeviceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)
        self.user = User(username="alice", hwid_device_limit=1)
        self.other = User(username="bob", hwid_device_limit=1)
        self.db.add_all([self.user, self.other])
        self.db.commit()

    def register(self, hwid="device-123456", user=None, **metadata):
        return crud.check_and_register_hwid(self.db, user or self.user, HwidHeaders(hwid, **metadata))

    def test_first_device_registered(self):
        self.assertTrue(self.register().subscription_allowed)
        self.assertEqual(crud.count_user_hwid_devices(self.db, self.user.id), 1)

    def test_second_device_rejected_at_limit(self):
        self.register()
        result = self.register("device-234567")
        self.assertFalse(result.subscription_allowed)
        self.assertTrue(result.max_device_reached)
        self.assertEqual(crud.count_user_hwid_devices(self.db, self.user.id), 1)

    def test_existing_device_refreshes_metadata_at_limit(self):
        self.register(platform="Android", device_model="Pixel")
        result = self.register(platform="iOS")
        device = crud.get_user_hwid_device(self.db, self.user.id, "device-123456")
        self.assertTrue(result.subscription_allowed)
        self.assertEqual(device.platform, "iOS")
        self.assertEqual(device.device_model, "Pixel")
        self.assertEqual(crud.count_user_hwid_devices(self.db, self.user.id), 1)

    def test_missing_hwid_rejected(self):
        result = crud.check_and_register_hwid(self.db, self.user, None)
        self.assertFalse(result.subscription_allowed)
        self.assertTrue(result.hwid_not_supported)

    def test_zero_limit_bypasses_missing_header_and_tracks_devices(self):
        self.user.hwid_device_limit = 0
        self.db.commit()
        self.assertTrue(crud.check_and_register_hwid(self.db, self.user, None).limit_bypassed)
        self.assertTrue(self.register().subscription_allowed)
        self.assertTrue(self.register("device-234567").subscription_allowed)
        self.assertEqual(crud.count_user_hwid_devices(self.db, self.user.id), 2)

    def test_null_limit_uses_fallback(self):
        self.user.hwid_device_limit = None
        self.db.commit()
        with patch.object(crud, "HWID_FALLBACK_DEVICE_LIMIT", 2):
            self.assertTrue(self.register().subscription_allowed)
            self.assertTrue(self.register("device-234567").subscription_allowed)
            self.assertFalse(self.register("device-345678").subscription_allowed)

    def test_device_limits_are_per_user(self):
        self.register()
        self.assertTrue(self.register(user=self.other).subscription_allowed)

    def test_delete_frees_slot(self):
        self.register()
        self.assertTrue(crud.delete_user_hwid_device(self.db, self.user.id, "device-123456"))
        self.assertFalse(crud.delete_user_hwid_device(self.db, self.user.id, "device-123456"))
        self.assertTrue(self.register("device-234567").subscription_allowed)

    def test_delete_all_does_not_touch_other_user(self):
        self.register()
        self.register(user=self.other)
        self.assertEqual(crud.delete_all_user_hwid_devices(self.db, self.user.id), 1)
        self.assertEqual(crud.count_user_hwid_devices(self.db, self.other.id), 1)

    def test_database_prevents_duplicate_pair(self):
        self.register()
        self.db.add(HwidUserDevice(user_id=self.user.id, hwid="device-123456"))
        with self.assertRaises(IntegrityError):
            self.db.commit()
        self.db.rollback()

    def test_deleting_user_removes_devices(self):
        self.register()
        self.db.delete(self.user)
        self.db.commit()
        self.assertEqual(self.db.query(HwidUserDevice).count(), 0)

    def test_disabled_feature_does_not_register(self):
        with patch.object(subscription, "HWID_ENABLED", False):
            self.assertIsNone(subscription.enforce_hwid(request(x_hwid="device-123456"), self.db, self.user))
        self.assertEqual(crud.count_user_hwid_devices(self.db, self.user.id), 0)

    def test_enabled_feature_rejects_missing_hwid_with_404(self):
        with patch.object(subscription, "HWID_ENABLED", True), self.assertRaises(HTTPException) as caught:
            subscription.enforce_hwid(request(), self.db, self.user)
        self.assertEqual(caught.exception.status_code, 404)
        self.assertEqual(caught.exception.headers["x-hwid-not-supported"], "true")

    def test_enabled_feature_records_ip_and_rejects_excess_device(self):
        with patch.object(subscription, "HWID_ENABLED", True):
            subscription.enforce_hwid(request(x_hwid="device-123456"), self.db, self.user)
            with self.assertRaises(HTTPException) as caught:
                subscription.enforce_hwid(request(x_hwid="device-234567"), self.db, self.user)
        self.assertEqual(caught.exception.status_code, 404)
        self.assertEqual(caught.exception.headers["x-hwid-max-devices-reached"], "true")
        device = crud.get_user_hwid_device(self.db, self.user.id, "device-123456")
        self.assertEqual(device.request_ip, "127.0.0.1")

    def test_browser_page_hides_links_without_registering(self):
        user = MagicMock()
        user.links = ["vless://secret"]
        with patch.object(subscription, "HWID_ENABLED", True), \
                patch.object(subscription.UserResponse, "model_validate", return_value=user), \
                patch.object(subscription, "render_template", return_value="hidden") as render:
            response = subscription.user_subscription(
                request(accept="text/html,application/xhtml+xml"), self.db, self.user, user_agent="")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.body, b"hidden")
        self.assertEqual(user.links, [])
        self.assertTrue(render.call_args[0][1]["links_hidden"])
        self.assertEqual(crud.count_user_hwid_devices(self.db, self.user.id), 0)

    def test_accept_listing_html_still_enforces(self):
        user = MagicMock()
        user.links = ["vless://secret"]
        with patch.object(subscription, "HWID_ENABLED", True), \
                patch.object(subscription.UserResponse, "model_validate", return_value=user), \
                self.assertRaises(HTTPException) as caught:
            subscription.user_subscription(
                request(accept="application/json, text/html"), self.db, self.user, user_agent="")
        self.assertEqual(caught.exception.status_code, 404)
        self.assertEqual(caught.exception.headers["x-hwid-not-supported"], "true")
        self.assertEqual(user.links, ["vless://secret"])

    def test_html_preference_is_the_first_accept_token(self):
        self.assertTrue(subscription.prefers_html(request(accept="text/html;q=1")))
        self.assertFalse(subscription.prefers_html(request(accept="*/*")))
        self.assertFalse(subscription.prefers_html(request(accept="application/json, text/html")))


class MigrationTests(unittest.TestCase):
    def test_upgrade_and_downgrade_preserve_existing_user(self):
        engine = create_engine("sqlite:///:memory:")
        self.addCleanup(engine.dispose)
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR(34))"))
            connection.execute(text("INSERT INTO users VALUES (1, 'alice')"))
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
                self.assertIn("hwid_user_devices", inspect(connection).get_table_names())
                self.assertIsNone(connection.execute(text("SELECT hwid_device_limit FROM users")).scalar())
                migration.downgrade()
            self.assertNotIn("hwid_user_devices", inspect(connection).get_table_names())
            self.assertNotIn("hwid_device_limit", [c["name"] for c in inspect(connection).get_columns("users")])
            self.assertEqual(connection.execute(text("SELECT username FROM users")).scalar(), "alice")


if __name__ == "__main__":
    unittest.main()
