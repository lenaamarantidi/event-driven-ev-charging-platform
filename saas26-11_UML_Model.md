# Final Submission – UML Diagrams for SaaS Plug

This document consolidates the requested UML artifacts for submission. The content is organized from the existing implementation-aligned diagram sources, and only the missing titles were added where needed.

---

## 1. Activity Diagrams

### UC01 – Search and View Charging Points

```plantuml
@startuml UC01_Search_View_Charging_Points_Activity
title UC01: Search and View Charging Points - Activity Diagram

!theme plain
skinparam backgroundColor #FEFEFE
skinparam activityBorderColor #2C3E50
skinparam activityBackgroundColor #ECF0F1
skinparam arrowColor #34495E

|EV User|
start
:Open saasCharge Dashboard;
:View Map Interface;

|Frontend|
:Get Device Location;

if (Location Permission Granted?) then (Yes)
  :Use Current Coordinates;
else (No)
  :Use Default Location (Athens);
endif

:Request Charging Points Data;

|API Gateway|
:Route Request to Central Service;

|Central Service|
:Validate Query Parameters;
:Apply Location/Filter Criteria;

|Central DB|
:Retrieve Matching Charging Points;

|Central Service|
:Return Points List with Status;

|Frontend|
if (Data Retrieved Successfully?) then (Yes)
  :Normalize Point Data;
  :Calculate Distances;
  :Render Interactive Map;
  :Display Clustered Point Markers;
else (No)
  :Display Empty/Error State;
  stop
endif

|EV User|
if (User Adjusts Filters?) then (Yes)
  :Modify Filter Selections\n(location, status, price, etc);
  |Frontend|
  :Request Updated Points Data;
  |API Gateway|
  :Route Filtered Request;
  |Central Service|
  :Apply New Filters;
  |Central DB|
  :Retrieve Filtered Points;
  |Frontend|
  :Update Map Display;
endif

|EV User|
if (Select Charging Point?) then (Yes)
  |Frontend|
  :Click on Point Marker/List Item;
  
  if (Full Details Cached Locally?) then (Yes)
    :Display Info Panel\n(point data, price, status);
  else (No)
    |API Gateway|
    :Route Details Request;
    |Central Service|
    :Retrieve Point Details;
    |Frontend|
    :Cache Point Details;
    :Display Info Panel;
  endif

  |EV User|
  if (Request Reservation?) then (Yes)
    :Initiate Reservation Request\n(Proceed to UC02);
    stop
  else (No)
    :Continue Browsing;
  endif
endif

stop
@enduml
```

### UC02 – Reserve Charging Point

```plantuml
@startuml UC02_Reserve_Charging_Point_Activity_Perfect_Aligned
title UC02: Reserve Charging Point - Activity Diagram

!theme plain
skinparam backgroundColor #FEFEFE
skinparam activityBorderColor #2C3E50
skinparam activityBackgroundColor #ECF0F1
skinparam arrowColor #34495E

|EV User UI|
start
:Select Charging Point;
:Input Reservation Duration;
:Submit Reservation Request;

|API Gateway|
:Route request to Reservation Service;

|Reservation Service|
:Validate request data;

if (Is data valid?) then (No)
  :Return validation error;
  |EV User UI|
  :Display rejection message;
  stop
else (Yes)
  |Reservation Service|
  :Request point lookup;

  |Central Service|
  :Lookup point in Central DB;

  |Reservation Service|
  if (Point found?) then (No)
    :Return not found error;
    |EV User UI|
    :Display rejection message;
    stop
  else (Yes)
    |Reservation Service|
    :Determine provider from point details;
    :Request reservation via provider adapter;

    |Provider Adapter (RedPlug/GreenPlug/BluePlug)|
    :Map to provider-specific format;
    :Send reservation RPC request;

    |External Provider API|
    :Process reservation request;

    |Provider Adapter (RedPlug/GreenPlug/BluePlug)|
    :Normalize provider response;

    |Reservation Service|
    :Log reservation attempt in Reservation DB;

    if (Reservation confirmed?) then (No)
      :Publish reservation.completed event to Analytics;
      :Return failure response;
      |EV User UI|
      :Display failure message;
      stop
    else (Yes)
      :Calculate reservation expiry time;
      :Publish reservation_successful event;
      :Publish reservation.completed event;

      fork
        |Central Service|
        :Update point status;
        :Set reservation end time;
      fork again
        |Billing Service|
        :Process billable reservation event;
      fork again
        |Analytics Service|
        :Process reservation completion event;
      end fork

      |Reservation Service|
      :Return success response with expiry time;
      |EV User UI|
      :Display success message and expiry time;
      stop
    endif
  endif
endif
@enduml
```

### UC03 – Provider Registration

```plantuml
@startuml UC03_Provider_Registration_Activity_Final_Perfect
title UC03: Provider Registration - Activity Diagram

!theme plain
skinparam backgroundColor #FEFEFE
skinparam activityBorderColor #2C3E50
skinparam activityBackgroundColor #ECF0F1
skinparam arrowColor #34495E

|Charging Points Provider|
start
:Fill provider registration form;
:Submit registration request;

|Provider UI|
:Validate required fields;
:Forward registration request;

|API Gateway|
:Route request to Provider Management Service;

|Provider Management Service|
:Resolve optional integration fields;
if (OpenAPI URL provided?) then (Yes)
  :Fetch OpenAPI spec from provider URL;
  :Discover provider endpoints;
else (No)
endif

:Validate provider details;

if (Is data valid?) then (No)
  :Return validation error;
  |Provider UI|
  :Display form errors;
  stop
else (Yes)
  |Provider DB|
  :Check duplicate provider name, email, or TIN;
  
  |Provider Management Service|
  if (Duplicate found?) then (Yes)
    :Return conflict error;
    |Provider UI|
    :Display duplicate error message;
    stop
  else (No)
    |Provider Management Service|
    :Hash provider password;
    :Determine adapter assignment and integration status;
    
    |Provider DB|
    :Store new provider profile;
    
    |Provider Management Service|
    :Publish provider.registered event;
    
    fork
      |Analytics Service|
      :Process provider registration event;
      :Update registration statistics;
    fork again
      |Provider UI|
      :Display registration success;
      :Prompt provider to login;
    end fork
    
    stop
  endif
endif
@enduml
```

### UC04 – Provider Analytics

