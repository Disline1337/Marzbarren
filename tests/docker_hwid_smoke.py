"""HTTP checks for a disposable Docker instance with HWID_ENABLED=true.

Run inside the test container: python tests/docker_hwid_smoke.py
Uses SUDO_USERNAME/SUDO_PASSWORD from its environment, never prints tokens.
Creates temporary users and removes them on completion, including failures.
"""
from concurrent.futures import ThreadPoolExecutor
import os
import secrets
from threading import Barrier
from urllib.parse import urlsplit

import requests


def main():
    base = "http://127.0.0.1:8000"
    response = requests.post(base + "/api/admin/token", data={
        "username": os.environ["SUDO_USERNAME"],
        "password": os.environ["SUDO_PASSWORD"],
    }, timeout=15)
    assert response.status_code == 200, f"Login: {response.status_code}"
    admin = {"Authorization": "Bearer " + response.json()["access_token"]}
    users = []
    checks = 0

    def check(condition, label):
        nonlocal checks
        assert condition, label
        checks += 1
        print("PASS", label, flush=True)

    def api(method, path, expected=200, **kwargs):
        result = requests.request(method, base + "/api" + path, headers=admin, timeout=30, **kwargs)
        assert result.status_code == expected, f"{method} {path}: {result.status_code}"
        return result.json()

    def create(limit):
        username = "hwidtest_" + secrets.token_hex(5)
        user = api("POST", "/user", json={
            "username": username, "proxies": {"shadowsocks": {}}, "hwid_device_limit": limit,
        })
        users.append(username)
        return username, urlsplit(user["subscription_url"]).path

    def sub(path, hwid=None, **kwargs):
        headers = {"User-Agent": "Happ/1.0", "Accept": "text/plain"}
        if hwid is not None:
            headers["x-hwid"] = hwid
        return requests.get(base + path, headers=headers, timeout=30, **kwargs)

    try:
        user, path = create(1)
        devices = f"/user/{user}/hwid/devices"
        check(requests.get(base + "/api" + devices, timeout=10).status_code == 401,
              "Device API requires authentication")
        missing = sub(path)
        check(missing.status_code == 404 and missing.headers.get("x-hwid-not-supported") == "true",
              "Missing HWID rejected")
        check(sub(path, "short").status_code == 404, "Invalid HWID rejected")
        check(sub(path, "device-123456").status_code == 200, "First device accepted")
        check(sub(path, "device-123456").status_code == 200, "Existing device accepted at limit")
        excess = sub(path, "device-234567")
        check(excess.status_code == 404 and excess.headers.get("x-hwid-max-devices-reached") == "true",
              "Excess device rejected with status header")
        check(api("GET", devices)["total"] == 1, "One stored device")
        check(sub(path + "/info").status_code == 404, "Info endpoint requires HWID")
        check(sub(path + "/info", "device-123456").status_code == 200, "Info accepts known device")
        check(sub(path + "/v2ray", "device-234567").status_code == 404,
              "Explicit subscription format enforces limit")
        api("DELETE", devices + "/device-123456")
        check(sub(path, "device-234567").status_code == 200, "Deleting device frees slot")
        api("PUT", f"/user/{user}", json={"hwid_device_limit": 0})
        check(sub(path).status_code == 200, "Zero limit permits clients without HWID")
        api("PUT", f"/user/{user}", json={"hwid_device_limit": None})
        check(api("GET", f"/user/{user}")["hwid_device_limit"] is None, "Explicit null clears override")
        api("DELETE", devices)
        api("POST", devices, json={"hwid": "manual-123456"})
        api("POST", devices, expected=409, json={"hwid": "manual-123456"})
        check(api("GET", devices)["total"] == 1, "Admin registration rejects duplicate")

        race_user, race_path = create(1)
        race_devices = f"/user/{race_user}/hwid/devices"
        rounds = int(os.environ.get("HWID_RACE_ROUNDS", "20"))
        for iteration in range(rounds):
            api("DELETE", race_devices)
            barrier = Barrier(8)

            def register(index):
                hwid = f"race-{iteration:03d}-{index:04d}"
                barrier.wait(timeout=15)
                return hwid, sub(race_path, hwid).status_code

            with ThreadPoolExecutor(max_workers=8) as pool:
                results = list(pool.map(register, range(8)))
            successful = {hwid for hwid, status in results if status == 200}
            stored = {device["hwid"] for device in api("GET", race_devices)["devices"]}
            assert all(status in (200, 404) for _, status in results), f"Race HTTP statuses: {results}"
            assert len(successful) == 1 and successful == stored, (
                f"Race round {iteration}: allowed={len(successful)}, stored={len(stored)}, "
                f"allowed_matches_stored={successful == stored}"
            )
        check(True, f"{rounds} concurrent rounds: exactly one accepted and stored device at limit 1")
        api("DELETE", race_devices)
        with ThreadPoolExecutor(max_workers=8) as pool:
            statuses = list(pool.map(lambda _: sub(race_path, "same-device-1234").status_code, range(8)))
        check(statuses == [200] * 8 and api("GET", race_devices)["total"] == 1,
              "Concurrent requests from the same device are idempotent")
        print(f"HTTP checks passed: {checks}")
    finally:
        failures = []
        for username in users:
            result = requests.delete(base + "/api/user/" + username, headers=admin, timeout=30)
            if result.status_code != 200:
                failures.append(f"{username}: {result.status_code}")
        assert not failures, f"User deletion failed: {failures}"
        print("PASS User deletion (including users without a database admin)", flush=True)


if __name__ == "__main__":
    main()
