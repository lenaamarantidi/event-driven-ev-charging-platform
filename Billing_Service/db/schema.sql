-- Billing_Service Database Schema
-- Database: billing_db
-- Stores billable events and invoices for providers

CREATE DATABASE IF NOT EXISTS billing_db;
USE billing_db;

-- Billable Events Table
-- Stores every billable action (currently: reservations made)
-- These are inserted by RabbitMQ consumer when reservation events arrive
CREATE TABLE IF NOT EXISTS billable_events (
  event_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  provider_id INT(10) UNSIGNED NOT NULL,
  reservation_id INT(10) UNSIGNED NOT NULL,
  amount DECIMAL(10, 2) NOT NULL COMMENT 'Amount in EUR',
  event_type VARCHAR(50) DEFAULT 'reservation' COMMENT 'reservation, charging, etc.',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  billing_month DATE NOT NULL COMMENT 'First day of the month for aggregation',
  INDEX idx_provider_id (provider_id),
  INDEX idx_reservation_id (reservation_id),
  INDEX idx_billing_month (billing_month),
  INDEX idx_provider_month (provider_id, billing_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Invoices Table
-- Stores monthly invoices for providers
-- Can be generated on-demand or scheduled
CREATE TABLE IF NOT EXISTS invoices (
  invoice_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  provider_id INT(10) UNSIGNED NOT NULL,
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  total_amount DECIMAL(15, 2) NOT NULL,
  tax_amount DECIMAL(15, 2) DEFAULT 0.00,
  grand_total DECIMAL(15, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft' COMMENT 'draft, sent, paid, overdue, cancelled',
  event_count INT(10) DEFAULT 0 COMMENT 'Number of billable events in this invoice',
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  due_date DATE NOT NULL,
  paid_at TIMESTAMP NULL,
  UNIQUE KEY uq_provider_period (provider_id, billing_period_start, billing_period_end),
  INDEX idx_provider_id (provider_id),
  INDEX idx_status (status),
  INDEX idx_issued_at (issued_at),
  INDEX idx_due_date (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Invoice Line Items Table
-- Detailed breakdown of charges per invoice
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

-- Pricing Configuration Table
-- Store configurable pricing for billing calculations
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

-- Insert default pricing if not exists
INSERT IGNORE INTO pricing_config (cost_per_reservation, cost_per_charging_hour, setup_fee, active)
VALUES (0.50, 1.00, 0.00, 1);
