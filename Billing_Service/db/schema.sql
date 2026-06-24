-- Billing Service database schema and mock billing data
-- Database: billing_db

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

INSERT IGNORE INTO pricing_config (cost_per_reservation, cost_per_charging_hour, setup_fee, active)
VALUES (0.50, 1.00, 0.00, 1);

INSERT IGNORE INTO provider_pricing (provider_id, monthly_fee, reservation_price)
VALUES (1, 15.00, 0.10);

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
VALUES
  (1, '2026-01-01', '2026-01-31', 28, 15.00, 0.10, 18.80, 0.00, 18.80, 'PAID', '2026-02-01 10:00:00', '2026-02-28', '2026-02-03 11:30:00'),
  (1, '2026-02-01', '2026-02-29', 30, 15.00, 0.10, 18.00, 0.00, 18.00, 'PAID', '2026-03-01 10:00:00', '2026-03-31', '2026-03-04 09:45:00'),
  (1, '2026-03-01', '2026-03-31', 22, 15.00, 0.10, 17.20, 0.00, 17.20, 'PENDING', '2026-04-01 10:00:00', '2026-04-30', NULL),
  (1, '2026-04-01', '2026-04-30', 34, 15.00, 0.10, 18.40, 0.00, 18.40, 'PAID', '2026-05-01 10:00:00', '2026-05-31', '2026-05-02 12:00:00'),
  (1, '2026-05-01', '2026-05-31', 25, 15.00, 0.10, 17.50, 0.00, 17.50, 'PENDING', '2026-06-01 10:00:00', '2026-06-30', NULL)
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
VALUES
  (1, 'Monthly subscription fee', 1, 15.00, 15.00),
  (1, 'Reservation fee', 28, 0.10, 2.80),
  (2, 'Monthly subscription fee', 1, 15.00, 15.00),
  (2, 'Reservation fee', 30, 0.10, 3.00),
  (3, 'Monthly subscription fee', 1, 15.00, 15.00),
  (3, 'Reservation fee', 22, 0.10, 2.20),
  (4, 'Monthly subscription fee', 1, 15.00, 15.00),
  (4, 'Reservation fee', 34, 0.10, 3.40),
  (5, 'Monthly subscription fee', 1, 15.00, 15.00),
  (5, 'Reservation fee', 25, 0.10, 2.50)
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  quantity = VALUES(quantity),
  unit_price = VALUES(unit_price),
  line_total = VALUES(line_total);

INSERT IGNORE INTO payment_history (invoice_id, provider_id, amount, payment_method, reference, status, notes, paid_at)
VALUES
  (1, 1, 18.80, 'bank_transfer', 'PAY-202601', 'completed', 'Paid by provider', '2026-02-03 11:30:00'),
  (2, 1, 18.00, 'bank_transfer', 'PAY-202602', 'completed', 'Paid by provider', '2026-03-04 09:45:00'),
  (4, 1, 18.40, 'bank_transfer', 'PAY-202604', 'completed', 'Paid by provider', '2026-05-02 13:00:00');

INSERT INTO current_usage (provider_id, billing_period, successful_reservations, monthly_fee, reservation_price, estimated_amount, updated_at)
VALUES
  (1, '2026-06-01', 18, 15.00, 0.10, 16.80, '2026-06-16 12:00:00')
ON DUPLICATE KEY UPDATE
  successful_reservations = VALUES(successful_reservations),
  monthly_fee = VALUES(monthly_fee),
  reservation_price = VALUES(reservation_price),
  estimated_amount = VALUES(estimated_amount),
  updated_at = VALUES(updated_at);
