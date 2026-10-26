from fastapi import APIRouter
from . import (
    admin,
    client_routing,
    core,
    hwid,
    node,
    subscription,
    system,
    user_template,
    user,
    home,
)

api_router = APIRouter()

routers = [
    admin.router,
    client_routing.router,
    core.router,
    hwid.router,
    node.router,
    subscription.router,
    system.router,
    user_template.router,
    user.router,
    home.router,
]

for router in routers:
    api_router.include_router(router)

__all__ = ["api_router"]