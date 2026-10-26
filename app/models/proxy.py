import base64
import json
import math
import re
from enum import Enum
from typing import Any, Literal, Optional, Union
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.system import random_password
from xray_api.types.account import (
    ShadowsocksAccount,
    ShadowsocksMethods,
    TrojanAccount,
    VLESSAccount,
    VMessAccount,
    XTLSFlows,
)

FRAGMENT_PATTERN = re.compile(r'^((\d{1,4}-\d{1,4})|(\d{1,4})),((\d{1,3}-\d{1,3})|(\d{1,3})),(tlshello|\d|\d\-\d)$')

NOISE_PATTERN = re.compile(
    r'^(rand:(\d{1,4}-\d{1,4}|\d{1,4})|str:.+|hex:.+|base64:.+)(,(\d{1,4}-\d{1,4}|\d{1,4}))?(&(rand:(\d{1,4}-\d{1,4}|\d{1,4})|str:.+|hex:.+|base64:.+)(,(\d{1,4}-\d{1,4}|\d{1,4}))?)*$')


class ProxyTypes(str, Enum):
    # proxy_type = protocol

    VMess = "vmess"
    VLESS = "vless"
    Trojan = "trojan"
    Shadowsocks = "shadowsocks"

    @property
    def account_model(self):
        if self == self.VMess:
            return VMessAccount
        if self == self.VLESS:
            return VLESSAccount
        if self == self.Trojan:
            return TrojanAccount
        if self == self.Shadowsocks:
            return ShadowsocksAccount

    @property
    def settings_model(self):
        if self == self.VMess:
            return VMessSettings
        if self == self.VLESS:
            return VLESSSettings
        if self == self.Trojan:
            return TrojanSettings
        if self == self.Shadowsocks:
            return ShadowsocksSettings


class ProxySettings(BaseModel, use_enum_values=True):
    @classmethod
    def from_dict(cls, proxy_type: ProxyTypes, _dict: dict):
        return ProxyTypes(proxy_type).settings_model.model_validate(_dict)

    def dict(self, *, no_obj=False, **kwargs):
        if no_obj:
            return json.loads(self.json())
        return super().dict(**kwargs)


class VMessSettings(ProxySettings):
    id: UUID = Field(default_factory=uuid4)

    def revoke(self):
        self.id = uuid4()


class VLESSSettings(ProxySettings):
    id: UUID = Field(default_factory=uuid4)
    flow: XTLSFlows = XTLSFlows.NONE

    def revoke(self):
        self.id = uuid4()


class TrojanSettings(ProxySettings):
    password: str = Field(default_factory=random_password)
    flow: XTLSFlows = XTLSFlows.NONE

    def revoke(self):
        self.password = random_password()


class ShadowsocksSettings(ProxySettings):
    password: str = Field(default_factory=random_password)
    method: ShadowsocksMethods = ShadowsocksMethods.CHACHA20_POLY1305

    def revoke(self):
        self.password = random_password()


class ProxyHostSecurity(str, Enum):
    inbound_default = "inbound_default"
    none = "none"
    tls = "tls"


ProxyHostALPN = Enum(
    "ProxyHostALPN",
    {
        "none": "",
        "h3": "h3",
        "h2": "h2",
        "http/1.1": "http/1.1",
        "h3,h2,http/1.1": "h3,h2,http/1.1",
        "h3,h2": "h3,h2",
        "h2,http/1.1": "h2,http/1.1",
    },
)


ProxyHostFingerprint = Enum(
    "ProxyHostFingerprint",
    {
        "none": "",
        "chrome": "chrome",
        "firefox": "firefox",
        "safari": "safari",
        "ios": "ios",
        "android": "android",
        "edge": "edge",
        "360": "360",
        "qq": "qq",
        "random": "random",
        "randomized": "randomized",
    },
)


_B64URL_ALPHABET = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
_ENCRYPTION_MODES = {"native", "xorpub", "random"}
_ENCRYPTION_RTT = {"0rtt", "1rtt"}
_XHTTP_SERVER_KEYS = {"privateKey", "mldsa65Seed", "decryption", "clients", "certificates"}
_XHTTP_TOP_LEVEL_RESERVED = {"host", "path", "mode", "extra"}
_XHTTP_BOOL_FIELDS = {"xPaddingObfsMode", "noGRPCHeader"}
_XHTTP_STRING_FIELDS = {
    "xPaddingKey",
    "xPaddingHeader",
    "xPaddingPlacement",
    "xPaddingMethod",
    "uplinkHTTPMethod",
    "uplinkDataPlacement",
    "uplinkDataKey",
    "sessionPlacement",
    "sessionKey",
    "seqPlacement",
    "seqKey",
}
_XHTTP_RANGE_FIELDS = {
    "xPaddingBytes",
    "uplinkChunkSize",
    "scMaxEachPostBytes",
    "scMinPostsIntervalMs",
}
_XMUX_RANGE_FIELDS = {
    "maxConcurrency",
    "maxConnections",
    "cMaxReuseTimes",
    "hMaxRequestTimes",
    "hMaxReusableSecs",
}
_XMUX_NUMBER_FIELDS = {"hKeepAlivePeriod"}


