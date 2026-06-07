"""Provider Management Service Routes."""

from fastapi import APIRouter, Request

from ..proxy import proxy_service
from ..config import get_settings

router = APIRouter(prefix="/providers", tags=["providers"])
settings = get_settings()
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


@router.api_route("", methods=METHODS)
async def providers_root(request: Request):
    """Proxy provider root requests to Provider Management Service."""
    return await proxy_service.forward_request(
        settings.PROVIDER_SERVICE_URL,
        "/api/providers",
        request,
        request.method,
    )


@router.api_route("/{path:path}", methods=METHODS)
async def providers_proxy(path: str, request: Request):
    """Proxy all provider requests to Provider Management Service."""
    target_path = f"/api/providers/{path}" if path else "/api/providers"
    return await proxy_service.forward_request(
        settings.PROVIDER_SERVICE_URL,
        target_path,
        request,
        request.method,
    )
