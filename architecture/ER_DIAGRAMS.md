@startuml ER_Diagrams

skinparam packageStyle rectangle
skinparam classBackgroundColor #F8F9FA
skinparam classBorderColor #333333
skinparam classArrowColor #333333
skinparam shadowing false
skinparam defaultFontName Arial

left to right direction
title ER Diagram by Database (based on current schema files)

package "Auth DB" {
  entity User {
    * user_id : int
    --
    username : varchar
    email : varchar
    password_hash : varchar
    google_id : varchar
    first_name : varchar
    last_name : varchar
    phone : varchar
    refresh_token_hash : varchar
    created_at : datetime
    updated_at : datetime
  }
}

package "Provider DB" {
  entity provider_points {
    * id : varchar(36)
    --
    point_id : varchar(255)
    lon : decimal
    lat : decimal
    status : varchar(50)
    capacity_kw : int
    kwh_price : decimal
    reservation_end_time : timestamp
    last_synced : timestamp
    created_at : timestamp
    updated_at : timestamp
  }

  entity provider_point_changes {
    * id : varchar(36)
    --
    point_id : varchar(255)
    field_name : varchar(100)
    old_value : varchar(255)
    new_value : varchar(255)
    changed_at : timestamp
  }

  provider_points ||--o{ provider_point_changes : point_id
}

package "Central DB" {
  entity points {
    * id : varchar(36)
    --
    point_id : varchar(255)
    provider_name : varchar(50)
    lon : decimal
    lat : decimal
    status : varchar(50)
    capacity_kw : int
    kwh_price : decimal
    connector : varchar(255)
    location_name : varchar(255)
    address : varchar
    reservation_end_time : timestamp
    last_updated : timestamp
    created_at : timestamp
  }

  entity points_history {
    * id : varchar(36)
    --
    point_id : varchar(255)
    provider_name : varchar(50)
    old_status : varchar(50)
    new_status : varchar(50)
    change_timestamp : timestamp
  }

  entity provider_points {
    * id : varchar(36)
    --
    provider_name : varchar(50)
    point_id : varchar(255)
    imported_at : timestamp
  }

  points ||--o{ points_history : point_id
  points ||--o{ provider_points : point_id
}

package "Reservation DB" {
  entity reservation_logs {
    * id : int
    --
    reservation_id : varchar(36)
    provider_id : int
    provider_name : varchar(50)
    point_id : varchar(100)
    duration : int
    user_id : varchar(36)
    status : varchar(50)
    reservation_details : json
    created_at : timestamp
    updated_at : timestamp
  }

  entity reservation_statistics {
    * id : int
    --
    date_key : date
    provider_id : int
    provider_name : varchar(50)
    total_reservations : int
    successful_reservations : int
    failed_reservations : int
    total_duration_minutes : int
    average_duration_minutes : int
    created_at : timestamp
    updated_at : timestamp
  }
}

package "Billing DB" {
  entity invoices {
    * invoice_id : int
    --
    provider_id : int
    billing_period_start : date
    billing_period_end : date
    successful_reservations_count : int
    monthly_fee : decimal
    reservation_price : decimal
    total_amount : decimal
    tax_amount : decimal
    grand_total : decimal
    status : varchar(50)
    issued_at : timestamp
    due_date : date
    paid_at : timestamp
  }

  entity invoice_line_items {
    * line_id : int
    --
    invoice_id : int
    description : varchar(255)
    quantity : int
    unit_price : decimal
    line_total : decimal
  }

  entity provider_pricing {
    * provider_id : int
    --
    monthly_fee : decimal
    reservation_price : decimal
    created_at : timestamp
    updated_at : timestamp
  }

  entity current_usage {
    * provider_id : int
    --
    billing_period : date
    successful_reservations : int
    monthly_fee : decimal
    reservation_price : decimal
    estimated_amount : decimal
    updated_at : timestamp
  }

  entity payment_history {
    * payment_id : int
    --
    invoice_id : int
    provider_id : int
    amount : decimal
    payment_method : varchar(50)
    reference : varchar(255)
    status : varchar(50)
    notes : varchar(500)
    paid_at : timestamp
  }

  invoices ||--o{ invoice_line_items : invoice_id
  invoices ||--o{ payment_history : invoice_id
  provider_pricing ||--o{ current_usage : provider_id
}

package "Payment DB" {
  entity Payment {
    * payment_id : int
    --
    invoice_id : int
    provider_id : int
    amount : decimal
    payment_method : varchar(100)
    reference : varchar(255)
    notes : varchar(500)
    status : varchar(255)
    paid_at : timestamp
  }
}

package "Analytics DB" {
  entity user_registrations {
    * id : int
    --
    userId : varchar(255)
    createdAt : timestamp
  }

  entity provider_registrations {
    * id : int
    --
    providerId : int
    providerName : varchar(255)
    createdAt : timestamp
  }

  entity reservation_events {
    * id : int
    --
    reservationId : varchar(255)
    providerId : int
    providerName : varchar(255)
    userId : varchar(255)
    pointId : varchar(255)
    status : varchar(50)
    timestamp : timestamp
  }

  entity provider_daily_stats {
    * providerId : int
    * date : date
    --
    totalReservations : int
    successfulReservations : int
    failedReservations : int
    uniqueUsers : int
  }

  entity global_daily_stats {
    * date : date
    --
    totalReservations : int
    successfulReservations : int
    failedReservations : int
    newUsers : int
    newProviders : int
  }
}

package "Red Provider DB" {
  entity normalized_points_red {
    * id : char(36)
    --
    point_id : varchar(255)
    provider_name : varchar(100)
    lon : decimal
    lat : decimal
    status : varchar(50)
    capacity_kw : decimal
    kwh_price : decimal
    connector : varchar(100)
    location_name : varchar(255)
    address : varchar
    reservation_end_time : varchar(64)
    raw_payload : longtext
    last_synced_at : datetime
    created_at : datetime
    updated_at : datetime
  }
}

package "Green Provider DB" {
  entity normalized_points_green {
    * id : char(36)
    --
    point_id : varchar(255)
    provider_name : varchar(100)
    lon : decimal
    lat : decimal
    status : varchar(50)
    capacity_kw : decimal
    kwh_price : decimal
    connector : varchar(100)
    location_name : varchar(255)
    address : varchar
    reservation_end_time : varchar(64)
    raw_payload : longtext
    last_synced_at : datetime
    created_at : datetime
    updated_at : datetime
  }
}

package "Blue Provider DB" {
  entity normalized_points_blue {
    * id : char(36)
    --
    point_id : varchar(255)
    provider_name : varchar(100)
    lon : decimal
    lat : decimal
    status : varchar(50)
    capacity_kw : decimal
    kwh_price : decimal
    connector : varchar(100)
    location_name : varchar(255)
    address : varchar
    reservation_end_time : varchar(64)
    raw_payload : longtext
    last_synced_at : datetime
    created_at : datetime
    updated_at : datetime
  }
}

@enduml
