# 🌱 FreshGuard — Autonomous Botanical Precision Storage Chamber

[![React](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite%20%2B%20PWA-61dafb.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express%20%2B%20Socket.io-339933.svg)](https://nodejs.org/)
[![ESP32](https://img.shields.io/badge/Firmware-ESP32%20BLE%20%26%20WiFi-E7352C.svg)](https://www.espressif.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**FreshGuard** is an end-to-end IoT platform and autonomous climate vault for precision botanical storage of fruits and vegetables. It monitors temperature, relative humidity, ethylene ($C_2H_4$) / VOC gas concentration, and door access states. 

The system features:
1. **ESP32 Firmware** with seamless **Web Bluetooth (BLE) Provisioning**, local REST API on port 80 with CORS, and optical safety interlocks.
2. **PWA Frontend Application** with real-time Socket.io graphs, Web Bluetooth pairing modal, local Wi-Fi control fallbacks, and customizable crop profiles.
3. **High-Performance Express Backend** with PostgreSQL storage (with pg-mem development mode), JWT/OTP authentication, Web Push alerts, and Socket.io live telemetry channels.

---

## 📐 Hardware Specifications & Pinout

All data pins operate at 3.3V logic on standard ESP32-WROOM-32 / NodeMCU-32S boards:

| Component | ESP32 GPIO | Mode | Signal / Description |
| :--- | :--- | :--- | :--- |
| **DHT11 Sensor** | **GPIO 4** | Bidirectional | Digital Temperature & Relative Humidity Data |
| **MQ Gas Sensor** | **GPIO 34** | Analog Input (ADC1_CH6) | 12-bit (0–4095) Ethylene / VOC gas level index |
| **IR Safety Door Sensor** | **GPIO 14** | `INPUT_PULLUP` | Optical beam interlock (`HIGH` when door open) |
| **TTP223 Capacitive Touch** | **GPIO 13** | `INPUT` | Bezel tap sensor for instant White LED toggle |
| **Relay 1: Inlet Fan** | **GPIO 16** | `OUTPUT` (Active `LOW`) | HEPA fresh air intake ventilation |
| **Relay 2: Outlet Fan** | **GPIO 17** | `OUTPUT` (Active `LOW`) | Catalytic ethylene purge / exhaust scrubber |
| **Relay 3: Ultrasonic Humidifier** | **GPIO 5** | `OUTPUT` (Active `LOW`) | 1.7MHz ultrasonic atomizer for moisture maintenance |
| **Relay 4: Inspection LED Bar** | **GPIO 19** | `OUTPUT` (Active `LOW`) | 5000K daylight inspection illumination |
| **Relay 5: Antimicrobial Blue LED**| **GPIO 18** | `OUTPUT` (Active `LOW`) | 450nm pathogen suppression & BLE pairing blinker |

---

## ⚡ Safety Interlock & Chamber Stabilization Workflow

To protect the calibrated microclimate from room temperature and humidity disruption:

```
 ┌────────────────────────────────────────────────────────┐
 │                      DOOR CLOSED                       │
 │  - Autonomous climate control active                   │
 │  - Relays regulated per active botanical thresholds    │
 └──────────────────────────┬─────────────────────────────┘
                            │ IR Sensor detects DOOR OPEN
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │                   DOOR OPEN / PAUSED                   │
 │  - Inlet Fan: OFF                                      │
 │  - Outlet Fan: OFF                                     │
 │  - Humidifier Mist: OFF                                │
 │  - Immediate safety lockout on climate actuators       │
 │  - Event published to Web App via Socket.io            │
 └──────────────────────────┬─────────────────────────────┘
                            │ IR Sensor detects DOOR CLOSED
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │           5-SECOND STABILIZATION COUNTDOWN             │
 │  - 5000ms countdown timer starts                       │
 │  - Actuators remain locked in safe state               │
 │  - IF DOOR RE-OPENS: Timer cancels immediately        │
 └──────────────────────────┬─────────────────────────────┘
                            │ 5 seconds complete uninterrupted
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │                   NORMAL OPERATION                     │
 │  - Sensors re-sampled for stabilized readings          │
 │  - Climate control algorithm resumes                   │
 └────────────────────────────────────────────────────────┘
```

---

## 📲 Bluetooth Low Energy (BLE) Provisioning

The chamber can be provisioned directly from modern desktop and mobile web browsers using the **Web Bluetooth API**:
- **Device Names**: `FreshGuard` / `FreshGuard-Vault-ESP32`
- **Service UUID**: `4fafc201-1fb5-459e-8fcc-c5c9c331914b`
- **Wi-Fi Config Characteristic (Write)**: `beb5483e-36e1-4688-b7f5-ea07361b26a8`
- **Status Characteristic (Read / Notify)**: `1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e`

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Arduino IDE 2.x or Arduino CLI (with ESP32 board package installed)

### 1. Start the Backend Server
```bash
cd server
npm install
npm run dev
```
The server starts on `http://localhost:8080`.
By default, `USE_PG_MEM=true` is enabled for zero-config, in-memory PostgreSQL testing.

Run automated test suite:
```bash
npm test
```

### 2. Start the Frontend Dashboard
```bash
cd app
npm install
npm run dev
```
The dashboard runs at `http://localhost:5173`.

### 3. Flash the ESP32 Firmware
1. Open [esp32_freshguard.ino](esp32_freshguard.ino) in Arduino IDE.
2. Select Board: **ESP32 Dev Module**.
3. Install dependencies from the Arduino Library Manager:
   - `DHT sensor library` by Adafruit
   - `ArduinoJson` (v6 or v7) by Benoit Blanchon
4. Connect the ESP32 via USB and click **Upload**.
5. After boot, the Blue LED will blink at 350ms intervals. Open the Web Dashboard, click **Pair Chamber via BLE**, and configure your Wi-Fi credentials.

---

## 📁 Repository Structure

```
├── esp32_freshguard.ino  # Production ESP32 firmware (BLE + Local REST + Interlock)
├── project.md            # Hardware data contracts, database schema & system specs
├── app/                  # React 18 + TypeScript + Vite + PWA web dashboard
│   ├── src/
│   │   ├── pages/        # Dashboard, BoxDetail, Devices, Automation, Profile
│   │   ├── store/        # Zustand stores (deviceStore, authStore, socketStore)
│   │   ├── utils/        # Web Bluetooth API utilities (ble.ts)
│   │   └── components/   # UI components and modals
│   └── package.json
├── server/               # Express + TypeScript + Socket.io backend
│   ├── src/
│   │   ├── routes/       # Auth, devices, telemetry, alerts endpoints
│   │   ├── socket/       # Socket.io room broadcasting
│   │   └── db/           # Database schema, init, and pg-mem fallback
│   ├── tests/            # Vitest unit & integration test suites
│   └── package.json
└── vite.config.ts        # Root workspace configuration
```

---

## 📄 License
This project is licensed under the MIT License.
