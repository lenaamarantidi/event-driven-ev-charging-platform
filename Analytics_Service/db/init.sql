-- Analytics Service database bootstrap (MariaDB)
-- Schema based on UsageEvent diagram

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
