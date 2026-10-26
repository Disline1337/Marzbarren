"""HWID helpers — Remnawave / Happ compatible device identification."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from fastapi import Request

# Remnawave Panel >= v3.0.0
HWID_REGEX = re.compile(r"^[a-zA-Z0-9=-]{10,64}$")
_HEADER_MAX_LEN = 128


@dataclass
class HwidHeaders:
    hwid: str
    platform: Optional[str] = None
    os_version: Optional[str] = None
    device_model: Optional[str] = None
    user_agent: Optional[str] = None


@dataclass
class HwidCheckResult:
    subscription_allowed: bool
    max_device_reached: bool
    hwid_not_supported: bool
    limit_bypassed: bool


def _header_value(request: Request, name: str) -> Optional[str]:
    raw = request.headers.get(name)
    if raw is None:
        return None
    value = raw.strip()
    if not value:
        return None
    return value[:_HEADER_MAX_LEN]


def extract_hwid_headers(request: Request) -> Optional[HwidHeaders]:
    """
    Extract and validate HWID headers from a subscription request.

    Invalid x-hwid is treated as missing (Remnawave behaviour).
    """
    hwid = _header_value(request, "x-hwid")
    if not hwid or not HWID_REGEX.match(hwid):
        return None

    return HwidHeaders(
        hwid=hwid,
        platform=_header_value(request, "x-device-os"),
        os_version=_header_value(request, "x-ver-os"),
        device_model=_header_value(request, "x-device-model"),
        user_agent=_header_value(request, "user-agent"),
    )


def hwid_response_headers(result: HwidCheckResult, announce: str = "") -> dict:
    """Build Remnawave-compatible HWID status response headers."""
    headers: dict = {}
    if result.limit_bypassed:
        return headers

    headers["x-hwid-active"] = "true"

    if not result.subscription_allowed:
        if result.hwid_not_supported:
            headers["x-hwid-not-supported"] = "true"
        if result.max_device_reached:
            headers["x-hwid-max-devices-reached"] = "true"
            headers["x-hwid-limit"] = "true"  # v2RayTun compat
        if announce:
            headers["announce"] = announce

    return headers
