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

|EV User UI|
:Initialize Map Interface;
:Request Device Location;

if (Location Permission Granted?) then (Yes)
  :Set User Coordinates;
else (No)
  :Set Default Location (Athens);
  :Display Location Warning;
endif

fork
  :Establish Real-Time Event Stream;
fork again
  :Prepare Default Search Filters;
  :Request Charging Points Data;

  |API Gateway|
  :Route Points Request;

  |Points Service|
  :Validate & Process Query Parameters;
  
  |Database|
  :Retrieve Matching Charging Points;

  |Points Service|
  :Return Charging Points List;

  |EV User UI|
  if (Data Retrieval Successful?) then (Yes)
    :Normalize Point Data;
    :Calculate Distances & Sort;
  else (No)
    :Clear Map Markers;
    :Display Empty/Error State;
  endif
end fork

|External Map Service|
:Provide Geographical Map Tiles;

|EV User UI|
:Render Interactive Map;
:Render Clustered Point Markers;

|EV User|
if (User Searches Location?) then (Yes)
  :Enter Location Query;
  
  |EV User UI|
  :Request Geocoding;
  
  |External Geocoding Service|
  if (Location Found?) then (Yes)
    :Return Coordinates;
    |EV User UI|
    :Update Map Center;
    :Refresh Charging Points Data;
  else (No)
    :Return Empty Result;
    |EV User UI|
    :Display "Location Not Found" Message;
  endif
else (No)
endif

|EV User|
if (User Adjusts Filters?) then (Yes)
  :Update Filter Selections;
  |EV User UI|
  :Refresh Charging Points Data;
else (No)
endif

|EV User|
if (User Selects a Charging Point?) then (Yes)
  :Click on Marker or List Item;

  |EV User UI|
  if (Full Details Available Locally?) then (Yes)
  else (No)
    :Request Detailed Point Information;
    |API Gateway|
    :Route Details Request;
    |EV User UI|
    :Process Received Details;
  endif
  
  :Display Charging Point Info Panel;
  
  |EV User|
  if (User Requests Navigation?) then (Yes)
    |EV User UI|
    :Redirect to External Navigation App;
    stop
  else (No)
  endif
else (No)
endif

stop
@enduml