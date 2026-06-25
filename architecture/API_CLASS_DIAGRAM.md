@startuml API_ClassDiagram

!define ABSTRACT_COLOR #FFD700
!define SERVICE_COLOR #87CEEB
!define ENDPOINT_COLOR #98FB98

skinparam classBackgroundColor SERVICE_COLOR
skinparam classBorderColor #333333
skinparam classArrowColor #333333
skinparam ArrowColor #333333
skinparam shadowing false
skinparam defaultFontName Arial

title Service API Endpoints

package "SaaS System APIs" {

  ' === API Gateway (Entry Point) ===
  class "API Gateway" as ApiGateway {
    --
    + GET /health
    + GET /api/status
  }

  ' === Auth Service ===
  class "Auth Service" as AuthService {
    --
    + POST /auth/register(username, password) : AuthResponseDTO
    + POST /auth/login(credentials) : AuthResponseDTO
    + POST /auth/logout() : void
    + GET /auth/validate(token) : UserProfileDTO
    + POST /auth/refresh(refreshToken) : AuthResponseDTO
    + GET /auth/profile(userId: integer) : UserProfileDTO
  }

  ' === Provider Management Service ===
  class "Provider Management Service" as ProviderMgmtService {
    --
    + POST /api/providers/register(data) : ProviderRegDTO
    + GET /api/providers/list() : List<ProviderProfileDTO>
    + GET /api/providers/profile(providerId) : ProviderProfileDTO
    + PATCH /api/providers/profile(providerId, data) : void
    + GET /api/providers/points(providerId) : List<PointDTO>
  }

  ' === Central Service (Points) ===
  class "Central Service" as CentralService {
    --
    + GET /api/points/all(filters) : List<PointDTO>
    + GET /api/points/{id}(integer) : PointDTO
    + POST /api/points/filter(filters) : List<PointDTO>
    + GET /api/points/status(pointId) : StatusDTO
    + GET /ui/points(location, bounds) : List<PointDTO>
    + POST /api/points/subscribe(webhookUrl) : void
  }

  ' === Reservation Service ===
  class "Reservation Service" as ReservationService {
    --
    + POST /api/reserve(data) : ReservationResponseDTO
    + POST /api/reservations(data) : ReservationResponseDTO
    + GET /api/reservations/{id}(integer) : ReservationResponseDTO
    + POST /api/reservations/{id}/confirm(userId) : StatusDTO
    + GET /api/reservations/user(userId) : List<ReservationResponseDTO>
    + GET /api/reservations/{id}/status(reservationId) : StatusDTO
  }

  ' === Billing Service ===
  class "Billing Service" as BillingService {
    --
    + GET /api/billing/invoices(userId, dateRange) : List<InvoiceDTO>
    + GET /api/billing/invoices/{id}(invoiceId) : InvoiceDTO
    + PATCH /api/billing/invoices/{id}/status(invoiceId, status) : void
    + POST /api/billing/process(invoiceId, paymentMethod) : void
    + GET /api/billing/summary(userId) : BillingStatDTO
  }

  ' === Payment Service ===
  class "Payment Service" as PaymentService {
    --
    + POST /api/payments/pay(invoiceId, method) : PaymentRedirectDTO
    + POST /api/payments/verify(transactionId) : PaymentStatusDTO
    + GET /api/payments/history(userId) : List<PaymentHistoryDTO>
    + GET /api/payments/{id}/status(paymentId) : PaymentStatusDTO
  }

  ' === Analytics Service ===
  class "Analytics Service" as AnalyticsService {
    --
    + POST /api/analytics/track(eventType, data) : void
    + GET /api/analytics/stats() : AnalyticsStatsDTO
    + GET /api/analytics/global(timeRange) : GlobalStatsDTO
    + GET /api/analytics/search(userId) : integer
    + GET /api/analytics/clicks(userId) : integer
    + GET /api/analytics/reservations(userId) : integer
    + GET /api/analytics/export(format, timeRange) : File
  }

  ' === Map Service ===
  class "Map Service" as MapService {
    --
    + GET /api/map/search(query) : List<PointDTO>
    + GET /api/map/nearby(lat, lon, radius) : List<PointDTO>
    + GET /api/map/bounds(northEastLat, bounds) : List<PointDTO>
    + GET /api/map/location(pointId) : LocationDTO
    + GET /api/map/distance(from, to) : DistanceDTO
  }

  ' === Provider Adapters (External Integration) ===
  class "Provider Adapter RedPlug" as RedAdapter {
    --
    + GET /api/adapter/points() : List<PointDTO>
    + POST /api/adapter/status(pointId) : StatusDTO
    + POST /api/adapter/reserve(data) : ReservationResponseDTO
  }

  class "Provider Adapter GreenPlug" as GreenAdapter {
    --
    + GET /api/adapter/points() : List<PointDTO>
    + POST /api/adapter/status(pointId) : StatusDTO
    + POST /api/adapter/reserve(data) : ReservationResponseDTO
  }

  class "Provider Adapter BluePlug" as BlueAdapter {
    --
    + GET /api/adapter/points() : List<PointDTO>
    + POST /api/adapter/status(pointId) : StatusDTO
    + POST /api/adapter/reserve(data) : ReservationResponseDTO
  }

  ' === Message Broker ===
  class "Message Broker Service" as MessageBrokerService {
    --
    + POST /publish(eventType, data) : EventResponseDTO
    + POST /subscribe(eventType, webhookUrl) : void
    + GET /diagnostics() : DiagnosticsDTO
    + POST /retry(eventId) : void
  }
}

' === Relationships ===
ApiGateway --> AuthService : routes /auth/*
ApiGateway --> ProviderMgmtService : routes /api/providers*
ApiGateway --> CentralService : routes /api/points, /ui/*
ApiGateway --> ReservationService : routes /api/reservations*
ApiGateway --> BillingService : routes /api/billing*
ApiGateway --> PaymentService : routes /api/payments*
ApiGateway --> AnalyticsService : routes /api/analytics*
ApiGateway --> MapService : routes /api/map*

ReservationService --> RedAdapter : calls adapter endpoints
ReservationService --> GreenAdapter : calls adapter endpoints
ReservationService --> BlueAdapter : calls adapter endpoints

CentralService --> MessageBrokerService : publishes events
ReservationService --> MessageBrokerService : publishes events
BillingService --> MessageBrokerService : publishes events
AnalyticsService --> MessageBrokerService : subscribes events
BillingService --> PaymentService : triggers payment

@enduml
