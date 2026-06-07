"""Routes module initialization."""

from .auth import router as auth_router
from .providers import router as providers_router
from .points import router as points_router
from .reservations import router as reservations_router
from .billing import router as billing_router
from .payments import router as payments_router
from .analytics import router as analytics_router
from .map import router as map_router
from .provider_api import router as provider_api_router

__all__ = [
    "auth_router",
    "providers_router",
    "points_router",
    "reservations_router",
    "billing_router",
    "payments_router",
    "analytics_router",
    "map_router",
    "provider_api_router",
]
