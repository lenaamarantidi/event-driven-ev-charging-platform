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