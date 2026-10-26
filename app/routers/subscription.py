import base64
import re
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Request, Response
from fastapi.responses import HTMLResponse
from packaging.version import Version

from app.db import Session, crud, get_db
from app.dependencies import get_validated_sub, validate_dates
from app.models.user import SubscriptionUserResponse, UserResponse
from app.subscription.routing import apply_mihomo_routing, build_routing_link
from app.subscription.share import encode_title, generate_subscription
from app.templates import render_template
from app.utils.hwid import (
    HwidCheckResult,
    extract_hwid_headers,
    hwid_response_headers,
)
from config import (
    HWID_ENABLED,
    HWID_MAX_DEVICES_ANNOUNCE,
    SUB_PROFILE_TITLE,
    SUB_SUPPORT_URL,
    SUB_UPDATE_INTERVAL,
    SUBSCRIPTION_PAGE_TEMPLATE,
    USE_CUSTOM_JSON_DEFAULT,
    USE_CUSTOM_JSON_FOR_HAPP,
    USE_CUSTOM_JSON_FOR_STREISAND,
    USE_CUSTOM_JSON_FOR_V2RAYN,
    USE_CUSTOM_JSON_FOR_V2RAYNG,
    XRAY_SUBSCRIPTION_PATH,
)

client_config = {
    "clash-meta": {"config_format": "clash-meta", "media_type": "text/yaml", "as_base64": False, "reverse": False},
    "sing-box": {"config_format": "sing-box", "media_type": "application/json", "as_base64": False, "reverse": False},
    "clash": {"config_format": "clash", "media_type": "text/yaml", "as_base64": False, "reverse": False},
    "v2ray": {"config_format": "v2ray", "media_type": "text/plain", "as_base64": True, "reverse": False},
    "outline": {"config_format": "outline", "media_type": "application/json", "as_base64": False, "reverse": False},
    "v2ray-json": {"config_format": "v2ray-json", "media_type": "application/json", "as_base64": False,
                   "reverse": False}
}

_CLASH_META_AGENT = re.compile(
    r"^(?:clash-verge|clash[-\.]?meta|flclash|mihomo|koala-clash/|clash-party/)",
    re.IGNORECASE,
)

router = APIRouter(tags=['Subscription'], prefix=f'/{XRAY_SUBSCRIPTION_PATH}')


def get_subscription_user_info(user: UserResponse) -> dict:
    """Retrieve user subscription information including upload, download, total data, and expiry."""
    return {
        "upload": 0,
        "download": user.used_traffic,
        "total": user.data_limit if user.data_limit is not None else 0,
        "expire": user.expire if user.expire is not None else 0,
    }


def _client_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _base_subscription_headers(request: Request, user: UserResponse) -> dict:
    return {
        "content-disposition": f'attachment; filename="{user.username}"',
        "profile-web-page-url": str(request.url),
        "support-url": SUB_SUPPORT_URL,
        "profile-title": encode_title(SUB_PROFILE_TITLE),
        "profile-update-interval": SUB_UPDATE_INTERVAL,
        "subscription-userinfo": "; ".join(
            f"{key}={val}"
            for key, val in get_subscription_user_info(user).items()
        ),
    }

def prefers_html(request: Request) -> bool:
    """True only when the client prefers an HTML document, not when text/html is merely listed."""
    accept = request.headers.get("accept", "")
    media = accept.split(",", 1)[0].split(";", 1)[0].strip().lower()
    return media == "text/html"


def subscription_page(request: Request, db: Session, dbuser, user: UserResponse) -> HTMLResponse:
    """Browser info page. Proxy links stay hidden unless this request passes the device check."""
    links_hidden = False
    if HWID_ENABLED:
        try:
            enforce_hwid(request, db, dbuser)
        except HTTPException:
            user.links = []
            links_hidden = True
    return HTMLResponse(
        render_template(
            SUBSCRIPTION_PAGE_TEMPLATE,
            {"user": user, "links_hidden": links_hidden},
        )
    )


def enforce_hwid(
    request: Request,
    db: Session,
    dbuser,
) -> Optional[HwidCheckResult]:
    """
    Run HWID check when enabled. Returns result on success, raises 404 with
    Remnawave-compatible headers when the device is not allowed.
    Returns None when HWID feature is disabled.
    """
    if not HWID_ENABLED:
        return None

    hwid_headers = extract_hwid_headers(request)
    result = crud.check_and_register_hwid(
        db,
        dbuser,
        hwid_headers,
        request_ip=_client_ip(request),
    )

    if not result.subscription_allowed:
        raise HTTPException(
            status_code=404,
            detail="Not Found",
            headers=hwid_response_headers(result, announce=HWID_MAX_DEVICES_ANNOUNCE),
        )
    return result


