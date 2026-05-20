-- Billing Service database bootstrap (MariaDB)
-- Invoice diagram schema

CREATE TABLE IF NOT EXISTS Invoice (
  invoice_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  provider_id INT(10) UNSIGNED,
  period_start DATE,
  period_end DATE,
  total_amount DECIMAL(10,2),
  status VARCHAR(255),
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_invoice_provider (provider_id),
  INDEX idx_invoice_period (period_start, period_end),
  INDEX idx_invoice_status (status),
  INDEX idx_invoice_issued_at (issued_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
