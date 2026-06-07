"""Reservation Service Routes."""

from fastapi import APIRouter, Request

from ..proxy import proxy_service
from ..config import get_settings

router = APIRouter(prefix="/reservations", tags=["reservations"])
settings = get_settings()
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


@router.api_route("", methods=METHODS)
async def reservations_root(request: Request):
    """Proxy reservation root requests to Reservation Service."""
    return await proxy_service.forward_request(
        settings.RESERVATION_SERVICE_URL,
        "/api/reservations",
        request,
        request.method,
    )


@router.api_route("/{path:path}", methods=METHODS)
async def reservations_proxy(path: str, request: Request):
    """Proxy all reservation requests to Reservation Service."""
    target_path = f"/api/reservations/{path}" if path else "/api/reservations"
    return await proxy_service.forward_request(
        settings.RESERVATION_SERVICE_URL,
        target_path,
        request,
        request.method,
    )
