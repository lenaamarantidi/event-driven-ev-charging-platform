@startuml DataStructures_ClassDiagram

skinparam classBackgroundColor #E1F5FF
skinparam classBorderColor #333333
skinparam classArrowColor #333333
skinparam shadowing false
skinparam defaultFontName Arial
skinparam packageStyle rectangle

left to right direction
title Request/Response Contracts by Service

package "Auth Service" {
  class RegisterRequest {
    email
    password
    username
    firstName
    lastName
    phone
  }

  class RegisterResponse {
    userId
    email
    role
    accessToken
    refreshToken
  }

  class LoginRequest {
    email
    username
    password
  }

  class LoginResponse {
    userId
    email
    role
    accessToken
    refreshToken
  }

  class RefreshRequest {
    refreshToken
  }

  class RefreshResponse {
    accessToken
    refreshToken
  }

  class ProfileResponse {
    userId
    username
    email
    firstName
    lastName
    phone
    googleId
  }

  class ChangePasswordRequest {
    currentPassword
    newPassword
  }

  class ChangePasswordResponse {
    message
  }
}

package "Provider Management Service" {
  class ProviderRegistrationRequest {
    provider_name
    provider_email
    company_tin
    password
    base_url
    api_key
    openapi_url
    endpoint_list_points
    endpoint_point_details
    endpoint_reserve
    endpoint_reserve_duration
  }

  class ProviderRegistrationResponse {
    message
    provider_id
    provider_name
    provider_email
    company_tin
    adapter_name
    integration_status
    base_url
    openapi_url
    status
    endpoints
    registered_at
  }

  class ProviderLoginRequest {
    provider_name
    password
  }

  class ProviderLoginResponse {
    providerId
    providerName
    accessToken
  }

  class ProviderListResponse {
    total
    providers
  }

  class ProviderDetailResponse {
    provider
  }

  class SuspendProviderResponse {
    message
    provider_id
    status
  }
}

package "Provider Adapter RedPlug" {
  class RedPlugAdapter {
    adapterName
    baseUrl
    endpointListPoints
    endpointPointDetails
    endpointReserve
    endpointReserveDuration
  }
}

package "Provider Adapter GreenPlug" {
  class GreenPlugAdapter {
    adapterName
    baseUrl
    endpointListPoints
    endpointPointDetails
    endpointReserve
    endpointReserveDuration
  }
}

package "Provider Adapter BluePlug" {
  class BluePlugAdapter {
    adapterName
    baseUrl
    endpointListPoints
    endpointPointDetails
    endpointReserve
    endpointReserveDuration
  }
}

package "Central Service" {
  class PointReserveRequest {
    pointId
    duration
    minutes
  }

  class PointReserveResponse {
    pointId
    provider
    status
    reservationEndTime
    reservationMinutes
    timestamp
    expiresIn
    message
  }
}

package "Reservation Service" {
  class ReservationCreateRequest {
    providerName
    pointId
    duration
    minutes
    userId
  }

  class ReservationCreateResponse {
    reservationId
    providerName
    pointId
    status
    reservationEndTime
    error
  }

  class ReservationListResponse {
    success
    count
    reservations
  }

  class ReservationDetailResponse {
    success
    reservation
  }

  class AdapterReserveRequest {
    pointId
    duration
    userId
  }
}

package "Billing Service" {
  class BillingStatsRequest {
    providerId
    billingPeriodStart
    billingPeriodEnd
  }

  class BillingStatsResponse {
    providerId
    billingPeriodStart
    billingPeriodEnd
    successfulReservationsCount
  }

  class PaymentCreateRequest {
    invoice_id
    provider_id
    amount
    status
    paymentMethod
    reference
    notes
  }

  class PaymentCreateResponse {
    message
    payment
  }

  class PaymentWebhookRequest {
    eventType
    data
  }
}

package "Payment Service" {
  class CreatePaymentRequest {
    invoice_id
    provider_id
    amount
    status
    paymentMethod
    reference
    notes
  }

  class PaymentRecordResponse {
    payment_id
    invoice_id
    provider_id
    amount
    payment_method
    reference
    notes
    status
    paid_at
  }

  class PaymentStatusRequest {
    status
  }

  class PaymentProcessedEvent {
    paymentId
    invoiceId
    providerId
    amount
    currency
    status
    paymentMethod
    reference
    notes
    paidAt
  }
}

package "Analytics Service" {
  class AnalyticsBillingRequest {
    providerId
    billingPeriodStart
    billingPeriodEnd
  }

  class AnalyticsBillingResponse {
    providerId
    billingPeriodStart
    billingPeriodEnd
    successfulReservationsCount
  }
}

package "Message Broker Service" {
  class WebhookSubscriptionRequest {
    eventType
    serviceId
    webhookUrl
  }

  class PublishEventRequest {
    eventType
    data
  }
}

package "API Gateway" {
  class ProxyRequest {
    method
    path
    headers
    body
    userId
  }

  class ProxyResponse {
    status
    data
    error
    timestamp
  }
}

RegisterRequest --> RegisterResponse
LoginRequest --> LoginResponse
RefreshRequest --> RefreshResponse
ChangePasswordRequest --> ChangePasswordResponse
ProviderRegistrationRequest --> ProviderRegistrationResponse
ProviderLoginRequest --> ProviderLoginResponse
PointReserveRequest --> PointReserveResponse
ReservationCreateRequest --> ReservationCreateResponse
BillingStatsRequest --> BillingStatsResponse
PaymentCreateRequest --> PaymentCreateResponse
CreatePaymentRequest --> PaymentRecordResponse
PaymentWebhookRequest --> PaymentProcessedEvent
ProxyRequest --> ProxyResponse

@enduml
