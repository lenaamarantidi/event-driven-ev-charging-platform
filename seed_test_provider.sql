USE provider_db;

-- Insert/Update Test provider with bcrypt hashed password for "password123"
REPLACE INTO providers (
  provider_id,
  provider_name,
  provider_email,
  company_tin,
  password_hash,
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
) VALUES (
  2,
  'Test',
  'test@example.com',
  '123456789',
  '$2b$12$pLtL7Fd3jZJFwH3KNI0OXeBNwNi7Nc5JT7CMNTwfGP1lVOQ4z3Ej2',
  'test_adapter',
  'integration_pending',
  'https://api.test.local',
  'sk_test_123',
  'https://api.test.local/points',
  'https://api.test.local/points/:id',
  'https://api.test.local/reserve',
  'https://api.test.local/reserve/duration',
  'active',
  '2026-01-08 09:00:00'
);
