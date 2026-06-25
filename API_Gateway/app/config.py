import os
from functools import lru_cache
from typing import Any, Dict
from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables."""
    
    # API Gateway config
    APP_NAME: str = "API Gateway"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    PORT: int = int(os.getenv("PORT", "4411"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    # Service URLs
    AUTH_SERVICE_URL: str = os.getenv(
        "AUTH_SERVICE_URL", "http://127.0.0.1:3100"
    )
    PROVIDER_SERVICE_URL: str = os.getenv(
        "PROVIDER_SERVICE_URL", "http://127.0.0.1:3101"
    )
    POINTS_SERVICE_URL: str = os.getenv(
        "POINTS_SERVICE_URL", "http://127.0.0.1:3001"
    )
    RESERVATION_SERVICE_URL: str = os.getenv(
        "RESERVATION_SERVICE_URL", "http://127.0.0.1:3009"
    )
    BILLING_SERVICE_URL: str = os.getenv(
        "BILLING_SERVICE_URL", "http://127.0.0.1:3103"
    )
    PAYMENT_SERVICE_URL: str = os.getenv(
        "PAYMENT_SERVICE_URL", "http://127.0.0.1:3107"
    )
    ANALYTICS_SERVICE_URL: str = os.getenv(
        "ANALYTICS_SERVICE_URL", "http://127.0.0.1:3106"
    )
    MAP_SERVICE_URL: str = os.getenv(
        "MAP_SERVICE_URL", "http://127.0.0.1:3105"
    )
    PROVIDER_API_SERVICE_URL: str = os.getenv(
        "PROVIDER_API_SERVICE_URL", "http://127.0.0.1:3200"
    )
    
    # Request settings
    REQUEST_TIMEOUT: int = int(os.getenv("REQUEST_TIMEOUT", "30"))
    MAX_RETRIES: int = int(os.getenv("MAX_RETRIES", "3"))

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, value: Any) -> bool:
        """Accept common deployment strings for DEBUG."""
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "1", "yes", "on", "debug"}:
                return True
            if normalized in {"false", "0", "no", "off", "release", "production", ""}:
                return False
        return bool(value)

    @field_validator(
        "AUTH_SERVICE_URL",
        "PROVIDER_SERVICE_URL",
        "POINTS_SERVICE_URL",
        "RESERVATION_SERVICE_URL",
        "BILLING_SERVICE_URL",
        "PAYMENT_SERVICE_URL",
        "ANALYTICS_SERVICE_URL",
        "MAP_SERVICE_URL",
        "PROVIDER_API_SERVICE_URL",
        mode="before",
    )
    @classmethod
    def normalize_known_service_urls(cls, value: Any) -> Any:
        """Normalize older compose/template URLs to the actual service ports."""
        if not isinstance(value, str):
            return value

        replacements = {
            "http://provider-management-service:3102": "http://provider-management-service:3101",
            "http://provider-service:3102": "http://provider-management-service:3101",
            "http://points-service:3101": "http://central-service:3001",
            "http://reservation-service:3109": "http://reservation-service:3009",
            "http://billing-service:3105": "http://billing-service:3103",
            "http://payment-service:3106": "http://payment-service:3107",
            "http://analytics-service:3104": "http://analytics-service:3106",
        }
        return replacements.get(value.rstrip("/"), value.rstrip("/"))
    
    class Config:
        env_file = ".env"
        case_sensitive = True
    
    def get_service_url(self, service_name: str) -> str:
        """Get service URL by name."""
        return self.get_service_urls().get(service_name, "")

    def get_service_urls(self) -> Dict[str, str]:
        """Get all proxied service URLs."""
        return {
            "auth": self.AUTH_SERVICE_URL,
            "providers": self.PROVIDER_SERVICE_URL,
            "points": self.POINTS_SERVICE_URL,
            "reservations": self.RESERVATION_SERVICE_URL,
            "billing": self.BILLING_SERVICE_URL,
            "payments": self.PAYMENT_SERVICE_URL,
            "analytics": self.ANALYTICS_SERVICE_URL,
            "map": self.MAP_SERVICE_URL,
            "provider_api": self.PROVIDER_API_SERVICE_URL,
        }


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
