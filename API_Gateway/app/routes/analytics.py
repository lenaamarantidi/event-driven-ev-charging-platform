"""Analytics Service Routes."""

from fastapi import APIRouter, Request

from ..proxy import proxy_service
from ..config import get_settings

router = APIRouter(prefix="/analytics", tags=["analytics"])
settings = get_settings()
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


@router.api_route("", methods=METHODS)
async def analytics_root(request: Request):
    """Proxy analytics root requests to Analytics Service."""
    return await proxy_service.forward_request(
        settings.ANALYTICS_SERVICE_URL,
        "/api/analytics",
        request,
        request.method,
    )


@router.api_route("/{path:path}", methods=METHODS)
async def analytics_proxy(path: str, request: Request):
    """Proxy all analytics requests to Analytics Service."""
    target_path = f"/api/analytics/{path}" if path else "/api/analytics"
    return await proxy_service.forward_request(
        settings.ANALYTICS_SERVICE_URL,
        target_path,
        request,
        request.method,
    )
