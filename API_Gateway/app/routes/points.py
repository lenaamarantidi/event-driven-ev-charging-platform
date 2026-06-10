"""Points/Central Service Routes."""

from fastapi import APIRouter, Request

from ..proxy import proxy_service
from ..config import get_settings

router = APIRouter(prefix="/points", tags=["points"])
settings = get_settings()
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


@router.api_route("", methods=METHODS)
async def points_root(request: Request):
    """Proxy points root requests to Central Service."""
    return await proxy_service.forward_request(
        settings.POINTS_SERVICE_URL,
        "/api/points",
        request,
        request.method,
    )


@router.api_route("/{path:path}", methods=METHODS)
async def points_proxy(path: str, request: Request):
    """Proxy all points requests to Central Service."""
    target_path = f"/api/points/{path}" if path else "/api/points"
    return await proxy_service.forward_request(
        settings.POINTS_SERVICE_URL,
        target_path,
        request,
        request.method,
    )
