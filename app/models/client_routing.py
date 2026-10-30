import ipaddress
import re
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

HappDefaultAction = Literal["proxy", "direct"]
MihomoAction = Literal["proxy", "direct", "block"]
DomainStrategy = Literal["AsIs", "IPIfNonMatch", "IPOnDemand"]
MihomoRuleType = Literal["domain", "domain_suffix", "geosite", "geoip", "ip_cidr"]

DEFAULT_HAPP_GEOIP_URL = (
    "https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat"
)
DEFAULT_HAPP_GEOSITE_URL = (
    "https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat"
)
DEFAULT_MIHOMO_GEOIP_URL = (
    "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat"
)
DEFAULT_MIHOMO_GEOSITE_URL = (
    "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat"
)

_GEO_TAG = re.compile(r"^[A-Za-z0-9_-]+(?:@[A-Za-z0-9_-]+)?$")
_DOMAIN_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
_GEO_PREFIX = {"geosite": "geosite", "geoip": "geoip"}


def normalize_geo_url(value: str) -> str:
    item = value.strip()
    if not item or any(char.isspace() for char in item):
        raise ValueError("geo file URL must be an absolute http or https URL")
    parts = urlsplit(item)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("geo file URL must be an absolute http or https URL")
    if parts.username or parts.password:
        raise ValueError("geo file URL must not include credentials")
    if parts.fragment:
        raise ValueError("geo file URL must not include a fragment")
    return item


def _geo_entry(value: str, prefix: str) -> str | None:
    head, separator, tag = value.partition(":")
    if not separator or head.lower() != prefix:
        return None
    if not _GEO_TAG.fullmatch(tag):
        raise ValueError(f"invalid {prefix} tag")
    return f"{_GEO_PREFIX[prefix]}:{tag}"


def _ascii_domain(value: str) -> str:
    if any(char.isspace() for char in value) or any(char in value for char in "\\/*?#@,"):
        raise ValueError("invalid domain")
    item = value[:-1] if value.endswith(".") else value
    if not item or item.endswith(".") or item.startswith("."):
        raise ValueError("invalid domain")
    try:
        ascii_domain = item.encode("idna").decode("ascii").lower()
    except UnicodeError as exc:
        raise ValueError("invalid domain") from exc
    labels = ascii_domain.split(".")
    if not labels or any(not _DOMAIN_LABEL.fullmatch(label) for label in labels):
        raise ValueError("invalid domain")
    if len(ascii_domain) > 253:
        raise ValueError("invalid domain")
    try:
        ipaddress.ip_address(ascii_domain)
    except ValueError:
        return ascii_domain
    raise ValueError("IP addresses belong in the IP list")


def _domain_zone(value: str) -> str:
    item = value.strip()
    if item.startswith("*."):
        item = item[2:]
    elif item.startswith("."):
        item = item[1:]
    return _ascii_domain(item)


def normalize_happ_site(value: str) -> str:
    item = value.strip()
    if not item:
        raise ValueError("empty routing entry")
    geo = _geo_entry(item, "geosite")
    if geo is not None:
        return geo
    prefix, separator, remainder = item.partition(":")
    if separator:
        kind = prefix.lower()
        if kind == "domain":
            return f"domain:{_ascii_domain(remainder)}"
        if kind == "full":
            return f"full:{_ascii_domain(remainder)}"
        raise ValueError("invalid domain")
    if item.startswith("*.") or item.startswith("."):
        return f"domain:{_domain_zone(item)}"
    return _ascii_domain(item)


def normalize_domain(value: str) -> str:
    item = value.strip()
    if not item:
        raise ValueError("empty routing entry")
    if ":" in item:
        raise ValueError("invalid domain")
    if item.startswith("*.") or item.startswith("."):
        return _domain_zone(item)
    return _ascii_domain(item)



def _normalize_ip(value: str, host_prefix: bool) -> str:
    if "/" in value:
        try:
            network = ipaddress.ip_network(value, strict=False)
        except ValueError as exc:
            raise ValueError("invalid IP network") from exc
        return str(network)
    try:
        address = ipaddress.ip_address(value)
    except ValueError as exc:
        raise ValueError("invalid IP address") from exc
    if not host_prefix:
        return str(address)
    return str(ipaddress.ip_network((address, address.max_prefixlen), strict=False))


def normalize_happ_ip(value: str) -> str:
    item = value.strip()
    if not item:
        raise ValueError("empty routing entry")
    geo = _geo_entry(item, "geoip")
    if geo is not None:
        return geo
    return _normalize_ip(item, host_prefix=False)


