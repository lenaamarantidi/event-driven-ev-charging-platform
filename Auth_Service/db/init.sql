-- Auth Service database bootstrap (MariaDB)
-- User diagram schema

CREATE TABLE IF NOT EXISTS User (
  user_id INT(10) UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  google_id INT(10) UNSIGNED NULL,
  UNIQUE KEY uq_user_username (username),
  UNIQUE KEY uq_user_google_id (google_id),
  INDEX idx_user_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
