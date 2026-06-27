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
:Select Filters (Period, Provider, Status);
:Submit Dashboard Request;

|Operator UI|
:Prepare Filter Parameters;
:Request Dashboard Data;

fork
  |API Gateway|
  :Route KPI Request;
  |Analytics Service|
  :Apply Analytics Filters;
  |Analytics DB|
  :Aggregate System Events;
  |Analytics Service|
  :Calculate Global KPIs\n(Applying Zero-Value Fallbacks);
  :Return Global KPIs;

fork again
  |API Gateway|
  :Route Timeseries Request;
  |Analytics Service|
  :Apply Analytics Filters;
  |Analytics DB|
  :Group Events by Month;
  |Analytics Service|
  :Return Timeseries Data;

fork again
  |API Gateway|
  :Route Rankings Request;
  |Analytics Service|
  :Apply Analytics Filters;
  |Analytics DB|
  :Aggregate Provider Data;
  |Analytics Service|
  :Calculate Provider Rankings;
  :Return Rankings Data;

fork again
  |API Gateway|
  :Route Providers Request;
  |Provider Management Service|
  :Retrieve Active Providers;
  :Return Provider List;

fork again
  |API Gateway|
  :Route Points Request;
  |Central Service|
  :Apply Status Filters;
  :Retrieve Charging Points;
  :Return Points List;
end fork

|Operator UI|
if (Are All Requests Successful?) then (Yes)
  :Normalize Provider & Point Lists;
  :Calculate Local Status Counts;
  :Store Dashboard Data Locally;
  :Render Operator Dashboard;
else (No)
  :Display Data Fetch Error;
  stop
endif

|saasPlug Operator|
:Review Global KPIs & Trends;
:Review Provider Rankings & Point Status;

if (Change Filters?) then (Yes)
  |Operator UI|
  :Update Filter State;
  :Trigger Data Refresh;
else (No)
  :Maintain Current View;
endif

stop
@enduml