-- Provider Management Service database bootstrap (MariaDB)
-- Requested schema: Provider table

DROP TABLE IF EXISTS providers;
DROP TABLE IF EXISTS provider_audit_log;

CREATE TABLE IF NOT EXISTS Provider (
  provider_id INT PRIMARY KEY AUTO_INCREMENT,
  company_name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  TIN DECIMAL(9,0) NOT NULL,
  email VARCHAR(255) NOT NULL,
  contact_number DECIMAL(10,0) NULL,
  API_endpoint VARCHAR(255) NOT NULL,
  API_key VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_company_name (company_name),
  UNIQUE KEY uq_provider_tin (TIN),
  UNIQUE KEY uq_provider_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
