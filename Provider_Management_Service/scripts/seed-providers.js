#!/usr/bin/env node

/**
 * Seed script for Provider Management Service
 * Creates test provider account with hashed password
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3312,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: 'provider_db',
  waitForConnections: true,
  connectionLimit: 1,
  queueLimit: 0
};

async function seedProviders() {
  let connection;
  
  try {
    console.log('Connecting to Provider Management database...');
    connection = await mysql.createConnection(config);
    
    // Hash password for "password123"
    const plainPassword = 'password123';
    const passwordHash = await bcrypt.hash(plainPassword, 12);
    
    console.log('Inserting test provider "Test"...');
    
    const query = `
      INSERT IGNORE INTO providers (
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
        1,
        'Test',
        'test@example.com',
        '123456789',
        ?,
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
      )
    `;
    
    await connection.execute(query, [passwordHash]);
    
    console.log('✓ Test provider "Test" created successfully!');
    console.log('  Provider Name: Test');
    console.log('  Password: password123');
    console.log('  Email: test@example.com');
    
    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding provider:', error.message);
    if (connection) {
      await connection.end();
    }
    process.exit(1);
  }
}

seedProviders();