```plantuml
@startuml UC04_Provider_Analytics_Activity_Final_Complete
title UC04: Provider Analytics - Activity Diagram

!theme plain
skinparam backgroundColor #FEFEFE
skinparam activityBorderColor #2C3E50
skinparam activityBackgroundColor #ECF0F1
skinparam arrowColor #34495E

|Charging Points Provider|
start
:Open Provider Dashboard;
:Select Analytics Tab;

|Provider UI|
:Check Local Data Cache;

if (Is Data Cached Locally?) then (Yes)
  :Load Dashboard from Cache;
else (No)
  :Request KPIs & 6-Month Timeseries;

  |API Gateway|
  :Route Request to Analytics Service;

  |Analytics Service|
  :Validate Provider Identity;

  if (Is Provider Valid?) then (No)
    :Return Validation Error;
    |Provider UI|
    :Display Error Message;
    stop
  else (Yes)
    |Analytics DB|
    :Retrieve Provider Events;
    :Aggregate Monthly Data;

    |Analytics Service|
    :Calculate KPIs & Success Rates;
    :Generate Timeseries Data;
    :Return Analytics Response;

    |Provider UI|
    :Cache Analytics Locally;
    :Render Dashboard Charts & Metrics;
  endif
endif

|Charging Points Provider|
:Review Analytics Dashboard;

if (Change Period Filter?) then (Yes)
  :Select New Timeframe;
  
  |Provider UI|
  :Request Filtered Data;

  |Analytics Service|
  :Apply Time Filters;
  
  |Analytics DB|
  :Retrieve Filtered Events;
  
  |Analytics Service|
  :Return Filtered Data;
  
  |Provider UI|
  :Recalculate Metrics Locally;
  :Update Dashboard View;
else (No)
endif

|Charging Points Provider|
if (Request Data Export?) then (Yes)
  :Select Export Format (JSON/CSV);
  
  |Provider UI|
  :Request Export File;

  |Analytics Service|
  :Generate Exportable Logs;

  |Provider UI|
  :Provide File Download to User;
else (No)
endif

|Charging Points Provider|
if (Request Invoice Generation?) then (Yes)
  :Initiate Invoice Request\n(Proceed to UC05);
else (No)
endif

stop
@enduml
```

### UC05 – Provider Billing and Invoice View

```plantuml
@startuml UC05_Provider_Billing_Activity_Strict
title UC05: Provider Billing and Invoice View - Activity Diagram

!theme plain
skinparam backgroundColor #FEFEFE
skinparam activityBorderColor #2C3E50
skinparam activityBackgroundColor #ECF0F1
skinparam arrowColor #34495E

|Charging Points Provider|
start
:Open Provider Dashboard;
:Select Billing Tab;

|Provider UI|
:Check Local Data Cache;

if (Is Billing Data Cached Today?) then (Yes)
  :Load Dashboard from Cache;
else (No)
  |Provider UI|
  fork
    :Fetch Billing Summary;
  fork again
    :Fetch Outstanding Invoices;
  fork again
    :Fetch Payment History;
  end fork

  |API Gateway|
  :Route Requests to Billing Service;

  |Billing Service|
  :Validate Provider Identity;
  
  |Billing DB|
  :Query current_usage, outstanding_invoices,\nand payment_history;

  |Billing Service|
  :Return Billing Data Responses;

  |Provider UI|
  :Cache Billing Data Locally;
  :Render Billing Dashboard;
endif

|Charging Points Provider|
if (Request Current Invoice?) then (Yes)
  |Provider UI|
  :Request Current Invoice Data;

  |Billing Service|
  :Determine Current Billing Period;

  |Billing DB|
  :Query Invoice for Current Period;

  |Billing Service|
  if (Invoice Exists AND is PAID?) then (Yes)
    :Use Existing Paid Invoice;
  else (No / Not Paid)
    |Billing Service|
    :Request Billing Stats\n(fetchBillingStats);

    |Analytics Service|
    :Count successfulReservationsCount\nfor Billing Period;
    :Return Reservation Count;

    |Billing Service|
    :Calculate Monthly & Reservation Fees;
    :Generate or Regenerate\nInvoice & Line Items;
    
    |Billing DB|
    :Save New/Updated Invoice Record;
  endif

  |Billing Service|
  :Return Current Invoice Data;

  |Provider UI|
  :Display Current Invoice;

  |Charging Points Provider|
  if (Click "Pay Invoice"?) then (Yes)
    :Initiate Payment Request\n(Proceed to UC07);
  else (No)
  endif

else (No)
  :Maintain Current View;
endif

stop
@enduml
```

### UC06 – Operator Global Analytics Dashboard

```plantuml
@startuml UC06_Operator_Dashboard_Activity_Strict
title UC06: Operator Global Analytics Dashboard - Activity Diagram

!theme plain
skinparam backgroundColor #FEFEFE
skinparam activityBorderColor #2C3E50
skinparam activityBackgroundColor #ECF0F1
skinparam arrowColor #34495E

|saasPlug Operator|
start
:Open Operator Dashboard;
:Select filters (period, provider, status);
:Submit dashboard request;

|Operator UI|
:Prepare filter parameters;
:Request dashboard data;

fork
  |API Gateway|
  :Route global analytics request;
  |Analytics Service|
  :Apply analytics filters;
  |Analytics DB|
  :Query aggregated analytics events;
  |Analytics Service|
  :Calculate global metrics;
  :Return global analytics;

fork again
  |API Gateway|
  :Route timeseries analytics request;
  |Analytics Service|
  :Apply analytics filters;
  |Analytics DB|
  :Query reservation timeseries data;
  |Analytics Service|
  :Return timeseries analytics;

fork again
  |API Gateway|
  :Route rankings analytics request;
  |Analytics Service|
  :Apply analytics filters;
  |Analytics DB|
  :Query provider ranking data;
  |Analytics Service|
  :Return provider rankings;

fork again
  |API Gateway|
  :Route provider list request;
  |Provider Management Service|
  :Query Provider DB for active providers;
  :Return provider list;

fork again
  |API Gateway|
  :Route charging points request;
  |Central Service|
  :Apply status filters;
  :Query Central DB for charging points;
  :Return points list;
end fork

|Operator UI|
if (Data fetch successful?) then (Yes)
  :Normalize provider and point lists;
  :Compute local status counts;
  :Store dashboard data in UI state;
  :Render Operator Dashboard;
else (No)
  :Display data fetch error;
  stop
endif

|saasPlug Operator|
:Review global KPIs and trends;
:Review provider rankings and point status;

if (Change filters?) then (Yes)
  |Operator UI|
  :Update filter state;
  :Trigger data refresh;
else (No)
  :Maintain current view;
endif

stop
@enduml
```

---

## 2. Sequence Diagrams

### UC01 – View and Search Charging Points

