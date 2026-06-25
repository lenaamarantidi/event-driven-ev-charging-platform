@startuml

' Component Diagram

left to right direction
skinparam componentStyle rectangle
skinparam packageStyle rectangle
skinparam shadowing false
skinparam defaultFontName Arial
skinparam defaultTextAlignment center
skinparam componentFontSize 12
skinparam noteFontSize 12

package "User & External Systems" {
  component "Frontend\nhttps://github.com/ntua/saas26-11/tree/main/front-end" as Frontend
  component "External Provider APIs\nRed/Green/Blue" as ExternalProviders #LightBlue
}

package "SaaS System" {
  component "API Gateway\nhttps://github.com/ntua/saas26-11/tree/main/API_Gateway" as ApiGateway

  component "Auth Service\nhttps://github.com/ntua/saas26-11/tree/main/Auth_Service" as AuthService
  database "Auth DB\nhttps://github.com/ntua/saas26-11/tree/main/Auth_Service/db" as AuthDB

  component "Provider Management Service\nhttps://github.com/ntua/saas26-11/tree/main/Provider_Management_Service" as ProviderManagementService
  database "Provider DB\nhttps://github.com/ntua/saas26-11/tree/main/Provider_Management_Service/db" as ProviderDB

  component "Central Service\nhttps://github.com/ntua/saas26-11/tree/main/Points_Service" as CentralService
  database "Central DB\nhttps://github.com/ntua/saas26-11/tree/main/Points_Service/db" as CentralDB

  component "Reservation Service\nhttps://github.com/ntua/saas26-11/tree/main/Reservation_Service" as ReservationService
  database "Reservation DB\nhttps://github.com/ntua/saas26-11/tree/main/Reservation_Service/db" as ReservationDB

  component "Billing Service\nhttps://github.com/ntua/saas26-11/tree/main/Billing_Service" as BillingService
  database "Billing DB\nhttps://github.com/ntua/saas26-11/tree/main/Billing_Service/db" as BillingDB

  component "Analytics Service\nhttps://github.com/ntua/saas26-11/tree/main/Analytics_Service" as AnalyticsService
  database "Analytics DB\nhttps://github.com/ntua/saas26-11/tree/main/Analytics_Service/db" as AnalyticsDB

  component "Payment Service\nhttps://github.com/ntua/saas26-11/tree/main/Payment_Service" as PaymentService
  database "Payment DB\nhttps://github.com/ntua/saas26-11/tree/main/Payment_Service/db" as PaymentDB

  component "Map Service\nhttps://github.com/ntua/saas26-11/tree/main/Map_UI_Service" as MapService

  component "Provider Adapter RedPlug\nhttps://github.com/ntua/saas26-11/tree/main/Provider_Adapter_redPlug" as RedAdapter
  database "Red Provider DB\nhttps://github.com/ntua/saas26-11/tree/main/Provider_Adapter_redPlug/db" as RedDB

  component "Provider Adapter GreenPlug\nhttps://github.com/ntua/saas26-11/tree/main/Provider_Adapter_greenPlug" as GreenAdapter
  database "Green Provider DB\nhttps://github.com/ntua/saas26-11/tree/main/Provider_Adapter_greenPlug/db" as GreenDB

  component "Provider Adapter BluePlug\nhttps://github.com/ntua/saas26-11/tree/main/Provider_Adapter_bluePlug" as BlueAdapter
  database "Blue Provider DB\nhttps://github.com/ntua/saas26-11/tree/main/Provider_Adapter_bluePlug/db" as BlueDB

  component "Message Broker Service\nhttps://github.com/ntua/saas26-11/tree/main/message_broker" as MessageBroker
  component "RabbitMQ" as RabbitMQ
}

