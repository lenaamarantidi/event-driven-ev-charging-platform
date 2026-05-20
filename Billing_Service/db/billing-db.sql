-- Billing Database Schema
-- Χρεώσεις για κάθε κλήση API και κράτηση

CREATE TABLE IF NOT EXISTS api_calls_log (
    id VARCHAR(36) PRIMARY KEY,
    provider_name VARCHAR(50) NOT NULL,
    call_type VARCHAR(50) NOT NULL, -- 'status', 'reserve', 'points'
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cost_cents INT DEFAULT 0, -- σε cents
    INDEX idx_provider (provider_name),
    INDEX idx_timestamp (timestamp)
);

CREATE TABLE IF NOT EXISTS reservations_charges (
    id VARCHAR(36) PRIMARY KEY,
    reservation_id VARCHAR(255) NOT NULL,
    provider_name VARCHAR(50) NOT NULL,
    point_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    charge_amount_cents INT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'charged', 'refunded'
    charging_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_provider (provider_name),
    INDEX idx_reservation (reservation_id),
    INDEX idx_status (status)
);

-- Ημερήσια λογαριασμοί παρόχων
CREATE TABLE IF NOT EXISTS provider_invoices (
    id VARCHAR(36) PRIMARY KEY,
    provider_name VARCHAR(50) NOT NULL,
    invoice_date DATE NOT NULL,
    total_api_calls INT DEFAULT 0,
    total_reservations INT DEFAULT 0,
    total_amount_cents INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'paid'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_provider_invoice (provider_name, invoice_date),
    INDEX idx_provider (provider_name),
    INDEX idx_date (invoice_date)
);
