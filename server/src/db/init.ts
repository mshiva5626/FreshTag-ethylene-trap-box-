import { query } from '../config/database.js';
import bcrypt from 'bcryptjs';

export async function initializeDatabase() {
  console.log('[Database] Ensuring tables exist...');

  // Create Users table
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      account_id VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      phone VARCHAR(50),
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create OTP table
  await query(`
    CREATE TABLE IF NOT EXISTS otps (
      id SERIAL PRIMARY KEY,
      identifier VARCHAR(255) NOT NULL,
      otp_code VARCHAR(10) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create Devices table with granule interval and last replaced tracking
  await query(`
    CREATE TABLE IF NOT EXISTS devices (
      device_id VARCHAR(100) PRIMARY KEY,
      account_id VARCHAR(100) NOT NULL,
      nickname VARCHAR(100) NOT NULL DEFAULT 'FreshGuard Vault',
      temp_min NUMERIC(5, 2) DEFAULT 1.0,
      temp_max NUMERIC(5, 2) DEFAULT 4.0,
      humidity_min NUMERIC(5, 2) DEFAULT 90.0,
      humidity_max NUMERIC(5, 2) DEFAULT 95.0,
      gas_threshold INTEGER DEFAULT 230,
      granule_interval_days INTEGER DEFAULT 30,
      granule_last_replaced TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      temp_offset NUMERIC(5, 2) DEFAULT 0.0,
      humidity_offset NUMERIC(5, 2) DEFAULT 0.0,
      gas_scale NUMERIC(5, 2) DEFAULT 1.0,
      gas_offset INTEGER DEFAULT 0,
      override_mode BOOLEAN DEFAULT FALSE,
      custom_temp NUMERIC(5, 2) DEFAULT NULL,
      custom_humidity NUMERIC(5, 2) DEFAULT NULL,
      custom_gas INTEGER DEFAULT NULL,
      reset_pending BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Safe column migrations for existing devices table
  const deviceCols = [
    { name: 'temp_offset', type: 'NUMERIC(5, 2) DEFAULT 0.0' },
    { name: 'humidity_offset', type: 'NUMERIC(5, 2) DEFAULT 0.0' },
    { name: 'gas_scale', type: 'NUMERIC(5, 2) DEFAULT 1.0' },
    { name: 'gas_offset', type: 'INTEGER DEFAULT 0' },
    { name: 'override_mode', type: 'BOOLEAN DEFAULT FALSE' },
    { name: 'custom_temp', type: 'NUMERIC(5, 2) DEFAULT NULL' },
    { name: 'custom_humidity', type: 'NUMERIC(5, 2) DEFAULT NULL' },
    { name: 'custom_gas', type: 'INTEGER DEFAULT NULL' },
    { name: 'reset_pending', type: 'BOOLEAN DEFAULT FALSE' },
  ];
  for (const c of deviceCols) {
    try {
      await query(`ALTER TABLE devices ADD COLUMN ${c.name} ${c.type}`);
    } catch {
      // Column already exists
    }
  }

  // Create Telemetry Readings table
  await query(`
    CREATE TABLE IF NOT EXISTS telemetry_readings (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(100) NOT NULL,
      account_id VARCHAR(100) NOT NULL,
      door_status VARCHAR(20) NOT NULL,
      state VARCHAR(30) NOT NULL,
      dht_exists BOOLEAN NOT NULL DEFAULT true,
      gas_exists BOOLEAN NOT NULL DEFAULT true,
      door_exists BOOLEAN NOT NULL DEFAULT true,
      temperature NUMERIC(5, 2),
      humidity NUMERIC(5, 2),
      gas_level INTEGER,
      system_mode VARCHAR(20) DEFAULT 'AUTO',
      inlet_fan VARCHAR(10) DEFAULT 'OFF',
      outlet_fan VARCHAR(10) DEFAULT 'OFF',
      humidifier VARCHAR(10) DEFAULT 'OFF',
      blue_led VARCHAR(10) DEFAULT 'OFF',
      white_led VARCHAR(10) DEFAULT 'OFF',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create Alerts table
  await query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(100) NOT NULL,
      account_id VARCHAR(100) NOT NULL,
      type VARCHAR(50) NOT NULL,
      severity VARCHAR(20) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      resolved BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create Push Subscriptions table for Web Push API
  await query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      account_id VARCHAR(100) NOT NULL,
      endpoint TEXT NOT NULL,
      subscription_json TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default demo user & device if not present
  try {
    const userCheck = await query('SELECT id FROM users WHERE email = $1', ['demo@freshguard.app']);
    if (userCheck.rows.length === 0) {
      const passwordHash = await bcrypt.hash('password123', 10);
      await query(`
        INSERT INTO users (account_id, email, phone, password_hash, name)
        VALUES ($1, $2, $3, $4, $5)
      `, ['mshiva5626', 'demo@freshguard.app', '+15550192834', passwordHash, 'Demo Researcher']);
      console.log('[Database Seed] Created default demo user: demo@freshguard.app / password123 (account: mshiva5626)');
    }

    const deviceCheck = await query('SELECT device_id FROM devices WHERE device_id = $1', ['SF-001']);
    if (deviceCheck.rows.length === 0) {
      await query(`
        INSERT INTO devices (device_id, account_id, nickname, temp_min, temp_max, humidity_min, humidity_max, gas_threshold, granule_interval_days)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 30)
      `, ['SF-001', 'mshiva5626', 'Primary Vault Alpha', 1.0, 4.0, 90.0, 95.0, 230]);
      console.log('[Database Seed] Created default device: SF-001 (Primary Vault Alpha)');

      // Seed initial baseline telemetry reading
      await query(`
        INSERT INTO telemetry_readings (
          device_id, account_id, door_status, state,
          dht_exists, gas_exists, door_exists,
          temperature, humidity, gas_level,
          system_mode, inlet_fan, outlet_fan, humidifier, blue_led, white_led
        ) VALUES (
          'SF-001', 'mshiva5626', 'CLOSED', 'NORMAL',
          true, true, true,
          3.2, 92.5, 145,
          'AUTO', 'OFF', 'OFF', 'ON', 'OFF', 'OFF'
        )
      `);

      // Seed sample initial alert
      await query(`
        INSERT INTO alerts (device_id, account_id, type, severity, title, message, resolved)
        VALUES (
          'SF-001', 'mshiva5626', 'GRANULE_REPLACEMENT', 'INFO',
          'Catalytic Filter Granules Scheduled Check',
          'FreshGuard chamber filter granules operational. Next media inspection due in 30 days.',
          false
        )
      `);
    }
  } catch (err: any) {
    console.error('[Database Seed] Error seeding demo data:', err.message);
  }

  console.log('[Database] Tables, alerts schema, and seed data ready.');
}