```plantuml
@startuml
't Sequence UC01 - View and Search Charging Points
title UC01 - View and Search Charging Points (Current Implementation)

actor "EV User" as User
participant "EV User UI\nReact EVUserMap" as UI
participant "Browser\nGeolocation" as Geo
participant "Nominatim API" as Nominatim
participant "OpenStreetMap\nTiles" as OSM
participant "API Gateway" as ApiGateway
participant "Central Service" as CentralService
database "Central Points DB" as PointsDB

User -> UI: Open EV User Map page
activate UI

UI -> Geo: getCurrentPosition()
activate Geo
alt Location permission granted
  Geo --> UI: User coordinates
  UI -> UI: Set userLocation
else Location denied/unavailable
  Geo --> UI: Geolocation error
  UI -> UI: Keep default Athens location
  UI -> UI: Show location warning
end
deactivate Geo

UI -> ApiGateway: GET /api/points/events
activate ApiGateway
ApiGateway -> CentralService: Proxy SSE /api/points/events
activate CentralService
CentralService --> ApiGateway: SSE stream opened
ApiGateway --> UI: SSE stream opened
deactivate ApiGateway

UI -> OSM: Request map tiles
activate OSM
OSM --> UI: Tile images
deactivate OSM

UI -> UI: Build filters\nlat, lon, radius, cost, power,\navailability, connector, AC/DC
UI -> ApiGateway: GET /api/points?lat=&lon=&radius=&costMin=&costMax=&...
activate ApiGateway
ApiGateway -> CentralService: GET /api/points with filters
activate CentralService
CentralService -> CentralService: Validate and normalize filters
CentralService -> CentralService: Convert avail filters to statuses
CentralService -> CentralService: Convert connector labels to codes
CentralService -> PointsDB: SELECT * FROM points WHERE filters match
activate PointsDB
PointsDB --> CentralService: Matching charging points
deactivate PointsDB
CentralService --> ApiGateway: 200 OK { points }
deactivate CentralService
ApiGateway --> UI: 200 OK { points }
deactivate ApiGateway

UI -> UI: Normalize point fields
UI -> UI: Calculate distance from user location
UI -> UI: Sort points by distance
UI -> UI: Render clustered markers and list

alt User searches by address
  User -> UI: Type address and press Enter
  UI -> Nominatim: GET /search?format=json&q={address}
  activate Nominatim
  alt Location found
    Nominatim --> UI: [{ lat, lon, ... }]
    UI -> UI: Update userLocation and map center
    UI -> ApiGateway: GET /api/points with new lat/lon and filters
    activate ApiGateway
    ApiGateway -> CentralService: GET /api/points
    activate CentralService
    CentralService -> PointsDB: SELECT * FROM points WHERE filters match
    activate PointsDB
    PointsDB --> CentralService: Matching charging points
    deactivate PointsDB
    CentralService --> ApiGateway: 200 OK { points }
    deactivate CentralService
    ApiGateway --> UI: 200 OK { points }
    deactivate ApiGateway
    UI -> UI: Normalize, sort and rerender points
  else Location not found
    Nominatim --> UI: Empty result
    UI -> UI: Show "Location not found"
  end
  deactivate Nominatim
end

alt User changes filters
  User -> UI: Select filters and apply
  UI -> UI: Update local filter state
  UI -> ApiGateway: GET /api/points with updated filters
  activate ApiGateway
  ApiGateway -> CentralService: GET /api/points
  activate CentralService
  CentralService -> PointsDB: SELECT * FROM points WHERE filters match
  activate PointsDB
  PointsDB --> CentralService: Filtered charging points
  deactivate PointsDB
  CentralService --> ApiGateway: 200 OK { points }
  deactivate CentralService
  ApiGateway --> UI: 200 OK { points }
  deactivate ApiGateway
  UI -> UI: Normalize, sort and rerender points
end

User -> UI: Click charging point marker or list item
UI -> UI: Set selectedCharger
UI -> UI: Open InfoPanel

alt Selected point contains outlet data
  UI -> UI: Use outlets from selected point
else Outlet data missing
  UI -> ApiGateway: GET /api/ui/location/{pointId}
  activate ApiGateway
  alt Route available
    ApiGateway --> UI: 200 OK { outlets }
    UI -> UI: Display returned outlet details
  else Route unavailable / request fails
    ApiGateway --> UI: Error response
    UI -> UI: Display point details without outlet list
    end
    deactivate ApiGateway
end

UI -> UI: Display connector, power, price,\nstatus, distance and provider

alt Point status changes later
  CentralService --> ApiGateway: SSE event with updated point
  ApiGateway --> UI: SSE event with updated point
  UI -> UI: Normalize updated point
  UI -> UI: Update marker and InfoPanel
end

alt User requests navigation
  User -> UI: Click Navigate
  UI -> UI: Open Google Maps directions URL
end

deactivate CentralService
deactivate UI
@enduml
```

### UC02 – Reserve Charging Point

```plantuml
@startuml
' Sequence UC02 - Reserve Charging Point
title UC02 - Reserve Charging Point (Current Implementation)

actor "EV User" as User
participant "Frontend\nInfoPanel" as UI
participant "API Gateway" as ApiGateway
participant "Reservation Service" as ReservationService
participant "Message Broker\nRabbitMQ" as RabbitMQ
participant "Central Service" as CentralService
database "Central Points DB" as PointsDB
participant "Provider Adapter (Red/Green/Blue)" as ProviderAdapters
participant "External Provider APIs (Red/Green/Blue)" as ExternalProviders
database "Reservation DB" as ReservationDB
participant "Analytics Service" as AnalyticsService
database "Analytics DB" as AnalyticsDB

User -> UI: Select charging point
User -> UI: Click Reserve
UI -> UI: Show reservation panel
User -> UI: Enter reservation duration

UI -> ApiGateway: POST /api/reserve\n{ pointId, minutes, providerName? }
activate ApiGateway
ApiGateway -> ReservationService: POST /api/reserve
activate ReservationService

ReservationService -> ReservationService: Validate pointId and minutes
alt Invalid request
  ReservationService --> ApiGateway: 400 Bad Request
  ApiGateway --> UI: Validation error
  UI -> User: Display rejection message
else Valid request
  ReservationService -> ReservationService: Create reservationId

  ReservationService -> RabbitMQ: RPC publish points.lookup.request\nexchange: points.rpc
  activate RabbitMQ
  RabbitMQ -> CentralService: Deliver point lookup request
  activate CentralService
  CentralService -> PointsDB: SELECT * FROM points\nWHERE point_id = ?
  activate PointsDB
  PointsDB --> CentralService: Point row or empty result
  deactivate PointsDB
  CentralService --> RabbitMQ: RPC response\n{ found, point }
  deactivate CentralService
  RabbitMQ --> ReservationService: Point lookup response
  deactivate RabbitMQ

  alt Point not found
    ReservationService --> ApiGateway: 409 Conflict / not_found
    ApiGateway --> UI: Reservation error
    UI -> User: Display rejection message
  else Point found
    ReservationService -> ReservationService: Identify provider from point.provider_name
    ReservationService -> ReservationService: Check requested provider matches lookup provider

    alt Provider mismatch
      ReservationService --> ApiGateway: 409 Conflict
      ApiGateway --> UI: Provider mismatch error
      UI -> User: Display rejection message
    else Provider accepted
      ReservationService -> RabbitMQ: RPC publish adapter.<provider>.reserve\nexchange: adapter.sync.requests
      activate RabbitMQ
      RabbitMQ -> ProviderAdapters: Deliver reservation request\n{ pointId, minutes, userId }
      activate ProviderAdapters
      ProviderAdapters -> ProviderAdapters: Map to provider-specific endpoint/body
      ProviderAdapters -> ExternalProviders: POST provider reservation/hold endpoint
      activate ExternalProviders

      alt Provider rejects request
        ExternalProviders --> ProviderAdapters: Failure response / error
        ProviderAdapters --> RabbitMQ: RPC response\n{ success: false, reservation failed }
        deactivate ExternalProviders
        deactivate ProviderAdapters
        RabbitMQ --> ReservationService: Adapter failure response
        deactivate RabbitMQ

        ReservationService -> ReservationDB: INSERT reservation_logs\nstatus = failed
        activate ReservationDB
        ReservationDB --> Reservation: Insert OK
        deactivate ReservationDB

        ReservationService -> RabbitMQ: Publish reservation.completed\nexchange: saas_events\nstatus = failed
        activate RabbitMQ
        RabbitMQ -> AnalyticsService: Deliver reservation.completed
        deactivate RabbitMQ
        activate AnalyticsService
        AnalyticsService -> AnalyticsDB: INSERT reservation_events\nstatus = failed
        activate AnalyticsDB
        AnalyticsDB --> Analytics: Insert OK
        Analytics -> AnalyticsDB: Update provider_daily_stats
        Analytics -> AnalyticsDB: Update global_daily_stats
        AnalyticsDB --> Analytics: Update OK
        deactivate AnalyticsDB
        deactivate Analytics

        ReservationService --> ApiGateway: 409 Conflict
        ApiGateway --> UI: Reservation failed
        UI -> User: Display rejection message

      else Provider accepts request
        ExternalProviders --> ProviderAdapters: Reserved / held response
        ProviderAdapters -> ProviderAdapters: Normalize reservation response
        ProviderAdapters --> RabbitMQ: RPC response\n{ success: true, reservation }
        deactivate ExternalProviders
        deactivate ProviderAdapters
        RabbitMQ --> ReservationService: Adapter success response
        deactivate RabbitMQ

        ReservationService -> ReservationService: Format reservation end time
        ReservationService -> ReservationDB: INSERT reservation_logs\nstatus = confirmed
        activate ReservationDB
        ReservationDB --> ReservationService: Insert OK
        deactivate ReservationDB

        ReservationService -> RabbitMQ: Publish reservation_successful\nexchange: reservation_exchange
        activate RabbitMQ
        RabbitMQ -> CentralService: Deliver reservation_successful
        activate CentralService
        CentralService -> PointsDB: UPDATE points\nSET status, reservation_end_time
        activate PointsDB
        PointsDB --> CentralService: Update OK
        deactivate PointsDB
        CentralService -> CentralService: Schedule reservation expiry
        CentralService -> UI: SSE point update\nif client connected
        deactivate CentralService
        deactivate RabbitMQ

        ReservationService -> RabbitMQ: Publish reservation.completed\nexchange: saas_events\nstatus = success
        activate RabbitMQ
        RabbitMQ -> AnalyticsService: Deliver reservation.completed
        deactivate RabbitMQ
        activate AnalyticsService
        AnalyticsService -> AnalyticsDB: INSERT reservation_events\nstatus = success
        activate AnalyticsDB
        AnalyticsDB --> AnalyticsService: Insert OK
        AnalyticsService -> AnalyticsDB: Update provider_daily_stats
        AnalyticsService -> AnalyticsDB: Update global_daily_stats
        AnalyticsDB --> AnalyticsService: Update OK
        deactivate AnalyticsDB
        deactivate AnalyticsService

        ReservationService --> ApiGateway: 200 OK\n{ reservationId, pointid, status, reservationendtime }
        ApiGateway --> UI: Reservation success response
        UI -> User: Display success message
        UI -> UI: Close reservation panel
      end
    end
  end
end

deactivate ReservationService
deactivate ApiGateway
@enduml
```

