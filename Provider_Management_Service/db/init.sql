-- Provider Management Service Database
-- Stores provider information with authentication and API credentials

CREATE TABLE IF NOT EXISTS providers (
  provider_id INT(10) PRIMARY KEY AUTO_INCREMENT,
  company_name VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  TIN NUMERIC(9, 0) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  contact_number NUMERIC(10, 0),
  API_endpoint VARCHAR(255) NOT NULL UNIQUE,
  API_key VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_company_name (company_name),
  INDEX idx_email (email)
);

-- Audit log for provider changes
CREATE TABLE IF NOT EXISTS provider_audit_log (
  id INT(10) PRIMARY KEY AUTO_INCREMENT,
  provider_id INT(10) NOT NULL,
  action VARCHAR(50) NOT NULL,
  old_values JSON,
  new_values JSON,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES providers(provider_id) ON DELETE CASCADE,
  INDEX idx_provider_id (provider_id),
  INDEX idx_changed_at (changed_at)
);
