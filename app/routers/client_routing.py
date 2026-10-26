from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError

from app.db import Session, crud, get_db
from app.models.admin import Admin
from app.models.client_routing import ClientRoutingResponse, ClientRoutingUpdate
from app.utils import responses

router = APIRouter(
    tags=["Client Routing"],
    prefix="/api",
    responses={401: responses._401, 403: responses._403, 409: responses._409},
)


@router.get("/client-routing", response_model=ClientRoutingResponse)
def get_client_routing(
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
) -> ClientRoutingResponse:
    """Return the global Happ and Mihomo routing profiles. Missing settings stay at defaults."""
    return crud.get_client_routing_settings(db)


@router.put("/client-routing", response_model=ClientRoutingResponse)
def put_client_routing(
    settings: ClientRoutingUpdate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
) -> ClientRoutingResponse:
    """Replace both routing profiles. The server owns happ_updated_at."""
    try:
        return crud.update_client_routing_settings(db, settings)
    except IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="Routing settings changed; reload and try again",
        ) from None
