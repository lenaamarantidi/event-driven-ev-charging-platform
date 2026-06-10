"""Map UI Service Routes."""

from fastapi import APIRouter, Request

from ..proxy import proxy_service
from ..config import get_settings

router = APIRouter(prefix="/map", tags=["map"])
settings = get_settings()

METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


@router.api_route("", methods=METHODS)
async def map_root(request: Request):
    """Proxy map root requests to Map UI Service."""
    return await proxy_service.forward_request(
        settings.MAP_SERVICE_URL,
        "/map",
        request,
        request.method,
    )


@router.api_route("/{path:path}", methods=METHODS)
async def map_proxy(path: str, request: Request):
    """Proxy all map requests to Map UI Service."""
    target_path = f"/map/{path}" if path else "/map"
    return await proxy_service.forward_request(
        settings.MAP_SERVICE_URL,
        target_path,
        request,
        request.method,
    )
