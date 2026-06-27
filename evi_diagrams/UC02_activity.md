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