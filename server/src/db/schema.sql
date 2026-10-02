-- FreshGuard PostgreSQL Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    account_id VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- OTP verification codes table
CREATE TABLE IF NOT EXISTS otps (
    id SERIAL PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Devices table: device_id, account_id, nickname, current thresholds
CREATE TABLE IF NOT EXISTS devices (
    device_id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL,
    nickname VARCHAR(100) NOT NULL DEFAULT 'FreshGuard Vault',
    temp_min NUMERIC(5, 2) DEFAULT 1.0,
    temp_max NUMERIC(5, 2) DEFAULT 4.0,
    humidity_min NUMERIC(5, 2) DEFAULT 90.0,
    humidity_max NUMERIC(5, 2) DEFAULT 95.0,
    gas_threshold INTEGER DEFAULT 230,
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

-- Telemetry readings table matching exact ESP32 JSON contract
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

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry_readings (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_account_time ON telemetry_readings (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_devices_account ON devices (account_id);
CREATE INDEX IF NOT EXISTS idx_otps_identifier ON otps (identifier, used, expires_at);
