"""HTTP checks for a disposable Docker instance with client routing enabled.

Run inside the test container: python tests/docker_routing_smoke.py
Uses SUDO_USERNAME/SUDO_PASSWORD from its environment and never prints tokens,
passwords, subscription URLs, or proxy credentials.
"""
import base64
import json
import os
import secrets
from urllib.parse import urlsplit

import requests
import yaml


def main():
    base = "http://127.0.0.1:8000"
    response = requests.post(base + "/api/admin/token", data={
        "username": os.environ["SUDO_USERNAME"],
        "password": os.environ["SUDO_PASSWORD"],
    }, timeout=20)
    assert response.status_code == 200, f"Login: {response.status_code}"
    sudo = {"Authorization": "Bearer " + response.json()["access_token"]}
    users = []
    admins = []
    checks = 0

    def check(condition, label):
        nonlocal checks
        assert condition, label
        checks += 1
        print("PASS", label, flush=True)

    def api(method, path, expected=200, headers=None, **kwargs):
        result = requests.request(
            method, base + "/api" + path, headers=headers if headers is not None else sudo,
            timeout=30, **kwargs,
        )
        assert result.status_code == expected, f"{method} {path}: {result.status_code}"
        if result.content and "application/json" in result.headers.get("content-type", ""):
            return result.json()
        return result

    def create(limit):
        username = "routetest_" + secrets.token_hex(5)
        user = api("POST", "/user", json={
            "username": username,
            "proxies": {"shadowsocks": {}},
            "hwid_device_limit": limit,
        })
        users.append(username)
        return username, urlsplit(user["subscription_url"]).path

    def sub(path, user_agent, hwid="routing-device-12345", accept="*/*"):
        headers = {"User-Agent": user_agent, "Accept": accept}
        if hwid is not None:
            headers["x-hwid"] = hwid
        return requests.get(base + path, headers=headers, timeout=30)

    def routing_profile(body, scheme):
        text = base64.b64decode(body).decode("utf-8")
        line = text.splitlines()[0]
        prefix = f"{scheme}://routing/onadd/"
        assert line.startswith(prefix), "routing link missing"
        profile = json.loads(base64.b64decode(line[len(prefix):]))
        return profile, text

    try:
        anonymous = requests.get(base + "/api/client-routing", timeout=15)
        check(anonymous.status_code == 401, "Anonymous routing settings rejected")
        defaults = api("GET", "/client-routing")
        check("happ" in defaults and "mihomo" in defaults, "Settings endpoint returns both profiles")
        api("PUT", "/client-routing", json={
            "happ": {**defaults["happ"], "enabled": False},
            "mihomo": {**defaults["mihomo"], "enabled": False},
        })
        plain_name = "routeplain_" + secrets.token_hex(4)
        plain_password = secrets.token_hex(12)
        api("POST", "/admin", json={
            "username": plain_name, "password": plain_password, "is_sudo": False,
        })
        admins.append(plain_name)
        plain_token = requests.post(base + "/api/admin/token", data={
            "username": plain_name, "password": plain_password,
        }, timeout=15)
        assert plain_token.status_code == 200, f"Plain login: {plain_token.status_code}"
        plain = {"Authorization": "Bearer " + plain_token.json()["access_token"]}
        denied_get = requests.get(base + "/api/client-routing", headers=plain, timeout=15)
        check(denied_get.status_code == 403, "Non-sudo GET rejected")
        denied = requests.put(base + "/api/client-routing", headers=plain, json=defaults, timeout=15)
        check(denied.status_code == 403, "Non-sudo PUT rejected")

        user, path = create(1)
        template = sub(path, "koala-clash/1.0.0")
        check(template.status_code == 200 and template.headers["content-type"].startswith("text/yaml"),
              "Disabled Koala response is YAML")
        template_doc = yaml.safe_load(template.content)
        check(template_doc.get("mode") == "Global", "Disabled Mihomo keeps template mode")

        enabled = {
            "happ": {
                **defaults["happ"],
                "enabled": True,
                "default_action": "proxy",
                "direct_sites": ["example.com", "geosite:cn"],
                "direct_ips": ["geoip:cn"],
                "block_sites": ["ads.example.com"],
            },
            "mihomo": {
                **defaults["mihomo"],
                "enabled": True,
                "default_action": "proxy",
                "rules": [
                    {"type": "domain", "value": "ads.example.com", "action": "block"},
                    {"type": "domain_suffix", "value": "example.com", "action": "direct"},
                    {"type": "geosite", "value": "cn", "action": "direct"},
                    {"type": "geoip", "value": "cn", "action": "direct"},
                ],
            },
        }
        saved = api("PUT", "/client-routing", json=enabled)
        first_stamp = saved["happ_updated_at"]
        check(first_stamp > 0, "Enabled Happ profile gets a stamp")

        happ = sub(path, "Happ/1.63.1")
        check(happ.status_code == 200 and happ.headers["content-type"].startswith("text/plain"),
              "Happ response is plain text")
        profile, _text = routing_profile(happ.content, "happ")
        check(profile["Name"] == "Marzban Routing" and profile["GlobalProxy"] == "true"
              and isinstance(profile["GlobalProxy"], str), "Happ routing profile shape")
        check(profile["DirectSites"] == ["example.com", "geosite:cn"]
              and profile["DirectIp"] == ["geoip:cn"]
              and profile["BlockSites"] == ["ads.example.com"], "Happ routing lists")
        incy = sub(path, "INCY/1.0.0/Android")
        incy_profile, _incy_text = routing_profile(incy.content, "incy")
        check(incy_profile["DirectSites"] == ["example.com", "geosite:cn"], "INCY routing profile")

        for agent in ("koala-clash/1.0.0", "mihomo.party/v1.0.0 (clash.meta)"):
            loaded = yaml.safe_load(sub(path, agent).content)
            check(loaded["mode"] == "rule" and loaded["geodata-mode"] is True, f"{agent} rule mode")
            check(loaded["rules"] == [
                "DOMAIN,ads.example.com,REJECT",
                "DOMAIN-SUFFIX,example.com,DIRECT",
                "GEOSITE,cn,DIRECT",
                "GEOIP,cn,DIRECT",
                "MATCH,Marzban Routing",
            ], f"{agent} panel rule order")
            group = next(item for item in loaded["proxy-groups"] if item["name"] == "Marzban Routing")
            if not loaded.get("proxies"):
                check(group["proxies"] == ["REJECT"], f"{agent} empty proxies stay REJECT")
            check(any(item.get("name") == "♻️ Automatic" for item in loaded["proxy-groups"]),
                  f"{agent} keeps template group")

        explicit = yaml.safe_load(sub(path + "/clash-meta", "CustomApp/1.0").content)
        check(explicit["mode"] == "rule" and explicit["rules"][-1] == "MATCH,Marzban Routing",
              "Explicit clash-meta applies routing")
        legacy = yaml.safe_load(sub(path + "/clash", "Clash/1.0").content)
        check(legacy.get("mode") == "Global" and "GEOSITE" not in "\n".join(map(str, legacy.get("rules") or [])),
              "Legacy clash is unchanged")
        v2ray_json = sub(path + "/v2ray-json", "Happ/1.63.1")
        check(v2ray_json.status_code == 200 and v2ray_json.headers["content-type"].startswith("application/json"),
              "Explicit v2ray-json stays JSON")
        check("routing" not in v2ray_json.headers and b"happ://routing" not in v2ray_json.content,
              "Explicit v2ray-json has no routing profile")
        missing = sub(path, "Happ/1.63.1", hwid=None)
        check(missing.status_code == 404 and b"routing/onadd" not in missing.content
              and "routing" not in missing.headers, "Missing HWID hides routing")
        page = sub(path, "Mozilla/5.0", hwid=None, accept="text/html")
        check(page.status_code == 200 and b"ss://" not in page.content and b"routing/onadd" not in page.content,
              "HTML without HWID hides links")

        changed = json.loads(json.dumps(enabled))
        changed["happ"]["direct_sites"] = ["changed.example"]
        changed["mihomo"]["rules"] = [
            {"type": "geosite", "value": "cn", "action": "direct"},
            {"type": "domain", "value": "ads.example.com", "action": "block"},
        ]
        updated = api("PUT", "/client-routing", json=changed)
        check(updated["happ_updated_at"] > first_stamp, "Happ stamp increases")
        refreshed, _text = routing_profile(sub(path, "Happ/1.63.1").content, "happ")
        check(refreshed["DirectSites"] == ["changed.example"]
              and int(refreshed["LastUpdated"]) == updated["happ_updated_at"], "Updated Happ payload")
        reordered = yaml.safe_load(sub(path, "koala-clash/1.0.0").content)
        check(reordered["rules"][:2] == ["GEOSITE,cn,DIRECT", "DOMAIN,ads.example.com,REJECT"],
              "Updated Mihomo order")

        bad = json.loads(json.dumps(changed))
        bad["happ"]["direct_ips"] = ["10.0.0.0/99"]
        rejected = requests.put(base + "/api/client-routing", headers=sudo, json=bad, timeout=15)
        check(rejected.status_code == 422, "Invalid CIDR rejected")
        kept = api("GET", "/client-routing")
        check(kept["happ"]["direct_sites"] == ["changed.example"], "Rejected save keeps previous lists")

        disabled = json.loads(json.dumps(kept))
        disabled["happ"]["enabled"] = False
        disabled["mihomo"]["enabled"] = False
        disabled.pop("happ_updated_at", None)
        api("PUT", "/client-routing", json=disabled)
        off = sub(path, "Happ/1.63.1")
        incy_off = sub(path, "INCY/1.0.0/Android")
        check(off.headers.get("routing") == "happ://routing/off"
              and incy_off.headers.get("routing") == "incy://routing/off", "Disabled profiles send off")
        restored = yaml.safe_load(sub(path, "koala-clash/1.0.0").content)
        check(restored.get("mode") == "Global" and "geodata-mode" not in restored,
              "Disabled Mihomo returns template mode")
        print(f"HTTP checks passed: {checks}")
    finally:
        for username in users:
            requests.delete(base + "/api/user/" + username, headers=sudo, timeout=15)
        for username in admins:
            requests.delete(base + "/api/admin/" + username, headers=sudo, timeout=15)


if __name__ == "__main__":
    main()
