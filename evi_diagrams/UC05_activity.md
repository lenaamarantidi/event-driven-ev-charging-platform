@startuml UC05_Provider_Billing_Activity_Strict
title UC05: Provider Billing and Invoice View - Activity Diagram

!theme plain
skinparam backgroundColor #FEFEFE
skinparam activityBorderColor #2C3E50
skinparam activityBackgroundColor #ECF0F1
skinparam arrowColor #34495E

|Charging Points Provider|
start
:Open Provider Dashboard;
:Select Billing Tab;

|Provider UI|
:Check Local Data Cache;

if (Is Billing Data Cached Today?) then (Yes)
  :Load Dashboard from Cache;
else (No)
  |Provider UI|
  fork
    :Fetch Billing Summary;
  fork again
    :Fetch Outstanding Invoices;
  fork again
    :Fetch Payment History;
  end fork

  |API Gateway|
  :Route Requests to Billing Service;

  |Billing Service|
  :Validate Provider Identity;
  
  |Database|
  :Query current_usage, outstanding_invoices,\nand payment_history;

  |Billing Service|
  :Return Billing Data Responses;

  |Provider UI|
  :Cache Billing Data Locally;
  :Render Billing Dashboard;
endif

|Charging Points Provider|
if (Request Current Invoice?) then (Yes)
  |Provider UI|
  :Request Current Invoice Data;

  |Billing Service|
  :Determine Current Billing Period;

  |Database|
  :Query Invoice for Current Period;

  |Billing Service|
  if (Invoice Exists AND is PAID?) then (Yes)
    :Use Existing Paid Invoice;
  else (No / Not Paid)
    |Billing Service|
    :Request Billing Stats\n(fetchBillingStats);

    |Analytics Service|
    :Count successfulReservationsCount\nfor Billing Period;
    :Return Reservation Count;

    |Billing Service|
    :Calculate Monthly & Reservation Fees;
    :Generate or Regenerate\nInvoice & Line Items;
    
    |Database|
    :Save New/Updated Invoice Record;
  endif

  |Billing Service|
  :Return Current Invoice Data;

  |Provider UI|
  :Display Current Invoice;

  |Charging Points Provider|
  if (Click "Pay Invoice"?) then (Yes)
    :Initiate Payment Request\n(Proceed to UC07);
  else (No)
  endif

else (No)
  :Maintain Current View;
endif

stop
@enduml