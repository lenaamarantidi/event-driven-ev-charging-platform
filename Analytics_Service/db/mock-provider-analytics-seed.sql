-- Mock analytics data for provider dashboard previews.
-- Target provider: providerId = 1, providerName = Test.
--
-- Run against analytics_db, for example:
-- docker exec -i saasplug-mariadb-analytics mariadb -uroot -proot analytics_db < Analytics_Service/db/mock-provider-analytics-seed.sql

CREATE TABLE IF NOT EXISTS user_registrations (
  id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  userId VARCHAR(255) NOT NULL UNIQUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_createdAt (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS provider_registrations (
  id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  providerId INT(10) UNSIGNED NOT NULL UNIQUE,
  providerName VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_providerId (providerId),
  INDEX idx_createdAt (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS global_daily_stats (
  date DATE NOT NULL PRIMARY KEY,
  totalReservations INT(10) UNSIGNED DEFAULT 0,
  successfulReservations INT(10) UNSIGNED DEFAULT 0,
  failedReservations INT(10) UNSIGNED DEFAULT 0,
  newUsers INT(10) UNSIGNED DEFAULT 0,
  newProviders INT(10) UNSIGNED DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO provider_registrations (providerId, providerName, createdAt)
VALUES (1, 'Test', '2026-01-08 09:00:00')
ON DUPLICATE KEY UPDATE
  providerName = VALUES(providerName),
  createdAt = LEAST(createdAt, VALUES(createdAt));

INSERT IGNORE INTO user_registrations (userId, createdAt)
WITH RECURSIVE seq AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 42
)
SELECT
  CONCAT('mock-user-', LPAD(n, 2, '0')),
  DATE_ADD('2026-01-05', INTERVAL n DAY)
FROM seq;

DELETE FROM reservation_events
WHERE providerId = 1
  AND reservationId LIKE 'mock-provider-1-res-%';

INSERT INTO reservation_events (
  reservationId,
  providerId,
  providerName,
  userId,
  pointId,
  status,
  timestamp
)
WITH RECURSIVE seq AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 164
)
SELECT
  CONCAT('mock-provider-1-res-', LPAD(n, 3, '0')),
  1,
  'Test',
  CONCAT('mock-user-', LPAD(((n * 5) % 42) + 1, 2, '0')),
  CONCAT('TEST-CP-', LPAD((n % 8) + 1, 2, '0')),
  CASE WHEN n % 6 IN (0, 5) THEN 'failed' ELSE 'success' END,
  TIMESTAMP(DATE_ADD('2026-01-10', INTERVAL n DAY), MAKETIME(8 + (n % 12), (n * 7) % 60, 0))
FROM seq;

DELETE FROM provider_daily_stats
WHERE providerId = 1;

INSERT INTO provider_daily_stats (
  providerId,
  date,
  totalReservations,
  successfulReservations,
  failedReservations,
  uniqueUsers
)
SELECT
  providerId,
  DATE(timestamp),
  COUNT(*),
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END),
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END),
  COUNT(DISTINCT userId)
FROM reservation_events
WHERE providerId = 1
GROUP BY providerId, DATE(timestamp);

REPLACE INTO global_daily_stats (
  date,
  totalReservations,
  successfulReservations,
  failedReservations,
  newUsers,
  newProviders
)
SELECT
  DATE(timestamp),
  COUNT(*),
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END),
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END),
  0,
  0
FROM reservation_events
GROUP BY DATE(timestamp);

CREATE TABLE IF NOT EXISTS UsageEvent (
  event_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  provider_id INT(10),
  user_id INT(10),
  point_id INT(10),
  reservation_id INT(10) NULL,
  event_type VARCHAR(255) NOT NULL,
  event_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  charge_amount DECIMAL(10,2),
  invoice_id INT(10),
  INDEX idx_usage_event_type (event_type),
  INDEX idx_usage_event_time (event_time),
  INDEX idx_usage_provider (provider_id),
  INDEX idx_usage_user (user_id),
  INDEX idx_usage_point (point_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DELETE FROM UsageEvent
WHERE provider_id = 1
  AND event_type IN ('reservation_success', 'reservation_failed');

INSERT INTO UsageEvent (
  provider_id,
  user_id,
  point_id,
  reservation_id,
  event_type,
  event_time,
  charge_amount,
  invoice_id
)
WITH RECURSIVE seq AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 120
)
SELECT
  1,
  ((n * 5) % 42) + 1,
  (n % 8) + 1,
  n,
  CASE WHEN n % 6 IN (0, 5) THEN 'reservation_failed' ELSE 'reservation_success' END,
  TIMESTAMP(DATE_ADD('2026-02-01', INTERVAL n DAY), MAKETIME(9 + (n % 10), (n * 5) % 60, 0)),
  CASE WHEN n % 6 IN (0, 5) THEN 0 ELSE 4.50 + (n % 9) END,
  NULL
FROM seq;
