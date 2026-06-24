CREATE TABLE IF NOT EXISTS Payment (
  payment_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  invoice_id INT(10) UNSIGNED,
  provider_id INT(10) UNSIGNED,
  amount DECIMAL(10,2),
  payment_method VARCHAR(100) NULL,
  reference VARCHAR(255) NULL,
  notes VARCHAR(500) NULL,
  status VARCHAR(255),
  paid_at TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_payment_invoice (invoice_id),
  INDEX idx_payment_provider (provider_id),
  INDEX idx_payment_status (status),
  INDEX idx_payment_paid_at (paid_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
