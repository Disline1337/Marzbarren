from fastapi import APIRouter, Depends, HTTPException, Path

from app.db import Session, crud, get_db
from app.dependencies import get_validated_user
from app.models.admin import Admin
from app.models.hwid import HwidDeviceCreate, HwidDeviceListResponse, HwidDeviceResponse
from app.models.user import UserResponse
from app.utils import responses

router = APIRouter(tags=["HWID"], prefix="/api", responses={401: responses._401})


def _device_to_response(device, username: str = None) -> HwidDeviceResponse:
    return HwidDeviceResponse(
        hwid=device.hwid,
        user_id=device.user_id,
        username=username,
        platform=device.platform,
        os_version=device.os_version,
        device_model=device.device_model,
        user_agent=device.user_agent,
        request_ip=device.request_ip,
        created_at=device.created_at,
        updated_at=device.updated_at,
    )


@router.get(
    "/user/{username}/hwid/devices",
    response_model=HwidDeviceListResponse,
    responses={403: responses._403, 404: responses._404},
)
def list_user_hwid_devices(
    dbuser: UserResponse = Depends(get_validated_user),
    db: Session = Depends(get_db),
):
    """List registered HWID devices for a user."""
    devices = crud.list_user_hwid_devices(db, dbuser.id)
    return HwidDeviceListResponse(
        total=len(devices),
        devices=[_device_to_response(d, dbuser.username) for d in devices],
    )


@router.post(
    "/user/{username}/hwid/devices",
    response_model=HwidDeviceResponse,
    responses={403: responses._403, 404: responses._404, 409: responses._409},
)
def create_user_hwid_device(
    body: HwidDeviceCreate,
    dbuser: UserResponse = Depends(get_validated_user),
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.get_current),
):
    """Manually register an HWID device for a user (admin)."""
    existing = crud.get_user_hwid_device(db, dbuser.id, body.hwid)
    if existing:
        raise HTTPException(status_code=409, detail="Device already exists")

    device = crud.create_hwid_device_admin(
        db,
        user_id=dbuser.id,
        hwid=body.hwid,
        platform=body.platform,
        os_version=body.os_version,
        device_model=body.device_model,
        user_agent=body.user_agent,
    )
    return _device_to_response(device, dbuser.username)


@router.delete(
    "/user/{username}/hwid/devices/{hwid}",
    responses={403: responses._403, 404: responses._404},
)
def delete_user_hwid_device(
    hwid: str = Path(..., min_length=10, max_length=64),
    dbuser: UserResponse = Depends(get_validated_user),
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.get_current),
):
    """Delete a single HWID device for a user."""
    if not crud.delete_user_hwid_device(db, dbuser.id, hwid):
        raise HTTPException(status_code=404, detail="Device not found")
    return {"detail": "Device deleted"}


@router.delete(
    "/user/{username}/hwid/devices",
    responses={403: responses._403, 404: responses._404},
)
def delete_all_user_hwid_devices(
    dbuser: UserResponse = Depends(get_validated_user),
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.get_current),
):
    """Delete all HWID devices for a user."""
    count = crud.delete_all_user_hwid_devices(db, dbuser.id)
    return {"detail": f"Deleted {count} device(s)", "count": count}