### UC03 – Provider Registration

```plantuml
@startuml
' Sequence UC03 - Provider Registration
title UC03 - Provider Registration (Current Implementation)

actor "Charging Points Provider" as Provider
participant "Provider UI\nReact ProviderRegister" as UI
participant "API Gateway" as ApiGateway
participant "Provider Management Service" as ProviderManagementService
participant "OpenAPI Document URL" as OpenAPI
database "Provider DB" as ProviderDB
participant "Message Broker\nRabbitMQ" as RabbitMQ
participant "Analytics Service" as AnalyticsService
database "Analytics DB" as AnalyticsDB

Provider -> UI: Fill registration form
Provider -> UI: Submit registration
activate UI

UI -> UI: Validate required client fields
UI -> ApiGateway: POST /api/providers/register\nprovider details, credentials,\napi_key, endpoints or openapi_url
activate ApiGateway
ApiGateway -> ProviderManagementService: POST /api/providers/register
activate ProviderManagementService

ProviderManagementService -> ProviderManagementService: Read registration payload

alt OpenAPI URL provided
  ProviderManagementService -> OpenAPI: GET OpenAPI YAML/JSON
  activate OpenAPI
  alt OpenAPI loaded
    OpenAPI --> ProviderManagementService: OpenAPI document
    ProviderManagementService -> ProviderManagementService: Parse servers and paths
    ProviderManagementService -> ProviderManagementService: Discover list/details/reserve endpoints
  else OpenAPI unavailable or invalid
    OpenAPI --> ProviderManagementService: Error
    ProviderManagementService -> ProviderManagementService: Add discovery validation error
  end
  deactivate OpenAPI
else No OpenAPI URL
  ProviderManagementService -> ProviderManagementService: Use submitted endpoint configuration
end

ProviderManagementService -> ProviderManagementService: Validate provider_name
ProviderManagementService -> ProviderManagementService: Validate provider_email
ProviderManagementService -> ProviderManagementService: Validate company_tin
ProviderManagementService -> ProviderManagementService: Validate password
ProviderManagementService -> ProviderManagementService: Validate base_url and api_key
ProviderManagementService -> ProviderManagementService: Validate endpoint paths

alt Invalid registration data
  ProviderManagementService --> ApiGateway: 400 Bad Request\n{ error, details }
  ApiGateway --> UI: 400 validation response
  UI -> Provider: Display form errors
else Valid registration data
  ProviderManagementService -> ProviderDB: SELECT provider_id\nWHERE provider_name = ?
  activate ProviderDB
  ProviderDB --> ProviderManagementService: Existing provider or empty

  ProviderManagementService -> ProviderDB: SELECT provider_id\nWHERE provider_email = ?
  ProviderDB --> ProviderManagementService: Existing email or empty

  ProviderManagementService -> ProviderDB: SELECT provider_id\nWHERE company_tin = ?
  ProviderDB --> ProviderManagementService: Existing TIN or empty
  deactivate ProviderDB

  alt Duplicate provider/email/TIN
    ProviderManagementService --> ApiGateway: 409 Conflict
    ApiGateway --> UI: Duplicate registration error
    UI -> Provider: Display duplicate error
  else No duplicate
    ProviderManagementService -> ProviderManagementService: Hash provider password
    ProviderManagementService -> ProviderManagementService: Resolve adapter assignment

    alt Built-in provider name
      ProviderManagementService -> ProviderManagementService: adapter_name = existing adapter\nintegration_status = integrated
    else Custom provider name
      ProviderManagementService -> ProviderManagementService: adapter_name = null\nintegration_status = integration_pending
    end

    ProviderManagementService -> ProviderDB: INSERT providers record
    activate ProviderDB
    ProviderDB --> ProviderManagementService: New provider_id
    ProviderManagementService -> ProviderDB: SELECT created provider\nwithout password_hash
    ProviderDB --> ProviderManagementService: Created provider data
    deactivate ProviderDB

    ProviderManagementService -> RabbitMQ: Publish provider.registered\nexchange: saas_events
    activate RabbitMQ
    RabbitMQ -> AnalyticsService: Deliver provider.registered
    activate AnalyticsService
    AnalyticsService -> AnalyticsDB: INSERT IGNORE provider_registrations
    activate AnalyticsDB
    AnalyticsDB --> AnalyticsService: Insert OK
    deactivate AnalyticsDB
    AnalyticsService --> RabbitMQ: Ack
    deactivate AnalyticsService
    RabbitMQ --> ProviderManagementService: Publish result
    deactivate RabbitMQ

    ProviderManagementService --> ApiGateway: 201 Created\n{ provider_id, provider_name,\nstatus, endpoints }
    ApiGateway --> UI: 201 Created
    UI -> UI: Store providerId in localStorage
    UI -> Provider: Display registration success
    UI -> UI: Open Provider Dashboard
  end
end

deactivate ProviderManagementService
deactivate ApiGateway
deactivate UI
@enduml
```

