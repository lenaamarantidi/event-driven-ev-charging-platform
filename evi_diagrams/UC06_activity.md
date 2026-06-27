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