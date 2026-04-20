-- Central Database Schema
-- Αποθήκευση όλων των σημείων φόρτισης από τους 3 παρόχους

CREATE TABLE IF NOT EXISTS charging_points (
    id VARCHAR(36) PRIMARY KEY,
    point_id VARCHAR(255) NOT NULL,
    provider_name VARCHAR(50) NOT NULL,
    lon DECIMAL(10, 8) NOT NULL,
    lat DECIMAL(10, 8) NOT NULL,
    status VARCHAR(50) NOT NULL,
    capacity_kw INT NOT NULL,
    kwh_price DECIMAL(10, 4),
    reservation_end_time TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_point_provider (point_id, provider_name),
    INDEX idx_provider (provider_name),
    INDEX idx_status (status),
    INDEX idx_location (lat, lon),
    INDEX idx_updated (last_updated)
);

-- Ιστορικό ενημερώσεων σημείων
CREATE TABLE IF NOT EXISTS points_history (
    id VARCHAR(36) PRIMARY KEY,
    point_id VARCHAR(255) NOT NULL,
    provider_name VARCHAR(50) NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    change_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_point (point_id),
    INDEX idx_provider (provider_name)
);

-- Σημεία που ανήκουν σε καθε παροχο
CREATE TABLE IF NOT EXISTS provider_points (
    id VARCHAR(36) PRIMARY KEY,
    provider_name VARCHAR(50) NOT NULL,
    point_id VARCHAR(255) NOT NULL,
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_provider_point (provider_name, point_id),
    INDEX idx_provider (provider_name)
);