### UC04 – Provider Analytics

```plantuml
@startuml
' Sequence UC04 - Provider Analytics
title UC04 - Provider Analytics (Current Implementation)

actor "Charging Points Provider" as Provider
participant "Provider UI\nReact ProviderDashboard" as UI
participant "API Gateway" as ApiGateway
participant "Analytics Service" as Analytics
database "Analytics DB" as AnalyticsDB
participant "Billing Service" as Billing
database "Billing DB" as BillingDB

Provider -> UI: Open Provider Dashboard
Provider -> UI: Select Analytics tab
activate UI

UI -> UI: Read providerId from localStorage
UI -> UI: Check analyticsLastFetch_{providerId}

alt Analytics already fetched today
  UI -> UI: Use existing dashboard state
  UI -> Provider: Display cached analytics
else Fetch analytics summary
  par Provider KPI summary
    UI -> ApiGateway: GET /api/analytics/providers/{providerId}
    activate ApiGateway
    ApiGateway -> AnalyticsService: GET /analytics/providers/{providerId}
    activate AnalyticsService
    AnalyticsService -> AnalyticsService: Validate providerId

    alt Invalid providerId
      AnalyticsService --> ApiGateway: 400 Bad Request
      ApiGateway --> UI: Error response
      UI -> Provider: Display analytics error
    else Valid providerId
      AnalyticsService -> AnalyticsDB: SELECT createdAt\nFROM provider_registrations\nWHERE providerId = ?
      activate AnalyticsDB
      AnalyticsDB --> AnalyticsService: Provider registration row or empty

      AnalyticsService -> AnalyticsDB: SELECT aggregate stats\nFROM reservation_events\nWHERE providerId = ?
      AnalyticsDB --> AnalyticsService: Reservation aggregates
      deactivate AnalyticsDB

      AnalyticsService -> AnalyticsService: Calculate totalReservations
      AnalyticsService -> AnalyticsService: Calculate successfulReservations
      AnalyticsService -> AnalyticsService: Calculate failedReservations
      AnalyticsService -> AnalyticsService: Calculate uniqueUsers
      AnalyticsService -> AnalyticsService: Calculate successRate
      AnalyticsService --> ApiGateway: 200 OK Provider KPI data
      deactivate AnalyticsService
      ApiGateway --> UI: 200 OK Provider KPI data
      deactivate ApiGateway
    end

  else Provider timeseries
    UI -> ApiGateway: GET /api/analytics/providers/{providerId}/timeseries
    activate ApiGateway
    ApiGateway -> AnalyticsService: GET /analytics/providers/{providerId}/timeseries
    activate AnalyticsService
    AnalyticsService -> AnalyticsService: Validate providerId

    alt Invalid providerId
      AnalyticsService --> ApiGateway: 400 Bad Request
      ApiGateway --> UI: Error response
    else Valid providerId
      AnalyticsService -> AnalyticsDB: SELECT month, COUNT(*), COUNT(DISTINCT userId)\nFROM reservation_events\nWHERE providerId = ? AND timestamp >= last 6 months\nGROUP BY month
      activate AnalyticsDB
      AnalyticsDB --> AnalyticsService: Monthly reservation/user counts
      deactivate AnalyticsDB

      AnalyticsService --> ApiGateway: 200 OK Timeseries data
      deactivate AnalyticsService
      ApiGateway --> UI: 200 OK Timeseries data
      deactivate ApiGateway
    end
  end

  UI -> UI: Store KPI values
  UI -> UI: Store reservationsPerMonth and usersPerMonth
  UI -> UI: Mark analytics as fetched today
  UI -> Provider: Display analytics cards and charts
end

alt Provider changes period filter
  Provider -> UI: Select day/week/month
  UI -> UI: Calculate startDate and endDate
  UI -> ApiGateway: GET /api/analytics/providers/{providerId}/export?format=json&startDate=&endDate=
  activate ApiGateway
  ApiGateway -> AnalyticsService: GET /analytics/providers/{providerId}/export
  activate AnalyticsService
  AnalyticsService -> AnalyticsService: Validate providerId and date filters
  AnalyticsService -> AnalyticsDB: SELECT * FROM reservation_events\nWHERE providerId = ? AND date range matches
  activate AnalyticsDB
  AnalyticsDB --> AnalyticsService: Reservation log rows
  deactivate AnalyticsDB
  AnalyticsService --> ApiGateway: 200 OK JSON logs
  deactivate AnalyticsService
  ApiGateway --> UI: 200 OK JSON logs
  deactivate ApiGateway
  UI -> UI: Calculate period totals locally
  UI -> UI: Calculate period success rate locally
  UI -> Provider: Display selected period analytics
end

alt Provider downloads/export logs
  Provider -> UI: Click export/download logs
  UI -> ApiGateway: GET /api/analytics/providers/{providerId}/export?format=csv|json
  activate ApiGateway
  ApiGateway -> AnalyticsService: GET /analytics/providers/{providerId}/export
  activate AnalyticsService
  AnalyticsService -> AnalyticsDB: SELECT * FROM reservation_events\nWHERE providerId = ? and optional dates
  activate AnalyticsDB
  AnalyticsDB --> AnalyticsService: Reservation log rows
  deactivate AnalyticsDB
  AnalyticsService -> AnalyticsService: Convert rows to CSV or JSON
  AnalyticsService --> ApiGateway: 200 OK file payload
  deactivate AnalyticsService
  ApiGateway --> UI: 200 OK file payload
  deactivate ApiGateway
  UI -> Provider: Download/display exported logs
end

alt Provider opens Billing tab from dashboard
  Provider -> UI: Select Billing tab
  UI -> ApiGateway: GET /api/billing/invoices/{providerId}
  activate ApiGateway
  ApiGateway -> BillingService: GET /api/billing/invoices/{providerId}
  activate BillingService
  BillingService -> BillingDB: SELECT invoices and line items\nWHERE provider_id = ?
  activate BillingDB
  BillingDB --> BillingService: Invoice history
  deactivate BillingDB
  BillingService --> ApiGateway: 200 OK Invoice history
  deactivate BillingService
  ApiGateway --> UI: 200 OK Invoice history
  deactivate ApiGateway
  UI -> Provider: Display invoice history
end

Provider -> UI: Exit dashboard or continue browsing
deactivate UI
@enduml
```

### UC05 – Billing Invoice and Payment

