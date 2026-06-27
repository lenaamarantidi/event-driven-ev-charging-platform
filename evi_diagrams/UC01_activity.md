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