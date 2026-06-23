-- Analytics_Service Database Schema
-- Database: analytics_db
-- Stores raw events and aggregated statistics for analytics

CREATE DATABASE IF NOT EXISTS analytics_db;
USE analytics_db;

-- =====================
-- RAW EVENT TABLES
-- =====================

-- User Registrations
CREATE TABLE IF NOT EXISTS user_registrations (
  id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  userId VARCHAR(255) NOT NULL UNIQUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_createdAt (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Provider Registrations
CREATE TABLE IF NOT EXISTS provider_registrations (
  id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  providerId INT(10) UNSIGNED NOT NULL UNIQUE,
  providerName VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_providerId (providerId),
  INDEX idx_createdAt (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Reservation Events (raw event log)
CREATE TABLE IF NOT EXISTS reservation_events (
  id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  reservationId VARCHAR(255) NOT NULL UNIQUE,
  providerId INT(10) UNSIGNED NOT NULL,
  providerName VARCHAR(255) NOT NULL,
  userId VARCHAR(255) NOT NULL,
  pointId VARCHAR(255),
  status VARCHAR(50) NOT NULL COMMENT 'success or failed',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_providerId (providerId),
  INDEX idx_userId (userId),
  INDEX idx_status (status),
  INDEX idx_timestamp (timestamp),
  INDEX idx_provider_timestamp (providerId, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================
-- AGGREGATED STATISTICS TABLES
-- =====================

-- Provider Daily Statistics
CREATE TABLE IF NOT EXISTS provider_daily_stats (
  providerId INT(10) UNSIGNED NOT NULL,
  date DATE NOT NULL,
  totalReservations INT(10) UNSIGNED DEFAULT 0,
  successfulReservations INT(10) UNSIGNED DEFAULT 0,
  failedReservations INT(10) UNSIGNED DEFAULT 0,
  uniqueUsers INT(10) UNSIGNED DEFAULT 0,
  PRIMARY KEY (providerId, date),
  INDEX idx_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Global Daily Statistics
CREATE TABLE IF NOT EXISTS global_daily_stats (
  date DATE NOT NULL PRIMARY KEY,
  totalReservations INT(10) UNSIGNED DEFAULT 0,
  successfulReservations INT(10) UNSIGNED DEFAULT 0,
  failedReservations INT(10) UNSIGNED DEFAULT 0,
  newUsers INT(10) UNSIGNED DEFAULT 0,
  newProviders INT(10) UNSIGNED DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