```plantuml
@startuml
' Sequence UC05 - Billing Invoice and Payment
title UC05 - Billing Invoice and Payment (Current Implementation)

actor "Charging Points Provider" as Provider
participant "Provider UI\nReact ProviderDashboard" as UI
participant "API Gateway" as ApiGateway
participant "Billing Service" as BillingService
database "Billing DB" as BillingDB
participant "Analytics Service" as AnalyticsService
database "Analytics DB" as AnalyticsDB
participant "Payment Service" as PaymentService
database "Payment DB" as PaymentDB
participant "Message Broker\nHTTP + RabbitMQ" as MessageBroker

Provider -> UI: Open Provider Dashboard
Provider -> UI: Select Billing tab
activate UI

UI -> UI: Read providerId from localStorage
UI -> UI: Check billingLastFetch_{providerId}

alt Billing data already fetched today
  UI -> UI: Use existing billing dashboard state
  UI -> Provider: Display cached invoices and summary
else Fetch billing data
  UI -> ApiGateway: GET /api/billing/invoices/{providerId}?limit=12
  activate ApiGateway
  ApiGateway -> BillingService: GET /api/billing/invoices/{providerId}
  activate BillingService
  BillingService -> BillingService: Validate providerId

  alt Invalid providerId
    BillingService --> ApiGateway: 400 Bad Request
    ApiGateway --> UI: Error response
    UI -> Provider: Display invoice error
  else Valid providerId
    BillingService -> BillingDB: SELECT * FROM invoices\nWHERE provider_id = ?\nORDER BY issued_at DESC
    activate BillingDB
    BillingDB --> BillingService: Invoice rows
    deactivate BillingDB
    BillingService --> ApiGateway: 200 OK invoice history
    deactivate BillingService
    ApiGateway --> UI: 200 OK invoice history
    deactivate ApiGateway
  end

  UI -> ApiGateway: GET /api/billing/summary/{providerId}
  activate ApiGateway
  ApiGateway -> BillingService: GET /api/billing/summary/{providerId}
  activate BillingService
  BillingService -> BillingService: Validate providerId
  BillingService -> BillingDB: SELECT current_usage,\noutstanding invoices,\npayment history
  activate BillingDB
  BillingDB --> BillingService: Billing summary data
  deactivate BillingDB
  BillingService --> ApiGateway: 200 OK billing summary
  deactivate BillingService
  ApiGateway --> UI: 200 OK billing summary
  deactivate ApiGateway

  UI -> UI: Store invoice history
  UI -> UI: Store billing summary
  UI -> UI: Mark billing as fetched today
  UI -> Provider: Display billing screen
end

alt Provider requests current invoice
  Provider -> UI: Request current invoice
  UI -> ApiGateway: GET /api/billing/invoice/{providerId}
  activate ApiGateway
  ApiGateway -> BillingService: GET /api/billing/invoice/{providerId}
  activate BillingService
  BillingService -> BillingService: Validate providerId
  BillingService -> BillingService: Determine current billing period

  BillingService -> BillingDB: SELECT invoice for provider\nand current billing period
  activate BillingDB
  BillingDB --> BillingService: Existing invoice or empty
  deactivate BillingDB

  BillingService -> AnalyticsService: POST /analytics/billing/request\n{ providerId, periodStart, periodEnd }
  activate AnalyticsService
  AnalyticsService -> AnalyticsService: Validate providerId and dates
  AnalyticsService -> AnalyticsDB: SELECT COUNT(*) FROM reservation_events\nWHERE providerId = ? AND status = 'success'\nAND timestamp in billing period
  activate AnalyticsDB
  AnalyticsDB --> AnalyticsService: successfulReservationsCount
  deactivate AnalyticsDB
  AnalyticsService --> BillingService: 200 OK billing stats
  deactivate AnalyticsService

  BillingService -> BillingDB: SELECT provider_pricing\nWHERE provider_id = ?
  activate BillingDB
  BillingDB --> BillingService: Pricing row or default pricing
  deactivate BillingDB

  alt Invoice missing or unpaid
    BillingService -> BillingService: Calculate monthly fee and reservation fees
    BillingService -> BillingDB: INSERT or UPDATE invoice
    activate BillingDB
    BillingDB --> BillingService: Invoice saved
    BillingService -> BillingDB: INSERT invoice_line_items
    BillingDB --> BillingService: Line items saved
    deactivate BillingDB
  else Existing paid invoice
    BillingService -> BillingService: Keep existing paid invoice
  end

  BillingService -> BillingDB: SELECT invoice_line_items\nWHERE invoice_id = ?
  activate BillingDB
  BillingDB --> BillingService: Line items
  deactivate BillingDB
  BillingService -> BillingDB: UPSERT current_usage
  activate BillingDB
  BillingDB --> BillingService: Usage saved
  deactivate BillingDB

  BillingService --> ApiGateway: 200 OK invoice DTO
  deactivate BillingService
  ApiGateway --> UI: 200 OK invoice DTO
  deactivate ApiGateway
  UI -> Provider: Display detailed invoice
end

alt Provider pays invoice
  Provider -> UI: Click Pay invoice
  UI -> ApiGateway: POST /api/billing/invoices/{providerId}/{invoiceId}/pay\n{ paymentMethod }
  activate ApiGateway
  ApiGateway -> BillingService: POST /api/billing/invoices/{providerId}/{invoiceId}/pay
  activate BillingService
  BillingService -> BillingService: Validate providerId and invoiceId
  BillingService -> BillingDB: SELECT * FROM invoices\nWHERE invoice_id = ? AND provider_id = ?
  activate BillingDB
  BillingDB --> Billing: Invoice row or empty
  deactivate BillingDB

  alt Invoice not found or already paid
    BillingService --> ApiGateway: 400/404 payment error
    ApiGateway --> UI: Payment error
    UI -> Provider: Display payment failure
  else Invoice payable
    Billing -> Payment: POST /api/payments\n{ invoice_id, provider_id, amount, status: paid }
    activate Payment
    Payment -> PaymentDB: INSERT Payment
    activate PaymentDB
    PaymentDB --> Payment: payment_id
    Payment -> PaymentDB: SELECT created Payment
    PaymentDB --> Payment: Payment row
    deactivate PaymentDB

    Payment -> Broker: POST /api/events/publish\npayment.processed
    activate Broker
    Broker -> Broker: Validate canonical event
    Broker -> BillingService: POST /api/webhooks/payment-processed
    activate BillingService
    Billing -> Billing: Validate payment.processed payload
    Billing -> BillingDB: SELECT invoice\nWHERE invoice_id = ? AND provider_id = ?
    activate BillingDB
    BillingDB --> Billing: Invoice row
    Billing -> BillingDB: UPDATE invoices\nSET status = PAID, paid_at = CURRENT_TIMESTAMP
    BillingDB --> Billing: Invoice updated
    Billing -> BillingDB: INSERT payment_history
    BillingDB --> Billing: Payment history saved
    deactivate BillingDB
    BillingService --> Broker: 200 OK webhook processed
    deactivate BillingService
    Broker --> Payment: 201 Created event accepted
    deactivate Broker

    Payment --> BillingService: 201 Created payment
    deactivate Payment

    BillingService --> ApiGateway: 200 OK payment request forwarded
    deactivate BillingService
    ApiGateway --> UI: 200 OK payment response
    deactivate ApiGateway

    UI -> ApiGateway: GET /api/billing/invoices/{providerId}?limit=12
    activate ApiGateway
    ApiGateway -> BillingService: GET invoice history
    activate BillingService
    BillingService -> BillingDB: SELECT updated invoices
    activate BillingDB
    BillingDB --> BillingService: Updated invoice rows
    deactivate BillingDB
    BillingService --> ApiGateway: 200 OK invoice history
    deactivate BillingService
    ApiGateway --> UI: 200 OK invoice history
    deactivate ApiGateway

    UI -> ApiGateway: GET /api/billing/summary/{providerId}
    activate ApiGateway
    ApiGateway -> BillingService: GET billing summary
    activate BillingService
    BillingService -> BillingDB: SELECT updated summary data
    activate BillingDB
    BillingDB --> BillingService: Updated summary
    deactivate BillingDB
    BillingService --> ApiGateway: 200 OK billing summary
    deactivate BillingService
    ApiGateway --> UI: 200 OK billing summary
    deactivate ApiGateway

    UI -> Provider: Display payment successful
  end
end

Provider -> UI: Exit billing screen or continue
deactivate UI
@enduml
```

