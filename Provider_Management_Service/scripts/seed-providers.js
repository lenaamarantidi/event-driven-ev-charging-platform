#!/usr/bin/env node

/**
 * Seed script for Provider Management Service.
 * Creates the three built-in provider accounts used by the local deployment.
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

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
    
    const plainPassword = 'password123';
    const passwordHash = await bcrypt.hash(plainPassword, 12);

    const providers = [
      {
        id: 1,
        name: 'redPlug',
        email: 'redplug@example.com',
        tin: '100000001',
        adapter: 'provider-adapter-redplug',
        baseUrl: 'http://provider-adapter-redplug:3111',
        apiKey: 'sk_redplug_local',
        listEndpoint: '/api/points',
        detailsEndpoint: '/api/points/:pointId',
        reserveEndpoint: '/api/reserve',
        reserveDurationEndpoint: '/api/reserve'
      },
      {
        id: 2,
        name: 'greenPlug',
        email: 'greenplug@example.com',
        tin: '100000002',
        adapter: 'provider-adapter-greenplug',
        baseUrl: 'http://provider-adapter-greenplug:3112',
        apiKey: 'sk_greenplug_local',
        listEndpoint: '/api/points',
        detailsEndpoint: '/api/points/:pointId',
        reserveEndpoint: '/api/reserve',
        reserveDurationEndpoint: '/api/reserve'
      },
      {
        id: 3,
        name: 'bluePlug',
        email: 'blueplug@example.com',
        tin: '100000003',
        adapter: 'provider-adapter-blueplug',
        baseUrl: 'http://provider-adapter-blueplug:3113',
        apiKey: 'sk_blueplug_local',
        listEndpoint: '/api/points',
        detailsEndpoint: '/api/points/:pointId',
        reserveEndpoint: '/api/reserve',
        reserveDurationEndpoint: '/api/reserve'
      }
    ];

    const query = `
      INSERT INTO providers (
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', '2026-01-08 09:00:00')
      ON DUPLICATE KEY UPDATE
        provider_name = VALUES(provider_name),
        provider_email = VALUES(provider_email),
        company_tin = VALUES(company_tin),
        password_hash = VALUES(password_hash),
        adapter_name = VALUES(adapter_name),
        integration_status = VALUES(integration_status),
        base_url = VALUES(base_url),
        api_key = VALUES(api_key),
        endpoint_list_points = VALUES(endpoint_list_points),
        endpoint_point_details = VALUES(endpoint_point_details),
        endpoint_reserve = VALUES(endpoint_reserve),
        endpoint_reserve_duration = VALUES(endpoint_reserve_duration),
        status = VALUES(status)
    `;

    for (const provider of providers) {
      await connection.execute(query, [
        provider.id,
        provider.name,
        provider.email,
        provider.tin,
        passwordHash,
        provider.adapter,
        'integrated',
        provider.baseUrl,
        provider.apiKey,
        provider.listEndpoint,
        provider.detailsEndpoint,
        provider.reserveEndpoint,
        provider.reserveDurationEndpoint
      ]);
      console.log(`✓ Provider "${provider.name}" seeded`);
    }

    console.log('Provider password for all seeded providers: password123');
    
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
