"""Provider API Service Routes."""

from fastapi import APIRouter, Request

from ..proxy import proxy_service
from ..config import get_settings

router = APIRouter(prefix="/provider-api", tags=["provider-api"])
settings = get_settings()

METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


@router.api_route("", methods=METHODS)
async def provider_api_root(request: Request):
    """Proxy provider-api root requests to Provider API Service."""
    return await proxy_service.forward_request(
        settings.PROVIDER_API_SERVICE_URL,
        "/",
        request,
        request.method,
    )


@router.api_route("/{path:path}", methods=METHODS)
async def provider_api_proxy(path: str, request: Request):
    """Proxy all provider API requests to Provider API Service."""
    target_path = f"/{path}" if path else "/"
    return await proxy_service.forward_request(
        settings.PROVIDER_API_SERVICE_URL,
        target_path,
        request,
        request.method,
    )
