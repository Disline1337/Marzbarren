import base64
import json
from typing import Literal

import yaml

from app.models.client_routing import HappRoutingProfile, MihomoRoutingProfile

ROUTING_PROFILE_NAME = "Marzban Routing"
_MIHOMO_RULE_TYPES = {
    "domain": "DOMAIN",
    "domain_suffix": "DOMAIN-SUFFIX",
    "geosite": "GEOSITE",
    "geoip": "GEOIP",
    "ip_cidr": "IP-CIDR",
}
_MIHOMO_TARGETS = {
    "direct": "DIRECT",
    "block": "REJECT",
}


def build_routing_link(
    profile: HappRoutingProfile,
    updated_at: int,
    client: Literal["happ", "incy"],
) -> str:
    payload = {
        "Name": ROUTING_PROFILE_NAME,
        "GlobalProxy": "true" if profile.default_action == "proxy" else "false",
        "LastUpdated": str(updated_at),
        "DomainStrategy": profile.domain_strategy,
        "Geoipurl": profile.geoip_url,
        "Geositeurl": profile.geosite_url,
        "DirectSites": list(profile.direct_sites),
        "DirectIp": list(profile.direct_ips),
        "ProxySites": list(profile.proxy_sites),
        "ProxyIp": list(profile.proxy_ips),
        "BlockSites": list(profile.block_sites),
        "BlockIp": list(profile.block_ips),
    }
    encoded = base64.b64encode(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")
    return f"{client}://routing/onadd/{encoded}"


def _mapping(value, label: str) -> dict:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a mapping")
    return dict(value)


def _string_name(value, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} name must be a string")
    return value


def _routing_group_name(occupied: set[str]) -> str:
    if ROUTING_PROFILE_NAME not in occupied:
        return ROUTING_PROFILE_NAME
    suffix = 2
    while f"{ROUTING_PROFILE_NAME} {suffix}" in occupied:
        suffix += 1
    return f"{ROUTING_PROFILE_NAME} {suffix}"


def _target(action: str, group_name: str) -> str:
    if action == "proxy":
        return group_name
    return _MIHOMO_TARGETS[action]


def apply_mihomo_routing(config: str, profile: MihomoRoutingProfile) -> str:
    if not profile.enabled:
        return config
    try:
        loaded = yaml.safe_load(config)
    except yaml.YAMLError as exc:
        raise ValueError("subscription template is not valid YAML") from exc
    if not isinstance(loaded, dict):
        raise ValueError("subscription template must be a mapping")

    proxies = loaded.get("proxies", [])
    if not isinstance(proxies, list):
        raise ValueError("proxies must be a list")
    groups = loaded.get("proxy-groups", [])
    if not isinstance(groups, list):
        raise ValueError("proxy-groups must be a list")

    occupied = set()
    proxy_names = []
    for proxy in proxies:
        if not isinstance(proxy, dict):
            raise ValueError("proxy must be a mapping")
        name = _string_name(proxy.get("name"), "proxy")
        if name in occupied:
            raise ValueError("proxy names must be unique")
        occupied.add(name)
        proxy_names.append(name)
    for group in groups:
        if not isinstance(group, dict):
            raise ValueError("proxy group must be a mapping")
        occupied.add(_string_name(group.get("name"), "proxy group"))

    group_name = _routing_group_name(occupied)
    loaded["proxy-groups"] = list(groups) + [{
        "name": group_name,
        "type": "select",
        "proxies": proxy_names or ["REJECT"],
    }]
    loaded["mode"] = "rule"
    loaded["geodata-mode"] = True
    geox = _mapping(loaded.get("geox-url"), "geox-url")
    geox["geoip"] = profile.geoip_url
    geox["geosite"] = profile.geosite_url
    loaded["geox-url"] = geox
    loaded["rules"] = [
        f"{_MIHOMO_RULE_TYPES[rule.type]},{rule.value},{_target(rule.action, group_name)}"
        for rule in profile.rules
    ] + [f"MATCH,{_target(profile.default_action, group_name)}"]
    return yaml.safe_dump(loaded, sort_keys=False, allow_unicode=True)
