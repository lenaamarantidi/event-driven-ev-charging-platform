-- Statistics Database Schema
-- Κατγραφή κλικς αναζήτησης και κρατήσεων

CREATE TABLE IF NOT EXISTS clicks (
    id VARCHAR(36) PRIMARY KEY,
    point_id VARCHAR(255) NOT NULL,
    provider_name VARCHAR(50) NOT NULL,
    user_id VARCHAR(255),
    action_type VARCHAR(50), -- 'view', 'search', 'filter'
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    session_id VARCHAR(255),
    INDEX idx_point (point_id),
    INDEX idx_provider (provider_name),
    INDEX idx_timestamp (timestamp),
    INDEX idx_user (user_id)
);

CREATE TABLE IF NOT EXISTS reservations_log (
    id VARCHAR(36) PRIMARY KEY,
    point_id VARCHAR(255) NOT NULL,
    provider_name VARCHAR(50) NOT NULL,
    user_id VARCHAR(255),
    status VARCHAR(50), -- 'attempted', 'success', 'failed'
    minutes_requested INT,
    minutes_granted INT,
    reservation_end_time TIMESTAMP,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_point (point_id),
    INDEX idx_provider (provider_name),
    INDEX idx_status (status),
    INDEX idx_timestamp (timestamp)
);

-- Ημερήσια στατιστικά κατα παροχο
CREATE TABLE IF NOT EXISTS daily_statistics (
    id VARCHAR(36) PRIMARY KEY,
    provider_name VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    total_clicks INT DEFAULT 0,
    total_reservations INT DEFAULT 0,
    successful_reservations INT DEFAULT 0,
    failed_reservations INT DEFAULT 0,
    total_capacity_aggregated INT DEFAULT 0,
    UNIQUE KEY unique_provider_date (provider_name, date),
    INDEX idx_provider (provider_name),
    INDEX idx_date (date)
);
