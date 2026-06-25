import unittest
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings
from app.main import app
from app.proxy import ProxyService


class GatewaySmokeTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_root_lists_all_gateway_routes(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        endpoints = response.json()["endpoints"]
        self.assertEqual(endpoints["auth"], "/api/auth")
        self.assertEqual(endpoints["providers"], "/api/providers")
        self.assertEqual(endpoints["points"], "/api/points")
        self.assertEqual(endpoints["reservations"], "/api/reservations")
        self.assertEqual(endpoints["billing"], "/api/billing")
        self.assertEqual(endpoints["payments"], "/api/payments")
        self.assertEqual(endpoints["analytics"], "/api/analytics")
        self.assertEqual(endpoints["map"], "/api/map")
        self.assertEqual(endpoints["provider_api"], "/api/provider-api")

    def test_health_lists_all_upstream_services(self):
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        services = response.json()["services"]
        self.assertEqual(services["auth"], "http://auth-service:3100")
        self.assertEqual(services["providers"], "http://provider-management-service:3101")
        self.assertEqual(services["points"], "http://central-service:3001")
        self.assertEqual(services["reservations"], "http://reservation-service:3009")
        self.assertEqual(services["billing"], "http://billing-service:3103")
        self.assertEqual(services["payments"], "http://payment-service:3107")
        self.assertEqual(services["analytics"], "http://analytics-service:3106")
        self.assertEqual(services["map"], "http://map-service:3105")
        self.assertEqual(services["provider_api"], "http://provider-adapter-redplug:3111")

    def test_proxy_build_url_preserves_query_string(self):
        url = ProxyService._build_url(
            "http://example-service:3000/",
            "/api/points",
            "status=available&status=reserved&q=A%20B",
        )

        self.assertEqual(
            url,
            "http://example-service:3000/api/points?status=available&status=reserved&q=A%20B",
        )

    def test_settings_normalize_known_old_ports(self):
        settings = Settings(
            PROVIDER_SERVICE_URL="http://provider-management-service:3102",
            POINTS_SERVICE_URL="http://points-service:3101",
            RESERVATION_SERVICE_URL="http://reservation-service:3109",
            BILLING_SERVICE_URL="http://billing-service:3105",
            PAYMENT_SERVICE_URL="http://payment-service:3106",
            ANALYTICS_SERVICE_URL="http://analytics-service:3104",
        )

        self.assertEqual(settings.PROVIDER_SERVICE_URL, "http://provider-management-service:3101")
        self.assertEqual(settings.POINTS_SERVICE_URL, "http://central-service:3001")
        self.assertEqual(settings.RESERVATION_SERVICE_URL, "http://reservation-service:3009")
        self.assertEqual(settings.BILLING_SERVICE_URL, "http://billing-service:3103")
        self.assertEqual(settings.PAYMENT_SERVICE_URL, "http://payment-service:3107")
        self.assertEqual(settings.ANALYTICS_SERVICE_URL, "http://analytics-service:3106")

    def test_proxy_routes_forward_to_expected_upstream_paths(self):
        cases = [
            ("app.routes.auth.proxy_service.forward_request", "get", "/api/auth/profile", "/auth/profile"),
            ("app.routes.providers.proxy_service.forward_request", "get", "/api/providers/42", "/api/providers/42"),
            ("app.routes.points.proxy_service.forward_request", "post", "/api/points/p1/reserve/30", "/api/points/p1/reserve/30"),
            ("app.routes.reservations.proxy_service.forward_request", "get", "/api/reservations/r1", "/api/reservations/r1"),
            ("app.routes.billing.proxy_service.forward_request", "get", "/api/billing/summary/p1", "/api/billing/summary/p1"),
            ("app.routes.payments.proxy_service.forward_request", "post", "/api/payments/p1/status", "/api/payments/p1/status"),
            ("app.routes.analytics.proxy_service.forward_request", "get", "/api/analytics/global", "/api/analytics/global"),
            ("app.routes.map.proxy_service.forward_request", "post", "/api/map/search", "/map/search"),
            ("app.routes.provider_api.proxy_service.forward_request", "get", "/api/provider-api/redPlug/api/points", "/redPlug/api/points"),
        ]

        for patch_target, method, gateway_path, upstream_path in cases:
            with self.subTest(gateway_path=gateway_path):
                mocked_forward = AsyncMock(return_value=JSONResponse({"ok": True}))
                with patch(patch_target, mocked_forward):
                    response = getattr(self.client, method)(gateway_path)

                self.assertEqual(response.status_code, 200)
                self.assertEqual(mocked_forward.await_args.args[1], upstream_path)

    def test_invalid_route_returns_gateway_404(self):
        response = self.client.get("/api/unknown")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"], "Not Found")


if __name__ == "__main__":
    unittest.main()