Frontend --> ApiGateway : HTTP / REST
ApiGateway --> AuthService : /auth/*
ApiGateway --> ProviderManagementService : /api/providers*
ApiGateway --> CentralService : /api/points, /ui/*
ApiGateway --> ReservationService : /api/reservations*
ApiGateway --> BillingService : /api/billing*
ApiGateway --> AnalyticsService : /api/analytics*
ApiGateway --> PaymentService : /api/payments*
ApiGateway --> MapService : /api/map*

AuthService --> AuthDB : user storage
ProviderManagementService --> ProviderDB : provider storage
CentralService --> CentralDB : point storage
ReservationService --> ReservationDB : reservation storage
BillingService --> BillingDB : billing storage
AnalyticsService --> AnalyticsDB : analytics storage
PaymentService --> PaymentDB : payment storage

ReservationService --> RedAdapter : REDPLUG_ADAPTER_URL
ReservationService --> GreenAdapter : GREENPLUG_ADAPTER_URL
ReservationService --> BlueAdapter : BLUEPLUG_ADAPTER_URL

RedAdapter --> RedDB : local provider storage
GreenAdapter --> GreenDB : local provider storage
BlueAdapter --> BlueDB : local provider storage

RedAdapter --> ExternalProviders : provider API
GreenAdapter --> ExternalProviders : provider API
BlueAdapter --> ExternalProviders : provider API

RedAdapter --> CentralService : sync points
GreenAdapter --> CentralService : sync points
BlueAdapter --> CentralService : sync points

BillingService --> PaymentService : payment processing

CentralService --> RabbitMQ : publish/subscribe
ReservationService --> RabbitMQ : publish/subscribe
BillingService --> RabbitMQ : publish/subscribe
AnalyticsService --> RabbitMQ : subscribe
MessageBroker --> RabbitMQ : relay

@enduml


@startuml
'Deployment Diagram

left to right direction
skinparam componentStyle rectangle
skinparam packageStyle rectangle
skinparam shadowing false
skinparam defaultFontName Arial
skinparam defaultTextAlignment center
skinparam componentFontSize 12
skinparam nodeFontSize 12
skinparam noteFontSize 12

actor "Browser / User" as Browser
actor "External Provider APIs\nRed/Green/Blue" as ExternalProviders

package "Docker Host / Docker Compose" {
  rectangle "Docker Network: saasplug-network" as Network {
    node "API Gateway Container\nHost Port: 4411" as ApiGatewayContainer {
      component "API Gateway\nPort: 4411" as ApiGatewayService
    }

    node "Frontend Service Container\nHost Port: 3311" as FrontendContainer {
      component "Frontend Service\nHost/Container Port: 3311" as FrontendServiceComponent
    }

    node "Auth Service Container\nHost Port: 5517" as AuthContainer {
      component "Auth Service\nPort: 3100" as AuthServiceComponent
    }

    node "Provider Management Container\nHost Port: 5516" as ProviderManagementContainer {
      component "Provider Management\nPort: 3101" as ProviderManagementComponent
    }

    node "Central Service Container\nHost Port: 5512" as CentralContainer {
      component "Central Service\nPort: 3001" as CentralServiceComponent
    }

    node "Reservation Service Container\nHost Port: 5513" as ReservationContainer {
      component "Reservation Service\nPort: 3009" as ReservationServiceComponent
    }

    node "Billing Service Container\nHost Port: 5514" as BillingContainer {
      component "Billing Service\nPort: 3103" as BillingServiceComponent
    }

    node "Payment Service Container\nHost Port: 5515" as PaymentContainer {
      component "Payment Service\nPort: 3107" as PaymentServiceComponent
    }

    node "Analytics Service Container\nHost Port: 5518" as AnalyticsContainer {
      component "Analytics Service\nPort: 3106" as AnalyticsServiceComponent
    }

    node "Map Service Container\nHost Port: 5519" as MapContainer {
      component "Map Service\nPort: 3105" as MapServiceComponent
    }

    node "Provider Adapter RedPlug Container\nHost Port: 5520" as RedAdapterContainer {
      component "Provider Adapter RedPlug\nPort: 3111" as RedAdapterServiceComponent
    }

    node "Provider Adapter GreenPlug Container\nHost Port: 5521" as GreenAdapterContainer {
      component "Provider Adapter GreenPlug\nPort: 3112" as GreenAdapterServiceComponent
    }

    node "Provider Adapter BluePlug Container\nHost Port: 5522" as BlueAdapterContainer {
      component "Provider Adapter BluePlug\nPort: 3113" as BlueAdapterServiceComponent
    }

    node "Message Broker Container\nHost Port: 5511" as MessageBrokerContainer {
      component "Message Broker\nPort: 3003" as MessageBrokerServiceComponent
    }

    node "RabbitMQ Container\nHost Ports: 5523/5672, 5524/15672" as RabbitMQContainer {
      component "RabbitMQ Broker\nPorts: 5672 (AMQP), 15672 (management)" as RabbitMQServiceComponent
    }

    node "Auth DB Container\nHost Port: 8311" as AuthDbContainer {
      component "Auth DB\nPort: 3306" as AuthDbService
    }

    node "Provider DB Container\nHost Port: 7411" as ProviderDbContainer {
      component "Provider DB\nPort: 3306" as ProviderDbService
    }

    node "Central DB Container\nHost Port: 6911" as CentralDbContainer {
      component "Central DB\nPort: 3306" as CentralDbService
    }

    node "Reservation DB Container\nHost Port: 7311" as ReservationDbContainer {
      component "Reservation DB\nPort: 3306" as ReservationDbService
    }

    node "Billing DB Container\nHost Port: 7911" as BillingDbContainer {
      component "Billing DB\nPort: 3306" as BillingDbService
    }

    node "Payment DB Container\nHost Port: 8111" as PaymentDbContainer {
      component "Payment DB\nPort: 3306" as PaymentDbService
    }

    node "Analytics DB Container\nHost Port: 8511" as AnalyticsDbContainer {
      component "Analytics DB\nPort: 3306" as AnalyticsDbService
    }

    node "Red Provider DB Container\nHost Port: 7011" as RedDbContainer {
      component "Red Provider DB\nPort: 3306" as RedDbService
    }

    node "Green Provider DB Container\nHost Port: 7111" as GreenDbContainer {
      component "Green Provider DB\nPort: 3306" as GreenDbService
    }

    node "Blue Provider DB Container\nHost Port: 7211" as BlueDbContainer {
      component "Blue Provider DB\nPort: 3306" as BlueDbService
    }
  }
}

Browser --> FrontendContainer : HTTP 3311
FrontendContainer --> ApiGatewayContainer : HTTP 4411

ApiGatewayContainer --> AuthContainer : /auth/*
ApiGatewayContainer --> ProviderManagementContainer : /api/providers*
ApiGatewayContainer --> CentralContainer : /api/points, /ui/*
ApiGatewayContainer --> ReservationContainer : /api/reservations*
ApiGatewayContainer --> BillingContainer : /api/billing*
ApiGatewayContainer --> PaymentContainer : /api/payments*
ApiGatewayContainer --> AnalyticsContainer : /api/analytics*
ApiGatewayContainer --> MapContainer : /api/map*

AuthContainer --> AuthDbContainer : JDBC / SQL
ProviderManagementContainer --> ProviderDbContainer : JDBC / SQL
CentralContainer --> CentralDbContainer : JDBC / SQL
ReservationContainer --> ReservationDbContainer : JDBC / SQL
BillingContainer --> BillingDbContainer : JDBC / SQL
PaymentContainer --> PaymentDbContainer : JDBC / SQL
AnalyticsContainer --> AnalyticsDbContainer : JDBC / SQL

ReservationContainer --> RedAdapterContainer : REDPLUG_ADAPTER_URL
ReservationContainer --> GreenAdapterContainer : GREENPLUG_ADAPTER_URL
ReservationContainer --> BlueAdapterContainer : BLUEPLUG_ADAPTER_URL

RedAdapterContainer --> RedDbContainer : JDBC / SQL
GreenAdapterContainer --> GreenDbContainer : JDBC / SQL
BlueAdapterContainer --> BlueDbContainer : JDBC / SQL

RedAdapterContainer --> ExternalProviders : provider API
GreenAdapterContainer --> ExternalProviders : provider API
BlueAdapterContainer --> ExternalProviders : provider API

BillingContainer --> PaymentContainer : payment processing

CentralContainer --> RabbitMQContainer : publish/subscribe
ReservationContainer --> RabbitMQContainer : publish/subscribe
BillingContainer --> RabbitMQContainer : publish/subscribe

@enduml
