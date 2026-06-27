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
    |Database|
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
  
  |Database|
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