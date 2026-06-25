-- Billing_Service Database Schema
-- Database: billing_db
-- Stores billable events and invoices for providers
--
-- Mock billing data targets redPlug:
-- provider_id = 1, period = January through June 2026.

CREATE DATABASE IF NOT EXISTS billing_db;
USE billing_db;

CREATE TABLE IF NOT EXISTS billable_events (
  event_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  provider_id INT(10) UNSIGNED NOT NULL,
  reservation_id VARCHAR(36) NOT NULL COMMENT 'Reservation UUID from Reservation_Service',
  amount DECIMAL(10, 2) NOT NULL COMMENT 'Amount in EUR',
  event_type VARCHAR(50) DEFAULT 'reservation' COMMENT 'reservation, charging, etc.',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  billing_month DATE NOT NULL COMMENT 'First day of the month for aggregation',
  UNIQUE KEY uq_provider_reservation (provider_id, reservation_id),
  INDEX idx_provider_id (provider_id),
  INDEX idx_reservation_id (reservation_id),
  INDEX idx_billing_month (billing_month),
  INDEX idx_provider_month (provider_id, billing_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoices (
  invoice_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  provider_id INT(10) UNSIGNED NOT NULL,
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  successful_reservations_count INT(10) UNSIGNED NOT NULL DEFAULT 0,
  monthly_fee DECIMAL(10, 2) NOT NULL DEFAULT 15.00,
  reservation_price DECIMAL(10, 2) NOT NULL DEFAULT 0.10,
  total_amount DECIMAL(15, 2) NOT NULL,
  tax_amount DECIMAL(15, 2) DEFAULT 0.00,
  grand_total DECIMAL(15, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING' COMMENT 'PENDING, PAID',
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  due_date DATE NOT NULL,
  paid_at TIMESTAMP NULL,
  UNIQUE KEY uq_provider_period (provider_id, billing_period_start, billing_period_end),
  INDEX idx_provider_id (provider_id),
  INDEX idx_status (status),
  INDEX idx_issued_at (issued_at),
  INDEX idx_due_date (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoice_line_items (
  line_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  invoice_id INT(10) UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL,
  quantity INT(10) DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  line_total DECIMAL(15, 2) NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id) ON DELETE CASCADE,
  INDEX idx_invoice_id (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pricing_config (
  config_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  provider_id INT(10) UNSIGNED COMMENT 'NULL for global default',
  cost_per_reservation DECIMAL(10, 2) NOT NULL DEFAULT 0.50 COMMENT 'EUR per reservation',
  cost_per_charging_hour DECIMAL(10, 2) NOT NULL DEFAULT 1.00 COMMENT 'EUR per charging hour',
  setup_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT 'Monthly setup fee in EUR',
  active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_config (provider_id),
  INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS provider_pricing (
  provider_id INT(10) UNSIGNED PRIMARY KEY,
  monthly_fee DECIMAL(10, 2) NOT NULL DEFAULT 15.00,
  reservation_price DECIMAL(10, 2) NOT NULL DEFAULT 0.10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_provider_id (provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS current_usage (
  provider_id INT(10) UNSIGNED PRIMARY KEY,
  billing_period DATE NOT NULL COMMENT 'First day of the current billing month',
  successful_reservations INT(10) UNSIGNED NOT NULL DEFAULT 0,
  monthly_fee DECIMAL(10, 2) NOT NULL DEFAULT 15.00,
  reservation_price DECIMAL(10, 2) NOT NULL DEFAULT 0.10,
  estimated_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_provider_id (provider_id),
  INDEX idx_billing_period (billing_period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payment_history (
  payment_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  invoice_id INT(10) UNSIGNED NOT NULL,
  provider_id INT(10) UNSIGNED NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'bank_transfer',
  reference VARCHAR(255) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'completed' COMMENT 'completed, pending, failed',
  notes VARCHAR(500) NULL,
  paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invoice_completed_payment (invoice_id, status),
  INDEX idx_provider_id (provider_id),
  INDEX idx_paid_at (paid_at),
  INDEX idx_reference (reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS billing_metadata (
  key_name VARCHAR(255) PRIMARY KEY,
  value VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO provider_pricing (provider_id, monthly_fee, reservation_price)
VALUES (1, 15.00, 0.10)
ON DUPLICATE KEY UPDATE
  monthly_fee = VALUES(monthly_fee),
  reservation_price = VALUES(reservation_price),
  updated_at = CURRENT_TIMESTAMP;

DELETE line_items
FROM invoice_line_items line_items
JOIN invoices invoice ON invoice.invoice_id = line_items.invoice_id
WHERE invoice.provider_id = 1;

DELETE FROM payment_history WHERE provider_id = 1;
DELETE FROM invoices WHERE provider_id = 1;
DELETE FROM current_usage WHERE provider_id = 1;
DELETE FROM billable_events WHERE provider_id = 1;

INSERT INTO billable_events (
  provider_id,
  reservation_id,
  amount,
  event_type,
  created_at,
  billing_month
)
WITH RECURSIVE seq AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 176
)
SELECT
  1,
  CONCAT('mock-redplug-res-', LPAD(n, 3, '0')),
  0.10,
  'reservation',
  TIMESTAMP(DATE_ADD('2026-01-01', INTERVAL n DAY), MAKETIME(7 + (n % 13), (n * 5) % 60, 0)),
  DATE_FORMAT(DATE_ADD('2026-01-01', INTERVAL n DAY), '%Y-%m-01')
FROM seq
WHERE n % 9 NOT IN (0, 7);

INSERT INTO invoices (
  provider_id,
  billing_period_start,
  billing_period_end,
  successful_reservations_count,
  monthly_fee,
  reservation_price,
  total_amount,
  tax_amount,
  grand_total,
  status,
  issued_at,
  due_date,
  paid_at
)
SELECT
  1,
  months.month_start,
  LAST_DAY(months.month_start),
  COUNT(events.event_id),
  pricing.monthly_fee,
  pricing.reservation_price,
  ROUND(pricing.monthly_fee + COUNT(events.event_id) * pricing.reservation_price, 2),
  0.00,
  ROUND(pricing.monthly_fee + COUNT(events.event_id) * pricing.reservation_price, 2),
  CASE
    WHEN months.month_start <= '2026-04-01' THEN 'PAID'
    ELSE 'PENDING'
  END,
  CASE
    WHEN months.month_start = '2026-06-01' THEN '2026-06-25 10:00:00'
    ELSE TIMESTAMP(DATE_ADD(LAST_DAY(months.month_start), INTERVAL 1 DAY), '10:00:00')
  END,
  LAST_DAY(DATE_ADD(months.month_start, INTERVAL 1 MONTH)),
  CASE
    WHEN months.month_start <= '2026-04-01' THEN TIMESTAMP(DATE_ADD(LAST_DAY(months.month_start), INTERVAL 3 DAY), '11:30:00')
    ELSE NULL
  END
FROM (
  SELECT DATE('2026-01-01') AS month_start
  UNION ALL SELECT DATE('2026-02-01')
  UNION ALL SELECT DATE('2026-03-01')
  UNION ALL SELECT DATE('2026-04-01')
  UNION ALL SELECT DATE('2026-05-01')
  UNION ALL SELECT DATE('2026-06-01')
) months
CROSS JOIN provider_pricing pricing
LEFT JOIN billable_events events
  ON events.provider_id = 1
 AND events.billing_month = months.month_start
WHERE pricing.provider_id = 1
GROUP BY months.month_start, pricing.monthly_fee, pricing.reservation_price
ON DUPLICATE KEY UPDATE
  successful_reservations_count = VALUES(successful_reservations_count),
  monthly_fee = VALUES(monthly_fee),
  reservation_price = VALUES(reservation_price),
  total_amount = VALUES(total_amount),
  tax_amount = VALUES(tax_amount),
  grand_total = VALUES(grand_total),
  status = VALUES(status),
  issued_at = VALUES(issued_at),
  due_date = VALUES(due_date),
  paid_at = VALUES(paid_at);

INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, line_total)
SELECT invoice_id, 'Monthly subscription fee', 1, monthly_fee, monthly_fee
FROM invoices
WHERE provider_id = 1
UNION ALL
SELECT
  invoice_id,
  'Reservation fee',
  successful_reservations_count,
  reservation_price,
  ROUND(successful_reservations_count * reservation_price, 2)
FROM invoices
WHERE provider_id = 1;

INSERT IGNORE INTO payment_history (
  invoice_id,
  provider_id,
  amount,
  payment_method,
  reference,
  status,
  notes,
  paid_at
)
SELECT
  invoice_id,
  provider_id,
  grand_total,
  'bank_transfer',
  CONCAT('PAY-REDPLUG-', DATE_FORMAT(billing_period_start, '%Y%m')),
  'completed',
  'Mock payment for redPlug monthly invoice',
  paid_at
FROM invoices
WHERE provider_id = 1
  AND status = 'PAID'
  AND paid_at IS NOT NULL;

INSERT INTO current_usage (
  provider_id,
  billing_period,
  successful_reservations,
  monthly_fee,
  reservation_price,
  estimated_amount,
  updated_at
)
SELECT
  1,
  '2026-06-01',
  COUNT(*),
  pricing.monthly_fee,
  pricing.reservation_price,
  ROUND(pricing.monthly_fee + COUNT(*) * pricing.reservation_price, 2),
  '2026-06-25 12:00:00'
FROM billable_events events
JOIN provider_pricing pricing ON pricing.provider_id = 1
WHERE events.provider_id = 1
  AND events.billing_month = '2026-06-01'
ON DUPLICATE KEY UPDATE
  successful_reservations = VALUES(successful_reservations),
  monthly_fee = VALUES(monthly_fee),
  reservation_price = VALUES(reservation_price),
  estimated_amount = VALUES(estimated_amount),
  updated_at = VALUES(updated_at);
