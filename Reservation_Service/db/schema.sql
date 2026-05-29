/**
 * Reservation_Service Database Schema
 * MariaDB 10.5+
 * Database: reservation_db
 * 
 * Tables:
 * 1. reservation_logs - All reservation attempts (successful & failed)
 * 2. reservation_statistics - Daily aggregated statistics
 */

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS reservation_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE reservation_db;

-- ============================================================
-- Table: reservation_logs
-- Purpose: Log all reservation attempts (success/failure)
-- ============================================================
CREATE TABLE IF NOT EXISTS reservation_logs (
  -- Identification
  id INT AUTO_INCREMENT PRIMARY KEY,
  reservation_id VARCHAR(36) NOT NULL UNIQUE COMMENT 'UUID for this reservation',
  provider_id INT NOT NULL COMMENT '1=redPlug, 2=greenPlug, 3=bluePlug',
  provider_name VARCHAR(50) NOT NULL COMMENT 'Provider name: redPlug, greenPlug, bluePlug',

  -- Reservation Details
  point_id VARCHAR(100) NOT NULL COMMENT 'Charging point ID from provider',
  duration INT NOT NULL COMMENT 'Duration in minutes',
  user_id VARCHAR(36) COMMENT 'User ID (optional)',

  -- Status & Response
  status VARCHAR(50) DEFAULT 'pending' COMMENT 'pending, confirmed, failed',
  reservation_details JSON COMMENT 'Full response from provider API',

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When reservation was attempted',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update',

  -- Indexes for common queries
  INDEX idx_reservation_id (reservation_id),
  INDEX idx_provider (provider_name),
  INDEX idx_point_id (point_id),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at),
  INDEX idx_status (status),
  INDEX idx_provider_date (provider_name, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Log of all EV charging reservation attempts';

-- ============================================================
-- Table: reservation_statistics
-- Purpose: Daily aggregated statistics per provider
-- ============================================================
CREATE TABLE IF NOT EXISTS reservation_statistics (
  -- Identification
  id INT AUTO_INCREMENT PRIMARY KEY,
  date_key DATE NOT NULL COMMENT 'The date for which stats are recorded',
  provider_id INT NOT NULL COMMENT '1=redPlug, 2=greenPlug, 3=bluePlug',
  provider_name VARCHAR(50) NOT NULL COMMENT 'Provider name',

  -- Counts
  total_reservations INT DEFAULT 0 COMMENT 'Total reservation attempts',
  successful_reservations INT DEFAULT 0 COMMENT 'Successful reservations',
  failed_reservations INT DEFAULT 0 COMMENT 'Failed reservations',

  -- Aggregates
  total_duration_minutes INT DEFAULT 0 COMMENT 'Sum of all duration_minutes',
  average_duration_minutes INT DEFAULT 0 COMMENT 'Average duration',

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Constraints & Indexes
  UNIQUE KEY unique_date_provider (date_key, provider_id),
  INDEX idx_date (date_key),
  INDEX idx_provider (provider_name),
  INDEX idx_provider_date (provider_name, date_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Daily statistics for reservation attempts per provider';

-- ============================================================
-- Sample Data / Documentation
-- ============================================================

-- redPlug provider ID = 1
-- greenPlug provider ID = 2
-- bluePlug provider ID = 3

-- Example reservation_logs entry:
-- {
--   "reservation_id": "550e8400-e29b-41d4-a716-446655440000",
--   "provider_id": 1,
--   "provider_name": "redPlug",
--   "point_id": "123",
--   "duration": 60,
--   "user_id": "user-uuid-123",
--   "status": "confirmed",
--   "reservation_details": {
--     "pointid": 123,
--     "status": "reserved",
--     "reservationendtime": "2026-05-28T15:30:00Z",
--     "location": { "long": 23.7275, "lat": 37.9838 }
--   },
--   "created_at": "2026-05-28 14:30:00"
-- }
