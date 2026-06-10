"""Payment Service Routes."""

from fastapi import APIRouter, Request

from ..proxy import proxy_service
from ..config import get_settings

router = APIRouter(prefix="/payments", tags=["payments"])
settings = get_settings()
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


@router.api_route("", methods=METHODS)
async def payments_root(request: Request):
    """Proxy payment root requests to Payment Service."""
    return await proxy_service.forward_request(
        settings.PAYMENT_SERVICE_URL,
        "/api/payments",
        request,
        request.method,
    )


@router.api_route("/{path:path}", methods=METHODS)
async def payments_proxy(path: str, request: Request):
    """Proxy all payment requests to Payment Service."""
    target_path = f"/api/payments/{path}" if path else "/api/payments"
    return await proxy_service.forward_request(
        settings.PAYMENT_SERVICE_URL,
        target_path,
        request,
        request.method,
    )
