# FreshGuard IoT Platform — System Specification & Data Contracts

## 1. Hardware Context & ESP32 Specifications
The ESP32 firmware (`esp32_freshguard.ino`) is fixed and operates as the physical controller for the FreshGuard botanical chamber.

### Sensors & Actuators
- **Microcontroller**: ESP32-WROOM-32 / NodeMCU-32S
- **DHT11**: Temperature & Relative Humidity (GPIO 4)
- **MQ Gas Sensor**: Ethylene ($C_2H_4$) & VOC Index (GPIO 34 / ADC1_CH6, 12-bit: 0–4095, scaled to 0–1023)
- **IR Door Sensor**: Optical safety beam (GPIO 14, INPUT_PULLUP, HIGH when open)
- **TTP223 Capacitive Bezel Touch**: Manual white light toggle (GPIO 13)
- **Relays (Active LOW)**:
  - Relay 1 (GPIO 16): Inlet HEPA Fan (Air Intake)
  - Relay 2 (GPIO 17): Outlet Scrubber Fan (Catalytic Purge)
  - Relay 3 (GPIO 5): 1.7MHz Ultrasonic Humidifier Mist
  - Relay 4 (GPIO 19): 5000K Inspection Daylight LED Bar
  - Relay 5 (GPIO 18): 450nm Antimicrobial Blue Light

### Bluetooth (BLE) Provisioning
- **Device Advertised Name**: `FreshGuard` / `FreshGuard-Vault-ESP32`
- **Service UUID**: `4fafc201-1fb5-459e-8fcc-c5c9c331914b`
- **Wi-Fi Config Characteristic (Write)**: `beb5483e-36e1-4688-b7f5-ea07361b26a8`
- **Status & Notification Characteristic (Read/Notify)**: `1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e`

### Timing & Safety Workflow
- **Safety Interlock**: When door is OPEN, inlet fan, outlet fan, and mist atomizer halt immediately.
- **Stabilization Delay**: 5000ms countdown after door CLOSES before normal climate control resumes.
- **Telemetry Upload Interval**: 2500ms over HTTP POST to `http://<server-host>/api/telemetry`.

---

## 2. Data Honesty Rules
1. **Ethylene / VOC Index**: `gas_level` represents an uncalibrated relative index (0–1023), NOT absolute ppm. Display labels as "Ethylene / VOC Index".
2. **Sensor Offline States**: When hardware flags (`dht_exists`, `gas_exists`, `door_exists`) are `false`, `temperature`, `humidity`, and `gas_level` MUST be stored as `null` and displayed in the UI as "Sensor offline".
3. **Connectivity Differentiation**: Distinguish between "On box's Wi-Fi — full control" vs "Away — monitoring only".

---

## 3. Database Schema (PostgreSQL)

```sql
-- Users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    account_id VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- OTP verification
CREATE TABLE otps (
    id SERIAL PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Devices: device_id, account_id, nickname, current thresholds
CREATE TABLE devices (
    device_id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL,
    nickname VARCHAR(100) NOT NULL DEFAULT 'FreshGuard Vault',
    temp_min NUMERIC(5, 2) DEFAULT 1.0,
    temp_max NUMERIC(5, 2) DEFAULT 4.0,
    humidity_min NUMERIC(5, 2) DEFAULT 90.0,
    humidity_max NUMERIC(5, 2) DEFAULT 95.0,
    gas_threshold INTEGER DEFAULT 230,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Telemetry Readings (exact ESP32 contract)
CREATE TABLE telemetry_readings (
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

CREATE INDEX idx_telemetry_device_time ON telemetry_readings (device_id, created_at DESC, id DESC);
CREATE INDEX idx_telemetry_account_time ON telemetry_readings (account_id, created_at DESC, id DESC);
```

---

## 4. API Contracts

### A. Telemetry Ingestion (ESP32 & Web Clients)
- **Endpoint**: `POST /api/telemetry`
- **Headers**: `Content-Type: application/json`
- **Payload Shape**:
```json
{
  "device_id": "SF-001",
  "account_id": "mshiva5626",
  "door_status": "CLOSED",
  "state": "NORMAL",
  "dht_exists": true,
  "gas_exists": true,
  "door_exists": true,
  "temperature": 14.2,
  "humidity": 91.5,
  "gas_level": 87,
  "system_mode": "AUTO",
  "inlet_fan": "ON",
  "outlet_fan": "OFF",
  "humidifier": "ON",
  "blue_led": "OFF",
  "white_led": "OFF"
}
```
- **Null-Sensor Cases**:
  - `dht_exists: false` $\rightarrow$ `temperature: null`, `humidity: null`
  - `gas_exists: false` $\rightarrow$ `gas_level: null`
- **Response**: `201 Created` with `{ success: true, reading: { ... } }`
- **Side Effect**: Emits real-time `telemetry` event to Socket.io room `account:${account_id}`.

### B. User Authentication
- `POST /api/auth/register`: `{ email, password, name, phone?, account_id? }` $\rightarrow$ `{ token, user }`
- `POST /api/auth/login`: `{ email, password }` or `{ phone, password }` $\rightarrow$ `{ token, user }`
- `POST /api/auth/otp/request`: `{ identifier }` (email or phone) $\rightarrow$ `{ message, otp, expires_in_seconds }`
- `POST /api/auth/otp/verify`: `{ identifier, otp }` $\rightarrow$ `{ token, user }`
- `GET /api/auth/me`: Header `Authorization: Bearer <token>` $\rightarrow$ `{ user, devices }`

### C. Device Management & Readings (Protected by Bearer Token)
- `GET /api/devices`: List all devices for the account with current thresholds and latest reading.
- `POST /api/devices`: Register/pair device `{ device_id, nickname, temp_min?, temp_max?, humidity_min?, humidity_max?, gas_threshold? }`
- `GET /api/devices/:deviceId/latest`: Returns the single most recent telemetry record.
- `GET /api/devices/:deviceId/history?limit=50&from=...&to=...`: Historical readings range.
- `PUT /api/devices/:deviceId/thresholds` (and `PATCH`): Update thresholds:
  `{ temp_min, temp_max, humidity_min, humidity_max, gas_threshold, nickname? }`

---

## 5. Socket.io Real-Time Channel
- **Transport**: WebSocket / Polling
- **Authentication**: JWT passed via `auth: { token: "..." }` or event `socket.emit('join_account', { account_id: '...' })`.
- **Target Room**: `account:${account_id}`
- **Broadcast Events**:
  - Event: `'telemetry'`
  - Payload: Ingested telemetry object with latest sensor readings and actuator states.