def _decode_base64url(segment: str) -> Optional[bytes]:
    if not segment or any(character not in _B64URL_ALPHABET for character in segment):
        return None
    if len(segment) % 4 == 1:
        return None
    padded = segment + ("=" * ((4 - len(segment) % 4) % 4))
    try:
        decoded = base64.urlsafe_b64decode(padded)
    except (ValueError, TypeError):
        return None
    canonical = base64.urlsafe_b64encode(decoded).decode("ascii").rstrip("=")
    if canonical != segment:
        return None
    return decoded


def is_mldsa65_verify(value: str) -> bool:
    if not isinstance(value, str):
        return False
    decoded = _decode_base64url(value.strip())
    return decoded is not None and len(decoded) == 1952

def supports_vless_flow(inbound: dict) -> bool:
    """Vision is allowed for encrypted VLESS, otherwise only the historical transport/security set."""
    encryption = inbound.get("vless_encryption")
    if inbound.get("vless_encryption_required") or (
        isinstance(encryption, str) and encryption not in ("", "none")
    ):
        return True
    return (
        inbound.get("network", "tcp") in ("tcp", "raw", "kcp")
        and inbound.get("tls") in ("tls", "reality")
        and inbound.get("header_type") != "http"
    )


def legacy_client_cannot_represent(inbound: dict) -> bool:
    encryption = inbound.get("vless_encryption")
    return bool(inbound.get("mldsa65Verify")) or (
        inbound.get("protocol") == "vless"
        and isinstance(encryption, str)
        and encryption not in ("", "none")
    )

def _padding_triple_valid(segment: str, index: int) -> bool:
    parts = segment.split("-")
    if len(parts) != 3 or any(not part.isdecimal() for part in parts):
        return False
    probability, low, high = (int(part) for part in parts)
    if probability > 100 or low > high:
        return False
    if index == 0 and (probability != 100 or low <= 0):
        return False
    return True


