"""Billing Service Routes."""

from fastapi import APIRouter, Request

from ..proxy import proxy_service
from ..config import get_settings

router = APIRouter(prefix="/billing", tags=["billing"])
settings = get_settings()
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


@router.api_route("", methods=METHODS)
async def billing_root(request: Request):
    """Proxy billing root requests to Billing Service."""
    return await proxy_service.forward_request(
        settings.BILLING_SERVICE_URL,
        "/api/billing",
        request,
        request.method,
    )


@router.api_route("/{path:path}", methods=METHODS)
async def billing_proxy(path: str, request: Request):
    """Proxy all billing requests to Billing Service."""
    target_path = f"/api/billing/{path}" if path else "/api/billing"
    return await proxy_service.forward_request(
        settings.BILLING_SERVICE_URL,
        target_path,
        request,
        request.method,
    )
