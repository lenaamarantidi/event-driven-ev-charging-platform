-- Mock Provider Seed Data
-- Creates test provider account for dashboard testing

USE provider_db;

-- Insert mock provider "Test" with password hash for "password123"
-- Hash generated using bcrypt with salt rounds 12
-- Password: password123
-- Hash: $2b$12$abc123... (you'll need to generate this dynamically)

-- For now, we'll insert a provider with NULL password_hash
-- The password will be set when the provider first logs in or registers

INSERT IGNORE INTO providers (
  provider_id,
  provider_name,
  provider_email,
  company_tin,
  adapter_name,
  integration_status,
  base_url,
  api_key,
  endpoint_list_points,
  endpoint_point_details,
  endpoint_reserve,
  endpoint_reserve_duration,
  status,
  registered_at
)
VALUES (
  1,
  'Test',
  'test@example.com',
  '123456789',
  'test_adapter',
  'integration_pending',
  'https://api.test.local',
  'sk_test_abc123def456',
  'https://api.test.local/points',
  'https://api.test.local/points/:id',
  'https://api.test.local/reserve',
  'https://api.test.local/reserve/duration',
  'active',
  '2026-01-08 09:00:00'
);
