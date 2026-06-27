@startuml UC03_Provider_Registration_Activity_Final_Perfect
title UC03: Provider Registration - Activity Diagram

!theme plain
skinparam backgroundColor #FEFEFE
skinparam activityBorderColor #2C3E50
skinparam activityBackgroundColor #ECF0F1
skinparam arrowColor #34495E

|Charging Points Provider|
start
:Fill Provider Registration Form;
:Submit Registration Request;

|Provider UI|
:Validate Required Fields;
:Forward Registration Request;

|API Gateway|
:Route Request to Provider Management;

|Provider Management Service|
if (OpenAPI URL Provided?) then (Yes)
  :Extract Endpoints via OpenAPI;
else (No)
endif

:Validate Provider Details & Endpoints;

if (Is Data Valid?) then (No)
  :Return Validation Error;
  |Provider UI|
  :Display Form Errors;
  stop
else (Yes)
  |Provider DB|
  :Check Duplicate Name, Email, or TIN;
  
  |Provider Management Service|
  if (Duplicate Found?) then (Yes)
    :Return Conflict Error;
    |Provider UI|
    :Display Duplicate Error Message;
    stop
  else (No)
    |Provider Management Service|
    :Secure Provider Credentials;
    :Determine Integration Status;
    
    |Provider DB|
    :Store New Provider Profile;
    
    |Provider Management Service|
    :Broadcast "Provider Registered" Event;
    
    fork
      |Analytics Service|
      :Process Registration Event;
      :Update Registration Statistics;
    fork again
      |Provider Management Service|
      :Return Registration Success;
      
      |Provider UI|
      :Save Session Data Locally;
      :Display Success Message;
      :Navigate to Provider Dashboard;
    end fork
    
    stop
  endif
endif
@enduml