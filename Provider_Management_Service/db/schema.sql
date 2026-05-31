-- Provider_Management_Service Database Schema
-- Database: provider_mgmt_db
-- Each provider registers their 4 API endpoints for saasPlug to call

CREATE DATABASE IF NOT EXISTS provider_mgmt_db;
USE provider_mgmt_db;

-- Providers Table
-- Stores registration information for EV charging providers
CREATE TABLE IF NOT EXISTS providers (
  provider_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  provider_name VARCHAR(255) NOT NULL UNIQUE,
  base_url VARCHAR(500) NOT NULL,
  api_key VARCHAR(255) NOT NULL,
  endpoint_list_points VARCHAR(500) NOT NULL COMMENT 'GET endpoint to list charging points',
  endpoint_point_details VARCHAR(500) NOT NULL COMMENT 'GET endpoint to get point details',
  endpoint_reserve VARCHAR(500) NOT NULL COMMENT 'POST endpoint to make reservation',
  endpoint_reserve_duration VARCHAR(500) NOT NULL COMMENT 'POST endpoint to make reservation with duration',
  status VARCHAR(50) DEFAULT 'active' COMMENT 'active, suspended, inactive',
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_provider_name (provider_name),
  INDEX idx_provider_status (status),
  INDEX idx_registered_at (registered_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Provider Webhooks (optional, for future notification endpoints)
CREATE TABLE IF NOT EXISTS provider_webhooks (
  webhook_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  provider_id INT(10) UNSIGNED NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  webhook_url VARCHAR(500) NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES providers(provider_id) ON DELETE CASCADE,
  INDEX idx_provider_id (provider_id),
  INDEX idx_event_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