### UC06 – Operator Global Analytics Dashboard

```plantuml
@startuml
' Sequence UC06 - Operator Global Analytics Dashboard
title UC06 - Operator Global Analytics Dashboard (Current Implementation)

actor "saasPlug Operator" as Operator
participant "Operator UI\nReact OperatorDashboard" as UI
participant "API Gateway" as ApiGateway
participant "Analytics Service" as AnalyticsService
database "Analytics DB" as AnalyticsDB
participant "Provider Management Service" as ProviderManagementService
database "Provider DB" as ProviderDB
participant "Central Service" as CentralService
database "Central Points DB" as PointsDB

Operator -> UI: Open Operator Dashboard
Operator -> UI: Select filters\nperiod, provider, status, date range
activate UI

UI -> UI: Build analytics filters\nproviderId, startDate, endDate
UI -> UI: Build points filters\nproviderName, status

par Global analytics
  UI -> ApiGateway: GET /api/analytics/global?period=&providerId=&startDate=&endDate=
  activate ApiGateway
  ApiGateway -> AnalyticsService: GET /analytics/global
  activate AnalyticsService
  Analytics -> Analytics: Build analytics filters
  Analytics -> AnalyticsDB: SELECT COUNT(*) FROM user_registrations
  activate AnalyticsDB
  AnalyticsDB --> Analytics: totalUsers
  Analytics -> AnalyticsDB: SELECT COUNT(*) FROM provider_registrations\nwith optional provider filter
  AnalyticsDB --> Analytics: totalProviders
  Analytics -> AnalyticsDB: SELECT aggregate stats\nFROM reservation_events\nWHERE filters match
  AnalyticsDB --> Analytics: reservation aggregates
  deactivate AnalyticsDB
  Analytics -> Analytics: Calculate totalReservations
  Analytics -> Analytics: Calculate successfulReservations
  Analytics -> Analytics: Calculate failedReservations
  Analytics -> Analytics: Calculate uniqueUsers
  Analytics -> Analytics: Calculate uniquePoints
  Analytics -> Analytics: Calculate successRate
  AnalyticsService --> ApiGateway: 200 OK global analytics
  deactivate AnalyticsService
  ApiGateway --> UI: 200 OK global analytics
  deactivate ApiGateway

else Global timeseries
  UI -> ApiGateway: GET /api/analytics/global/timeseries?period=&providerId=&startDate=&endDate=
  activate ApiGateway
  ApiGateway -> AnalyticsService: GET /analytics/global/timeseries
  activate AnalyticsService
  Analytics -> Analytics: Build analytics filters
  Analytics -> AnalyticsDB: SELECT monthly reservation and user counts\nFROM reservation_events
  activate AnalyticsDB
  AnalyticsDB --> Analytics: reservationsPerMonth, usersPerMonth
  Analytics -> AnalyticsDB: SELECT provider registrations per month
  AnalyticsDB --> Analytics: providersPerMonth
  deactivate AnalyticsDB
  AnalyticsService --> ApiGateway: 200 OK global timeseries
  deactivate AnalyticsService
  ApiGateway --> UI: 200 OK global timeseries
  deactivate ApiGateway

else Provider rankings
  UI -> ApiGateway: GET /api/analytics/global/rankings?period=&providerId=&startDate=&endDate=
  activate ApiGateway
  ApiGateway -> AnalyticsService: GET /analytics/global/rankings
  activate AnalyticsService
  Analytics -> Analytics: Build analytics filters
  Analytics -> AnalyticsDB: SELECT provider aggregates\nFROM reservation_events\nGROUP BY providerId, providerName
  activate AnalyticsDB
  AnalyticsDB --> Analytics: Provider aggregate rows
  deactivate AnalyticsDB
  Analytics -> Analytics: Calculate ranking metrics
  AnalyticsService --> ApiGateway: 200 OK provider rankings
  deactivate AnalyticsService
  ApiGateway --> UI: 200 OK provider rankings
  deactivate ApiGateway

else Provider list
  UI -> ApiGateway: GET /api/providers
  activate ApiGateway
  ApiGateway -> ProviderManagementService: GET /api/providers
  activate ProviderManagementService
  ProviderManagementService -> ProviderDB: SELECT providers\nWHERE status = active
  activate ProviderDB
  ProviderDB --> ProviderManagementService: Provider rows
  deactivate ProviderDB
  ProviderManagementService --> ApiGateway: 200 OK providers
  deactivate ProviderManagementService
  ApiGateway --> UI: 200 OK providers
  deactivate ApiGateway

else Points overview
  UI -> ApiGateway: GET /api/points?provider=&status=
  activate ApiGateway
  ApiGateway -> CentralService: GET /api/points
  activate CentralService
  CentralService -> CentralService: Validate provider/status filters
  CentralService -> PointsDB: SELECT * FROM points\nWHERE filters match
  activate PointsDB
  PointsDB --> CentralService: Point rows
  deactivate PointsDB
  CentralService --> ApiGateway: 200 OK points
  deactivate CentralService
  ApiGateway --> UI: 200 OK points
  deactivate ApiGateway
end

alt Global analytics request failed
  UI -> UI: Set error message
  UI -> Operator: Display analytics unavailable
else Data loaded
  UI -> UI: Normalize provider list
  UI -> UI: Normalize points list
  UI -> UI: Calculate point status counts locally
  UI -> UI: Calculate available points
  UI -> UI: Store global KPIs
  UI -> UI: Store timeseries
  UI -> UI: Store provider rankings
  UI -> Operator: Display global analytics dashboard
end

alt Operator changes filters
  Operator -> UI: Update filters
  UI -> UI: Rebuild query filters
  UI -> ApiGateway: Repeat analytics/providers/points requests
  ApiGateway --> UI: Updated responses
  UI -> Operator: Refresh dashboard
end

Operator -> UI: Exit dashboard or continue
deactivate UI
@enduml
```

---

## 3. Class Diagrams

### API Class Diagram