def merge_hwid_headers(response_headers: dict, hwid_result: Optional[HwidCheckResult]) -> dict:
    if hwid_result is None:
        return response_headers
    response_headers.update(hwid_response_headers(hwid_result, announce=HWID_MAX_DEVICES_ANNOUNCE))
    return response_headers



def _routing_client(user_agent: str) -> Optional[str]:
    agent = (user_agent or "").lower()
    if agent.startswith("happ/"):
        return "happ"
    if agent.startswith("incy/"):
        return "incy"
    return None


def _happ_link_response(
    db: Session,
    user: UserResponse,
    user_agent: str,
    response_headers: dict,
) -> Optional[Response]:
    """Return share links plus a routing profile, or attach an off header and continue."""
    client = _routing_client(user_agent)
    if client is None:
        return None
    settings = crud.get_client_routing_settings(db)
    if settings.happ.enabled:
        links = generate_subscription(user=user, config_format="v2ray", as_base64=False, reverse=False)
        routing_link = build_routing_link(settings.happ, settings.happ_updated_at, client)
        payload = routing_link if not links else f"{routing_link}\n{links}"
        encoded = base64.b64encode(payload.encode("utf-8")).decode("ascii")
        return Response(content=encoded, media_type="text/plain", headers=response_headers)
    if settings.happ_updated_at > 0:
        response_headers["routing"] = f"{client}://routing/off"
    return None


def _with_mihomo_routing(db: Session, config: str) -> str:
    settings = crud.get_client_routing_settings(db)
    try:
        return apply_mihomo_routing(config, settings.mihomo)
    except ValueError:
        raise HTTPException(
            status_code=503,
            detail="Unable to apply client routing to the subscription template",
        ) from None


@router.get("/{token}/")
@router.get("/{token}", include_in_schema=False)
def user_subscription(
    request: Request,
    db: Session = Depends(get_db),
    dbuser: UserResponse = Depends(get_validated_sub),
    user_agent: str = Header(default="")
):
    """Provides a subscription link based on the user agent (Clash, V2Ray, etc.)."""
    user: UserResponse = UserResponse.model_validate(dbuser)

    if prefers_html(request):
        return subscription_page(request, db, dbuser, user)

    hwid_result = enforce_hwid(request, db, dbuser)
    crud.update_user_sub(db, dbuser, user_agent)

    response_headers = merge_hwid_headers(
        _base_subscription_headers(request, user),
        hwid_result,
    )

    routed = _happ_link_response(db, user, user_agent, response_headers)
    if routed is not None:
        return routed

    if _CLASH_META_AGENT.match(user_agent):
        conf = generate_subscription(user=user, config_format="clash-meta", as_base64=False, reverse=False)
        return Response(content=_with_mihomo_routing(db, conf), media_type="text/yaml", headers=response_headers)

    elif re.match(r'^([Cc]lash|[Ss]tash)', user_agent):
        conf = generate_subscription(user=user, config_format="clash", as_base64=False, reverse=False)
        return Response(content=conf, media_type="text/yaml", headers=response_headers)

    elif re.match(r'^(SFA|SFI|SFM|SFT|[Kk]aring|[Hh]iddify[Nn]ext)', user_agent):
        conf = generate_subscription(user=user, config_format="sing-box", as_base64=False, reverse=False)
        return Response(content=conf, media_type="application/json", headers=response_headers)

    elif re.match(r'^(SS|SSR|SSD|SSS|Outline|Shadowsocks|SSconf)', user_agent):
        conf = generate_subscription(user=user, config_format="outline", as_base64=False, reverse=False)
        return Response(content=conf, media_type="application/json", headers=response_headers)

    elif (USE_CUSTOM_JSON_DEFAULT or USE_CUSTOM_JSON_FOR_V2RAYN) and re.match(r'^v2rayN/(\d+\.\d+)', user_agent):
        version_str = re.match(r'^v2rayN/(\d+\.\d+)', user_agent).group(1)
        if Version(version_str) >= Version("6.40"):
            conf = generate_subscription(user=user, config_format="v2ray-json", as_base64=False, reverse=False)
            return Response(content=conf, media_type="application/json", headers=response_headers)
        else:
            conf = generate_subscription(user=user, config_format="v2ray", as_base64=True, reverse=False)
            return Response(content=conf, media_type="text/plain", headers=response_headers)

    elif (USE_CUSTOM_JSON_DEFAULT or USE_CUSTOM_JSON_FOR_V2RAYNG) and re.match(r'^v2rayNG/(\d+\.\d+\.\d+)', user_agent):
        version_str = re.match(r'^v2rayNG/(\d+\.\d+\.\d+)', user_agent).group(1)
        if Version(version_str) >= Version("1.8.29"):
            conf = generate_subscription(user=user, config_format="v2ray-json", as_base64=False, reverse=False)
            return Response(content=conf, media_type="application/json", headers=response_headers)
        elif Version(version_str) >= Version("1.8.18"):
            conf = generate_subscription(user=user, config_format="v2ray-json", as_base64=False, reverse=True)
            return Response(content=conf, media_type="application/json", headers=response_headers)
        else:
            conf = generate_subscription(user=user, config_format="v2ray", as_base64=True, reverse=False)
            return Response(content=conf, media_type="text/plain", headers=response_headers)

    elif re.match(r'^[Ss]treisand', user_agent):
        if USE_CUSTOM_JSON_DEFAULT or USE_CUSTOM_JSON_FOR_STREISAND:
            conf = generate_subscription(user=user, config_format="v2ray-json", as_base64=False, reverse=False)
            return Response(content=conf, media_type="application/json", headers=response_headers)
        else:
            conf = generate_subscription(user=user, config_format="v2ray", as_base64=True, reverse=False)
            return Response(content=conf, media_type="text/plain", headers=response_headers)

    elif (USE_CUSTOM_JSON_DEFAULT or USE_CUSTOM_JSON_FOR_HAPP) and re.match(r'^Happ/(\d+\.\d+\.\d+)', user_agent):
        version_str = re.match(r'^Happ/(\d+\.\d+\.\d+)', user_agent).group(1)
        if Version(version_str) >= Version("1.63.1"):
            conf = generate_subscription(user=user, config_format="v2ray-json", as_base64=False, reverse=False)
            return Response(content=conf, media_type="application/json", headers=response_headers)
        else:
            conf = generate_subscription(user=user, config_format="v2ray", as_base64=True, reverse=False)
            return Response(content=conf, media_type="text/plain", headers=response_headers)

    else:
        conf = generate_subscription(user=user, config_format="v2ray", as_base64=True, reverse=False)
        return Response(content=conf, media_type="text/plain", headers=response_headers)