def normalize_ip_cidr(value: str) -> str:
    item = value.strip()
    if not item:
        raise ValueError("empty routing entry")
    return _normalize_ip(item, host_prefix=True)



def dedupe(items: list[str]) -> list[str]:
    seen = set()
    result = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def _reject_overlap(items: list[str], previous: list[str]) -> None:
    conflicts = [item for item in items if item in set(previous)]
    if conflicts:
        raise ValueError(f"{conflicts[0]} is listed under more than one action")


class HappRoutingProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = False
    default_action: HappDefaultAction = "proxy"
    domain_strategy: DomainStrategy = "IPIfNonMatch"
    geoip_url: str = DEFAULT_HAPP_GEOIP_URL
    geosite_url: str = DEFAULT_HAPP_GEOSITE_URL
    direct_sites: list[str] = Field(default_factory=list)
    direct_ips: list[str] = Field(default_factory=list)
    proxy_sites: list[str] = Field(default_factory=list)
    proxy_ips: list[str] = Field(default_factory=list)
    block_sites: list[str] = Field(default_factory=list)
    block_ips: list[str] = Field(default_factory=list)

    @field_validator("geoip_url", "geosite_url")
    @classmethod
    def validate_geo_urls(cls, value: str) -> str:
        return normalize_geo_url(value)

    @field_validator("direct_sites", "proxy_sites", "block_sites")
    @classmethod
    def validate_sites(cls, value: list[str]) -> list[str]:
        return dedupe([normalize_happ_site(item) for item in value])

    @field_validator("direct_ips", "proxy_ips", "block_ips")
    @classmethod
    def validate_ips(cls, value: list[str]) -> list[str]:
        return dedupe([normalize_happ_ip(item) for item in value])

    @field_validator("proxy_sites")
    @classmethod
    def proxy_sites_are_disjoint(cls, value: list[str], info: ValidationInfo) -> list[str]:
        _reject_overlap(value, info.data.get("direct_sites", []))
        return value

    @field_validator("block_sites")
    @classmethod
    def block_sites_are_disjoint(cls, value: list[str], info: ValidationInfo) -> list[str]:
        _reject_overlap(value, info.data.get("direct_sites", []))
        _reject_overlap(value, info.data.get("proxy_sites", []))
        return value

    @field_validator("proxy_ips")
    @classmethod
    def proxy_ips_are_disjoint(cls, value: list[str], info: ValidationInfo) -> list[str]:
        _reject_overlap(value, info.data.get("direct_ips", []))
        return value

    @field_validator("block_ips")
    @classmethod
    def block_ips_are_disjoint(cls, value: list[str], info: ValidationInfo) -> list[str]:
        _reject_overlap(value, info.data.get("direct_ips", []))
        _reject_overlap(value, info.data.get("proxy_ips", []))
        return value


class MihomoRoutingRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: MihomoRuleType
    value: str
    action: MihomoAction

    @field_validator("value")
    @classmethod
    def normalize_value(cls, value: str, info: ValidationInfo) -> str:
        rule_type = info.data.get("type")
        if rule_type == "domain":
            normalized = _ascii_domain(value.strip())
        elif rule_type == "domain_suffix":
            normalized = normalize_domain(value)
        elif rule_type in ("geosite", "geoip"):
            tag = value.strip()
            if not _GEO_TAG.fullmatch(tag):
                raise ValueError("invalid geo tag")
            normalized = tag
        elif rule_type == "ip_cidr":
            normalized = normalize_ip_cidr(value)
        else:
            raise ValueError("invalid rule type")
        if any(char in normalized for char in ",\r\n"):
            raise ValueError("rule value must not contain commas or newlines")
        return normalized


class MihomoRoutingProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = False
    default_action: MihomoAction = "proxy"
    geoip_url: str = DEFAULT_MIHOMO_GEOIP_URL
    geosite_url: str = DEFAULT_MIHOMO_GEOSITE_URL
    rules: list[MihomoRoutingRule] = Field(default_factory=list)

    @field_validator("geoip_url", "geosite_url")
    @classmethod
    def validate_geo_urls(cls, value: str) -> str:
        return normalize_geo_url(value)


class ClientRoutingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    happ: HappRoutingProfile
    mihomo: MihomoRoutingProfile


class ClientRoutingResponse(ClientRoutingUpdate):
    happ_updated_at: int = 0