```plantuml
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

  class "API Gateway" as ApiGateway {
    --
    + GET /health
    + GET /api/status
  }

  class "Auth Service" as AuthService {
    --
    + POST /auth/register(username, password) : AuthResponseDTO
    + POST /auth/login(credentials) : AuthResponseDTO
    + POST /auth/logout() : void
    + GET /auth/validate(token) : UserProfileDTO
    + POST /auth/refresh(refreshToken) : AuthResponseDTO
    + GET /auth/profile(userId: integer) : UserProfileDTO
  }

  class "Provider Management Service" as ProviderMgmtService {
    --
    + POST /api/providers/register(data) : ProviderRegDTO
    + GET /api/providers/list() : List<ProviderProfileDTO>
    + GET /api/providers/profile(providerId) : ProviderProfileDTO
    + PATCH /api/providers/profile(providerId, data) : void
    + GET /api/providers/points(providerId) : List<PointDTO>
  }

  class "Central Service" as CentralService {
    --
    + GET /api/points/all(filters) : List<PointDTO>
    + GET /api/points/{id}(integer) : PointDTO
    + POST /api/points/filter(filters) : List<PointDTO>
    + GET /api/points/status(pointId) : StatusDTO
    + GET /ui/points(location, bounds) : List<PointDTO>
    + POST /api/points/subscribe(webhookUrl) : void
  }

  class "Reservation Service" as ReservationService {
    --
    + POST /api/reserve(data) : ReservationResponseDTO
    + POST /api/reservations(data) : ReservationResponseDTO
    + GET /api/reservations/{id}(integer) : ReservationResponseDTO
    + POST /api/reservations/{id}/confirm(userId) : StatusDTO
    + GET /api/reservations/user(userId) : List<ReservationResponseDTO>
    + GET /api/reservations/{id}/status(reservationId) : StatusDTO
  }

  class "Billing Service" as BillingService {
    --
    + GET /api/billing/invoices(userId, dateRange) : List<InvoiceDTO>
    + GET /api/billing/invoices/{id}(invoiceId) : InvoiceDTO
    + PATCH /api/billing/invoices/{id}/status(invoiceId, status) : void
    + POST /api/billing/process(invoiceId, paymentMethod) : void
    + GET /api/billing/summary(userId) : BillingStatDTO
  }

  class "Payment Service" as PaymentService {
    --
    + POST /api/payments/pay(invoiceId, method) : PaymentRedirectDTO
    + POST /api/payments/verify(transactionId) : PaymentStatusDTO
    + GET /api/payments/history(userId) : List<PaymentHistoryDTO>
    + GET /api/payments/{id}/status(paymentId) : PaymentStatusDTO
  }

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

  class "Map Service" as MapService {
    --
    + GET /api/map/search(query) : List<PointDTO>
    + GET /api/map/nearby(lat, lon, radius) : List<PointDTO>
    + GET /api/map/bounds(northEastLat, bounds) : List<PointDTO>
    + GET /api/map/location(pointId) : LocationDTO
    + GET /api/map/distance(from, to) : DistanceDTO
  }

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

  class "Message Broker Service" as MessageBrokerService {
    --
    + POST /publish(eventType, data) : EventResponseDTO
    + POST /subscribe(eventType, webhookUrl) : void
    + GET /diagnostics() : DiagnosticsDTO
    + POST /retry(eventId) : void
  }
}

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
```

### Data Structures Class Diagram

```plantuml
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
    billingPeriod
  }

  class BillingStatsResponse {
    providerId
    invoiceId
    totalAmount
    status
  }
}

@enduml
```

---

## 4. Component and Deployment Diagrams

### Component Diagram

```plantuml
@startuml
title Component Diagram

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
```

### Deployment Diagram

```plantuml
@startuml
title Deployment Diagram

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

@enduml
```

---

## 5. ER Diagram

```plantuml
@startuml ER_Diagrams

skinparam packageStyle rectangle
skinparam classBackgroundColor #F8F9FA
skinparam classBorderColor #333333
skinparam classArrowColor #333333
skinparam shadowing false
skinparam defaultFontName Arial

left to right direction
title ER Diagram by Database (based on current schema files)

package "Auth DB" {
  entity User {
    * user_id : int
    --
    username : varchar
    email : varchar
    password_hash : varchar
    google_id : varchar
    first_name : varchar
    last_name : varchar
    phone : varchar
    refresh_token_hash : varchar
    created_at : datetime
    updated_at : datetime
  }
}

package "Provider DB" {
  entity provider_points {
    * id : varchar(36)
    --
    point_id : varchar(255)
    lon : decimal
    lat : decimal
    status : varchar(50)
    capacity_kw : int
    kwh_price : decimal
    reservation_end_time : timestamp
    last_synced : timestamp
    created_at : timestamp
    updated_at : timestamp
  }

  entity provider_point_changes {
    * id : varchar(36)
    --
    point_id : varchar(255)
    field_name : varchar(100)
    old_value : varchar(255)
    new_value : varchar(255)
    changed_at : timestamp
  }

  provider_points ||--o{ provider_point_changes : point_id
}

package "Central DB" {
  entity points {
    * id : varchar(36)
    --
    point_id : varchar(255)
    provider_name : varchar(50)
    lon : decimal
    lat : decimal
    status : varchar(50)
    capacity_kw : int
    kwh_price : decimal
    connector : varchar(255)
    location_name : varchar(255)
    address : varchar
    reservation_end_time : timestamp
    last_updated : timestamp
    created_at : timestamp
  }

  entity points_history {
    * id : varchar(36)
    --
    point_id : varchar(255)
    provider_name : varchar(50)
    old_status : varchar(50)
    new_status : varchar(50)
    change_timestamp : timestamp
  }

  entity provider_points {
    * id : varchar(36)
    --
    provider_name : varchar(50)
    point_id : varchar(255)
    imported_at : timestamp
  }

  points ||--o{ points_history : point_id
  points ||--o{ provider_points : point_id
}

package "Reservation DB" {
  entity reservation_logs {
    * id : int
    --
    reservation_id : varchar(36)
    provider_id : int
    provider_name : varchar(50)
    point_id : varchar(100)
    duration : int
    user_id : varchar(36)
    status : varchar(50)
    reservation_details : json
    created_at : timestamp
    updated_at : timestamp
  }

  entity reservation_statistics {
    * id : int
    --
    date_key : date
    provider_id : int
    provider_name : varchar(50)
    total_reservations : int
    successful_reservations : int
    failed_reservations : int
    total_duration_minutes : int
    average_duration_minutes : int
    created_at : timestamp
    updated_at : timestamp
  }
}

package "Billing DB" {
  entity invoices {
    * invoice_id : int
    --
    provider_id : int
    billing_period_start : date
    billing_period_end : date
    successful_reservations_count : int
    monthly_fee : decimal
    reservation_price : decimal
    total_amount : decimal
    tax_amount : decimal
    grand_total : decimal
    status : varchar(50)
    issued_at : timestamp
    due_date : date
    paid_at : timestamp
  }

  entity invoice_line_items {
    * line_id : int
    --
    invoice_id : int
    description : varchar(255)
    quantity : int
    unit_price : decimal
    line_total : decimal
  }

  entity provider_pricing {
    * provider_id : int
    --
    monthly_fee : decimal
    reservation_price : decimal
    created_at : timestamp
    updated_at : timestamp
  }

  entity current_usage {
    * provider_id : int
    --
    billing_period : date
    successful_reservations : int
    monthly_fee : decimal
    reservation_price : decimal
    estimated_amount : decimal
    updated_at : timestamp
  }

  entity payment_history {
    * payment_id : int
    --
    invoice_id : int
    provider_id : int
    amount : decimal
    payment_method : varchar(50)
    reference : varchar(255)
    status : varchar(50)
    notes : varchar(500)
    paid_at : timestamp
  }

  invoices ||--o{ invoice_line_items : invoice_id
  invoices ||--o{ payment_history : invoice_id
  provider_pricing ||--o{ current_usage : provider_id
}

package "Payment DB" {
  entity Payment {
    * payment_id : int
    --
    invoice_id : int
    provider_id : int
    amount : decimal
    payment_method : varchar(100)
    reference : varchar(255)
    notes : varchar(500)
    status : varchar(255)
    paid_at : timestamp
  }
}

package "Analytics DB" {
  entity user_registrations {
    * id : int
    --
    userId : varchar(255)
    createdAt : timestamp
  }
}

@enduml
```
