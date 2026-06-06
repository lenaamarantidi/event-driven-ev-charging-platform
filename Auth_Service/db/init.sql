-- Auth Service database bootstrap (MariaDB)
-- User diagram schema with password and refresh token support

CREATE TABLE IF NOT EXISTS User (
  user_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(255) NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NULL,
  google_id VARCHAR(255) NULL,
  first_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NULL,
  phone VARCHAR(32) NULL,
  refresh_token_hash VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_email (email),
  UNIQUE KEY uq_user_username (username),
  UNIQUE KEY uq_user_google_id (google_id),
  INDEX idx_user_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
