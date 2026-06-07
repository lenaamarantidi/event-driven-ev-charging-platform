import time
import httpx
from typing import Dict, Union
from fastapi import Request
from fastapi.responses import Response, JSONResponse

from .logger import logger
from .config import get_settings


class ProxyService:
    """Service for proxying requests to microservices."""
    
    def __init__(self):
        self.settings = get_settings()
        self.timeout = httpx.Timeout(self.settings.REQUEST_TIMEOUT)
    
    async def forward_request(
        self,
        service_url: str,
        path: str,
        request: Request,
        method: str,
    ) -> Union[Response, JSONResponse]:
        """
        Forward request to microservice with comprehensive logging and error handling.
        
        Preserves:
        - HTTP method
        - Path and query parameters
        - Headers (excluding hop-by-hop)
        - Request body
        - Response status and headers
        """
        start_time = time.time()
        full_url = self._build_url(service_url, path, request.url.query)
        
        # Log incoming request
        logger.info(
            f"Proxying {method} request to {service_url}",
            extra={
                "method": method,
                "path": path,
            }
        )
        
        try:
            # Prepare headers (exclude hop-by-hop headers)
            headers = self._prepare_headers(dict(request.headers))
            
            # Get request body if applicable
            body = None
            if method not in {"GET", "HEAD", "OPTIONS"}:
                body = await request.body()
            
            # Make the request to the service
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.request(
                    method=method,
                    url=full_url,
                    headers=headers,
                    content=body,
                    follow_redirects=True,
                )
            
            duration_ms = (time.time() - start_time) * 1000
            
            # Log successful response
            logger.info(
                f"Response from {service_url}: {response.status_code}",
                extra={
                    "method": method,
                    "path": path,
                    "status_code": response.status_code,
                    "duration_ms": int(duration_ms),
                }
            )
            
            # Return response with preserved status and content
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=self._prepare_response_headers(dict(response.headers)),
                media_type=response.headers.get("content-type", "application/json"),
            )
        
        except httpx.TimeoutException as e:
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                f"Timeout connecting to {service_url}: {str(e)}",
                extra={
                    "method": method,
                    "path": path,
                    "duration_ms": int(duration_ms),
                    "error": "timeout",
                }
            )
            return JSONResponse(
                status_code=504,
                content={
                    "error": "Gateway Timeout",
                    "details": f"Service at {service_url} did not respond in time",
                    "service": service_url,
                },
            )
        
        except httpx.ConnectError as e:
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                f"Connection error to {service_url}: {str(e)}",
                extra={
                    "method": method,
                    "path": path,
                    "duration_ms": int(duration_ms),
                    "error": "connection_error",
                }
            )
            return JSONResponse(
                status_code=503,
                content={
                    "error": "Service Unavailable",
                    "details": f"Could not connect to service at {service_url}",
                    "service": service_url,
                },
            )
        
        except httpx.RequestError as e:
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                f"Request error to {service_url}: {str(e)}",
                extra={
                    "method": method,
                    "path": path,
                    "duration_ms": int(duration_ms),
                    "error": "request_error",
                }
            )
            return JSONResponse(
                status_code=502,
                content={
                    "error": "Bad Gateway",
                    "details": "Error forwarding request to service",
                    "service": service_url,
                },
            )
        
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                f"Unexpected error forwarding to {service_url}: {str(e)}",
                exc_info=True,
                extra={
                    "method": method,
                    "path": path,
                    "duration_ms": int(duration_ms),
                    "error": "unexpected",
                }
            )
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Internal Server Error",
                    "details": "An unexpected error occurred",
                },
            )
    
    @staticmethod
    def _build_url(
        service_url: str,
        path: str,
        query_string: str,
    ) -> str:
        """Build full URL with path and query parameters."""
        full_url = f"{service_url.rstrip('/')}{path}"
        
        if query_string:
            full_url = f"{full_url}?{query_string}"
        
        return full_url
    
    @staticmethod
    def _prepare_headers(headers: Dict[str, str]) -> Dict[str, str]:
        """Remove hop-by-hop headers."""
        hop_by_hop_headers = {
            "host",
            "connection",
            "keep-alive",
            "proxy-authenticate",
            "proxy-authorization",
            "te",
            "trailers",
            "transfer-encoding",
            "upgrade",
        }
        
        return {
            key: value
            for key, value in headers.items()
            if key.lower() not in hop_by_hop_headers
        }

    @classmethod
    def _prepare_response_headers(cls, headers: Dict[str, str]) -> Dict[str, str]:
        """Remove upstream transport headers before returning the response."""
        excluded_headers = {"content-length", "content-encoding"}
        return {
            key: value
            for key, value in cls._prepare_headers(headers).items()
            if key.lower() not in excluded_headers
        }


# Global proxy service instance
proxy_service = ProxyService()
