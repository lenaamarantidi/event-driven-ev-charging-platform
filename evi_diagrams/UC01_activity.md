@startuml UC01_View_Search_Charging_Points_Activity_Clean
title UC01: View and Search Charging Points - Activity Diagram

!theme plain
skinparam backgroundColor #FEFEFE
skinparam activityBorderColor #2C3E50
skinparam activityBackgroundColor #ECF0F1
skinparam arrowColor #34495E

|EV User|
start
:Open EV User Map Dashboard;

|Frontend|
:Initialize Map Interface;
:Request Device Location;

if (Location Permission Granted?) then (Yes)
  :Set User Coordinates;
else (No)
  :Set Default Location (Athens);
  :Display Location Warning;
endif

:Request Charging Points Data;

|API Gateway|
:Route Request to Central Service;

|Central Service|
:Validate & Process Query Parameters;

|Central DB|
:Retrieve Matching Charging Points;

|Central Service|
:Return Charging Points List;

|Frontend|
if (Data Retrieval Successful?) then (Yes)
  :Normalize Point Data;
  :Calculate Distances & Sort;
else (No)
  :Clear Map Markers;
  :Display Empty/Error State;
endif

:Render Interactive Map;
:Render Clustered Point Markers;
:Display Charging Points on Map;

|EV User|
if (User Adjusts Filters?) then (Yes)
  :Update Filter Selections;
  |Frontend|
  :Refresh Charging Points Data;
  :Update Map Display;
else (No)
endif

|EV User|
if (User Selects a Charging Point?) then (Yes)
  :Click on Marker or List Item;

  |Frontend|
  if (Full Details Available Locally?) then (Yes)
    :Display Charging Point Info Panel;
  else (No)
    :Request Detailed Point Information;
    |API Gateway|
    :Route Details Request;
    |Central Service|
    :Retrieve Point Details;
    |Frontend|
    :Display Charging Point Info Panel;
  endif
  
  |EV User|
  if (User Requests Navigation?) then (Yes)
    |Frontend|
    :Redirect to External Navigation App;
    stop
  else (No)
  endif
else (No)
endif

stop
@enduml