def validate_vless_client_encryption(value: Optional[str]) -> Optional[str]:
    """Normalize a client VLESS Encryption value without echoing it in errors."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("Invalid VLESS client encryption")
    value = value.strip()
    if value == "":
        return None
    if any(character.isspace() or ord(character) < 32 or ord(character) == 127 for character in value):
        raise ValueError("Invalid VLESS client encryption")
    if value == "none":
        return "none"
    parts = value.split(".")
    if (
        len(parts) < 4
        or parts[0] != "mlkem768x25519plus"
        or parts[1] not in _ENCRYPTION_MODES
        or parts[2] not in _ENCRYPTION_RTT
    ):
        raise ValueError("Invalid VLESS client encryption")
    saw_key = False
    padding_index = 0
    for segment in parts[3:]:
        if not saw_key and _padding_triple_valid(segment, padding_index):
            padding_index += 1
            continue
        decoded = _decode_base64url(segment)
        if decoded is None or len(decoded) not in (32, 1184):
            raise ValueError("Invalid VLESS client encryption")
        saw_key = True
    if not saw_key:
        raise ValueError("Invalid VLESS client encryption")
    return value


def _reject_non_json(value: Any) -> None:
    if value is None or isinstance(value, (str, bool)):
        return
    if isinstance(value, int):
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("XHTTP extra must contain finite numbers")
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError("XHTTP extra must be a JSON object")
            _reject_non_json(item)
        return
    if isinstance(value, list):
        for item in value:
            _reject_non_json(item)
        return
    raise ValueError("XHTTP extra must be a JSON object")


def _reject_server_credentials(value: Any) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if key in _XHTTP_SERVER_KEYS:
                raise ValueError("XHTTP extra must contain client settings only")
            _reject_server_credentials(item)
        return
    if isinstance(value, list):
        for item in value:
            _reject_server_credentials(item)


def _is_json_number(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_range_value(value: Any) -> bool:
    if isinstance(value, bool) or value is None:
        return False
    return isinstance(value, (int, str, dict))


def _check_known_xhttp_fields(value: dict) -> None:
    if "headers" in value:
        headers = value["headers"]
        if not isinstance(headers, dict):
            raise ValueError("XHTTP extra headers must be an object")
        for key, item in headers.items():
            if not isinstance(key, str) or not isinstance(item, str):
                raise ValueError("XHTTP extra headers must be strings")
            if key.lower() == "host":
                raise ValueError("XHTTP extra headers must not contain host")
    for key in ("xmux", "downloadSettings"):
        if key in value and not isinstance(value[key], dict):
            raise ValueError("XHTTP extra field type is invalid")
    for key in _XHTTP_BOOL_FIELDS:
        if key in value and not isinstance(value[key], bool):
            raise ValueError("XHTTP extra field type is invalid")
    for key in _XHTTP_STRING_FIELDS:
        if key in value and not isinstance(value[key], str):
            raise ValueError("XHTTP extra field type is invalid")
    for key in _XHTTP_RANGE_FIELDS:
        if key in value and not _is_range_value(value[key]):
            raise ValueError("XHTTP extra field type is invalid")
    xmux = value.get("xmux")
    if isinstance(xmux, dict):
        for key in _XMUX_RANGE_FIELDS:
            if key in xmux and not _is_range_value(xmux[key]):
                raise ValueError("XHTTP extra field type is invalid")
        for key in _XMUX_NUMBER_FIELDS:
            if key in xmux and not _is_json_number(xmux[key]):
                raise ValueError("XHTTP extra field type is invalid")


def validate_xhttp_extra(value: Optional[dict]) -> Optional[dict]:
    """Validate client XHTTP extra without mutating it or copying empty objects away."""
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("XHTTP extra must be a JSON object")
    for key in _XHTTP_TOP_LEVEL_RESERVED:
        if key in value:
            raise ValueError("XHTTP extra must not contain host, path, mode, or extra")
    _reject_non_json(value)
    _reject_server_credentials(value)
    _check_known_xhttp_fields(value)
    return value


class FormatVariables(dict):
    def __missing__(self, key):
        return key.join("{}")


class ProxyHost(BaseModel):
    remark: str
    address: str
    port: Optional[int] = Field(None, nullable=True)
    sni: Optional[str] = Field(None, nullable=True)
    host: Optional[str] = Field(None, nullable=True)
    path: Optional[str] = Field(None, nullable=True)
    security: ProxyHostSecurity = ProxyHostSecurity.inbound_default
    alpn: ProxyHostALPN = ProxyHostALPN.none
    fingerprint: ProxyHostFingerprint = ProxyHostFingerprint.none
    allowinsecure: Union[bool, None] = None
    is_disabled: Union[bool, None] = None
    mux_enable: Union[bool, None] = None
    fragment_setting: Optional[str] = Field(None, nullable=True)
    noise_setting: Optional[str] = Field(None, nullable=True)
    random_user_agent: Union[bool, None] = None
    use_sni_as_host: Union[bool, None] = None
    vless_encryption: Optional[str] = None
    xhttp_mode: Optional[Literal["auto", "packet-up", "stream-up", "stream-one"]] = None
    xhttp_extra: Optional[dict] = None
    model_config = ConfigDict(from_attributes=True)

    @field_validator("remark", mode="after")
    def validate_remark(cls, v):
        try:
            v.format_map(FormatVariables())
        except ValueError as exc:
            raise ValueError("Invalid formatting variables")

        return v

    @field_validator("address", mode="after")
    def validate_address(cls, v):
        try:
            v.format_map(FormatVariables())
        except ValueError as exc:
            raise ValueError("Invalid formatting variables")

        return v

    @field_validator("fragment_setting", check_fields=False)
    @classmethod
    def validate_fragment(cls, v):
        if v and not FRAGMENT_PATTERN.match(v):
            raise ValueError(
                "Fragment setting must be like this: length,interval,packet (10-100,100-200,tlshello)."
            )
        return v

    @field_validator("noise_setting", check_fields=False)
    @classmethod
    def validate_noise(cls, v):
        if v:
            if not NOISE_PATTERN.match(v):
                raise ValueError(
                    "Noise setting must be like this: packet,delay (rand:10-20,100-200)."
                )
            if len(v) > 2000:
                raise ValueError(
                    "Noise can't be longer that 2000 character"
                )
        return v

    @field_validator("vless_encryption", mode="before")
    @classmethod
    def validate_vless_encryption(cls, value):
        return validate_vless_client_encryption(value)

    @field_validator("xhttp_mode", mode="before")
    @classmethod
    def validate_xhttp_mode(cls, value):
        if isinstance(value, str) and value.strip() == "":
            return None
        return value

    @field_validator("xhttp_extra", mode="before")
    @classmethod
    def validate_host_xhttp_extra(cls, value):
        return validate_xhttp_extra(value)



class ProxyInbound(BaseModel):
    tag: str
    protocol: ProxyTypes
    network: str
    tls: str
    port: Union[int, str]
    vless_encryption_required: bool = False
