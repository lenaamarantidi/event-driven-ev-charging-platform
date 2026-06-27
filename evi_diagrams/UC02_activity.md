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
:Route Request to Reservation Service;

|Reservation Service|
:Validate Request Data;

if (Is Data Valid?) then (No)
  :Return Validation Error;
  |EV User UI|
  :Display Rejection Message;
  stop
else (Yes)
  |Reservation Service|
  :Request Point Details;

  |Points Service|
  :Lookup Point in Database;

  |Reservation Service|
  if (Point Found?) then (No)
    :Return Not Found Error;
    |EV User UI|
    :Display Rejection Message;
    stop
  else (Yes)
    |Reservation Service|
    :Identify Point Provider;

    |Provider Adapter|
    :Map Request to Provider Format;
    :Call External Provider API;

    |Provider API|
    :Process Reservation Request;

    |Provider Adapter|
    :Normalize Provider Response;

    |Reservation Service|
    :Log Reservation Attempt;

    if (Provider Reservation Status?) then (Failed)
      :Broadcast Reservation Failure;
      :Return Failure Response;
      
      |EV User UI|
      :Display Rejection Message;
      stop
      
    else (Confirmed)
      |Reservation Service|
      :Calculate Reservation Expiry Time;
      :Broadcast Reservation Success Event;

      fork
        |Analytics Service|
        :Process Reservation Event;
        :Update Usage Statistics;
        
      fork again
        |Billing Service|
        :Process Reservation Event;
        :Record Billable Event for Provider;
        
      fork again
        |Reservation Service|
        :Return Success Response\n(with Expiry Time);
        
        |EV User UI|
        :Display Success Message\n& Expiry Time;
        :Close Reservation Panel;
      end fork
      
      stop
    endif
  endif
endif
@enduml