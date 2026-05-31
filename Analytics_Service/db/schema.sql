-- Analytics_Service Database Schema
-- Database: analytics_db
-- Stores aggregated analytics events for providers

CREATE DATABASE IF NOT EXISTS analytics_db;
USE analytics_db;

-- Analytics Logs Table
-- Stores individual analytics events: point_viewed, reservation_made, searches, etc.
CREATE TABLE IF NOT EXISTS analytics_logs (
  id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  provider_id INT(10) UNSIGNED NOT NULL,
  action_type VARCHAR(50) NOT NULL COMMENT 'point_viewed, reservation_made, search_performed, etc.',
  action_metadata JSON COMMENT 'Additional metadata about the action',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_provider_id (provider_id),
  INDEX idx_action_type (action_type),
  INDEX idx_timestamp (timestamp),
  INDEX idx_provider_action (provider_id, action_type, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Analytics Summary Table (for fast aggregation)
-- Denormalized view of aggregated metrics, updated via RabbitMQ consumer
CREATE TABLE IF NOT EXISTS analytics_summary (
  summary_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  provider_id INT(10) UNSIGNED NOT NULL UNIQUE,
  total_searches INT(10) DEFAULT 0,
  total_point_views INT(10) DEFAULT 0,
  total_reservations INT(10) DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  INDEX idx_provider_id (provider_id),
  INDEX idx_period (period_start, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Daily Analytics Breakdown (for detailed trends)
CREATE TABLE IF NOT EXISTS analytics_daily (
  daily_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  provider_id INT(10) UNSIGNED NOT NULL,
  date DATE NOT NULL,
  searches_count INT(10) DEFAULT 0,
  point_views_count INT(10) DEFAULT 0,
  reservations_count INT(10) DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_date (provider_id, date),
  INDEX idx_provider_id (provider_id),
  INDEX idx_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
