"""Middleware for request/response logging and exception handling."""

import time
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from ..logger import logger


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to log all requests and responses."""
    
    async def dispatch(self, request: Request, call_next):
        """Log request and response with timing."""
        start_time = time.time()
        
        # Log incoming request
        logger.info(
            f"→ {request.method} {request.url.path}",
            extra={
                "method": request.method,
                "path": request.url.path,
            }
        )
        
        try:
            response = await call_next(request)
            
            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000
            
            # Log response
            logger.info(
                f"← {request.method} {request.url.path} - {response.status_code} ({duration_ms:.2f}ms)",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "duration_ms": int(duration_ms),
                }
            )
            
            return response
        
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                f"✗ {request.method} {request.url.path} - ERROR ({duration_ms:.2f}ms): {str(e)}",
                exc_info=True,
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "error": str(e),
                    "duration_ms": int(duration_ms),
                }
            )
            raise


class ExceptionHandlingMiddleware(BaseHTTPMiddleware):
    """Middleware for global exception handling."""
    
    async def dispatch(self, request: Request, call_next):
        """Handle exceptions globally."""
        try:
            return await call_next(request)
        
        except Exception as e:
            logger.error(
                f"Unhandled exception: {str(e)}",
                exc_info=True,
                extra={
                    "method": request.method,
                    "path": request.url.path,
                }
            )
            
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Internal Server Error",
                    "details": "An unexpected error occurred in the gateway",
                    "request_id": getattr(request.state, "request_id", "unknown"),
                },
            )
