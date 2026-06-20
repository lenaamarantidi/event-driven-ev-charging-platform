"""
API Gateway - Main Application

Single entry point for all microservices in the platform.
Routes all requests to the appropriate backend service based on the URL path.
"""

import uvicorn
import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .logger import logger, setup_logging
from .middleware import LoggingMiddleware, ExceptionHandlingMiddleware
from .proxy import proxy_service
from .routes import (
    auth_router,
    providers_router,
    points_router,
    reservations_router,
    billing_router,
    payments_router,
    analytics_router,
    map_router,
    provider_api_router,
)

# Load settings
settings = get_settings()

# Configure logging
setup_logging(settings.LOG_LEVEL)

# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Unified API Gateway for all microservices",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add middleware (order matters - add later)
app.add_middleware(ExceptionHandlingMiddleware)
app.add_middleware(LoggingMiddleware)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "port": settings.PORT,
        "services": {
            **settings.get_service_urls(),
        },
    }


@app.get("/health/services")
async def services_health_check():
    """Check gateway connectivity to all upstream microservices."""
    health_paths = {
        "auth": "/auth/health",
        "providers": "/health",
        "points": "/health",
        "reservations": "/health",
        "billing": "/health",
        "payments": "/health",
        "analytics": "/health",
        "map": "/map/health",
        "provider_api": "/health",
    }
    results = {}

    async with httpx.AsyncClient(timeout=5) as client:
        for name, service_url in settings.get_service_urls().items():
            url = f"{service_url.rstrip('/')}{health_paths[name]}"
            try:
                response = await client.get(url)
                results[name] = {
                    "status": "healthy" if response.status_code < 500 else "unhealthy",
                    "status_code": response.status_code,
                    "url": url,
                }
            except httpx.RequestError as exc:
                results[name] = {
                    "status": "unreachable",
                    "url": url,
                    "error": str(exc),
                }

    overall_status = (
        "healthy"
        if all(result["status"] == "healthy" for result in results.values())
        else "degraded"
    )
    return {"status": overall_status, "services": results}


# Info endpoint
@app.get("/")
async def root():
    """Root endpoint with gateway information."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "description": "Unified API Gateway for microservices platform",
        "endpoints": {
            "health": "/health",
            "auth": "/api/auth",
            "providers": "/api/providers",
            "points": "/api/points",
            "reserve": "/api/reserve",
            "reservations": "/api/reservations",
            "billing": "/api/billing",
            "payments": "/api/payments",
            "analytics": "/api/analytics",
            "map": "/api/map",
            "provider_api": "/api/provider-api",
            "provider_api_docs": "/api/provider-api/docs",
            "redPlug": "/api/provider-api/redPlug/api",
            "greenPlug": "/api/provider-api/greenPlug/api",
            "bluePlug": "/api/provider-api/bluePlug/api",
        },
    }


@app.post("/api/reserve")
async def reserve_proxy(request: Request):
    """Proxy reservation creation to Reservation Service."""
    return await proxy_service.forward_request(
        settings.RESERVATION_SERVICE_URL,
        "/api/reserve",
        request,
        request.method,
    )


# Include route routers
app.include_router(auth_router, prefix="/api")
app.include_router(providers_router, prefix="/api")
app.include_router(points_router, prefix="/api")
app.include_router(reservations_router, prefix="/api")
app.include_router(billing_router, prefix="/api")
app.include_router(payments_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(map_router, prefix="/api")
app.include_router(provider_api_router, prefix="/api")


# 404 handler for invalid routes
@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def catch_all(path: str):
    """Catch-all route for invalid paths."""
    logger.warning(f"Invalid route accessed: /{path}")
    return JSONResponse(
        status_code=404,
        content={
            "error": "Not Found",
            "details": f"Route /{path} does not exist",
            "available_routes": [
                "/api/auth",
                "/api/providers",
                "/api/points",
                "/api/reservations",
                "/api/billing",
                "/api/payments",
                "/api/analytics",
                "/api/map",
                "/api/provider-api",
            ],
        },
    )


if __name__ == "__main__":
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"Listening on {settings.HOST}:{settings.PORT}")
    
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
