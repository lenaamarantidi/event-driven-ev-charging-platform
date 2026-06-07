"""Auth Service Routes."""

from fastapi import APIRouter, Request

from ..proxy import proxy_service
from ..config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


@router.api_route("", methods=METHODS)
async def auth_root(request: Request):
    """Proxy auth root requests to Auth Service."""
    return await proxy_service.forward_request(
        settings.AUTH_SERVICE_URL,
        "/auth",
        request,
        request.method,
    )


@router.api_route("/{path:path}", methods=METHODS)
async def auth_proxy(path: str, request: Request):
    """Proxy all auth requests to Auth Service."""
    target_path = f"/auth/{path}" if path else "/auth"
    return await proxy_service.forward_request(
        settings.AUTH_SERVICE_URL,
        target_path,
        request,
        request.method,
    )
