-- Individual Provider Database Schema (Red, Green, Blue)
-- Αποθήκευση ειδικών δεδομένων κάθε παρόχου

CREATE TABLE IF NOT EXISTS provider_points (
    id VARCHAR(36) PRIMARY KEY,
    point_id VARCHAR(255) NOT NULL UNIQUE,
    lon DECIMAL(10, 8) NOT NULL,
    lat DECIMAL(10, 8) NOT NULL,
    status VARCHAR(50) NOT NULL,
    capacity_kw INT NOT NULL,
    kwh_price DECIMAL(10, 4),
    reservation_end_time TIMESTAMP,
    last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_synced (last_synced)
);

CREATE TABLE IF NOT EXISTS provider_point_changes (
    id VARCHAR(36) PRIMARY KEY,
    point_id VARCHAR(255) NOT NULL,
    field_name VARCHAR(100),
    old_value VARCHAR(255),
    new_value VARCHAR(255),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_point (point_id),
    INDEX idx_changed (changed_at)
);