@router.get("/{token}/info", response_model=SubscriptionUserResponse)
def user_subscription_info(
    request: Request,
    db: Session = Depends(get_db),
    dbuser: UserResponse = Depends(get_validated_sub),
):
    """Retrieves detailed information about the user's subscription."""
    enforce_hwid(request, db, dbuser)
    return dbuser


@router.get("/{token}/usage")
def user_get_usage(
    request: Request,
    dbuser: UserResponse = Depends(get_validated_sub),
    start: str = "",
    end: str = "",
    db: Session = Depends(get_db)
):
    """Fetches the usage statistics for the user within a specified date range."""
    enforce_hwid(request, db, dbuser)
    start, end = validate_dates(start, end)

    usages = crud.get_user_usages(db, dbuser, start, end)

    return {"usages": usages, "username": dbuser.username}


@router.get("/{token}/{client_type}")
def user_subscription_with_client_type(
    request: Request,
    dbuser: UserResponse = Depends(get_validated_sub),
    client_type: str = Path(..., regex="sing-box|clash-meta|clash|outline|v2ray|v2ray-json"),
    db: Session = Depends(get_db),
    user_agent: str = Header(default="")
):
    """Provides a subscription link based on the specified client type (e.g., Clash, V2Ray)."""
    user: UserResponse = UserResponse.model_validate(dbuser)

    hwid_result = enforce_hwid(request, db, dbuser)
    crud.update_user_sub(db, dbuser, user_agent)

    response_headers = merge_hwid_headers(
        _base_subscription_headers(request, user),
        hwid_result,
    )

    if client_type == "v2ray":
        routed = _happ_link_response(db, user, user_agent, response_headers)
        if routed is not None:
            return routed

    config = client_config.get(client_type)
    conf = generate_subscription(user=user,
                                 config_format=config["config_format"],
                                 as_base64=config["as_base64"],
                                 reverse=config["reverse"])
    if client_type == "clash-meta":
        conf = _with_mihomo_routing(db, conf)

    return Response(content=conf, media_type=config["media_type"], headers=response_headers)
