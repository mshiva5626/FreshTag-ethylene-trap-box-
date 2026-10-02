# 🌱 FreshGuard — Autonomous Botanical Precision Storage Chamber

[![React](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite%20%2B%20PWA-61dafb.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express%20%2B%20Socket.io-339933.svg)](https://nodejs.org/)
[![ESP32](https://img.shields.io/badge/Firmware-ESP32%20BLE%20%26%20WiFi-E7352C.svg)](https://www.espressif.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**FreshGuard** is an end-to-end IoT platform and autonomous climate vault for precision botanical storage of fruits and vegetables. It monitors temperature, relative humidity, ethylene ($C_2H_4$) / VOC gas concentration, and door access states. 

The system features:
1. **ESP32 Firmware** with **Wi-Fi SoftAP & QR Code Provisioning**, local REST API on port 80 with CORS, and optical safety interlocks.
2. **PWA Frontend Application** with real-time Socket.io graphs, live camera QR scanner, Wi-Fi configuration wizard, local control fallbacks, and customizable crop profiles.
3. **High-Performance Express Backend** with PostgreSQL storage (with pg-mem development mode), JWT/OTP authentication, Web Push alerts, and Socket.io live telemetry channels.

---

## 📐 Hardware Specifications & Pinout

### ESP8266 NodeMCU / WeMos D1 Mini Pinout:
Firmware: [`firmware/esp8266_freshguard/esp8266_freshguard.ino`](file:///c:/Users/mshiv/Downloads/frehtag/firmware/esp8266_freshguard/esp8266_freshguard.ino) or [`esp8266_freshguard/esp8266_freshguard.ino`](file:///c:/Users/mshiv/Downloads/frehtag/esp8266_freshguard/esp8266_freshguard.ino)

| Component | ESP8266 Pin | GPIO | Mode | Signal / Description |
| :--- | :--- | :--- | :--- | :--- |
| **DHT11 Sensor** | **D2** | **GPIO 4** | Bidirectional | Digital Temperature & Relative Humidity Data |
| **MQ Gas Sensor** | **A0** | **ADC0** | Analog Input | 10-bit (0–1023) Ethylene / VOC gas level index |
| **IR Safety Door Sensor** | **D5** | **GPIO 14** | `INPUT_PULLUP` | Optical beam interlock (`HIGH` when door open) |
| **TTP223 Capacitive Touch** | **D7** | **GPIO 13** | `INPUT` | Bezel tap for White LED toggle / 20s hold to Reset Wi-Fi & restore Hotspot |
| **Relay 1: Inlet Fan** | **D1** | **GPIO 5** | `OUTPUT` (Active `LOW`) | HEPA fresh air intake ventilation |
| **Relay 2: Outlet Fan** | **D6** | **GPIO 12** | `OUTPUT` (Active `LOW`) | Catalytic ethylene purge / exhaust scrubber |
| **Relay 3: Ultrasonic Humidifier** | **D0** | **GPIO 16** | `OUTPUT` (Active `LOW`) | 1.7MHz ultrasonic atomizer for moisture maintenance |
| **Relay 4: Inspection LED Bar** | **D3** | **GPIO 0** | `OUTPUT` (Active `LOW`) | 5000K daylight inspection illumination |
| **Relay 5: Antimicrobial Blue LED**| **D4** | **GPIO 2** | `OUTPUT` (Active `LOW`) | 450nm pathogen suppression & **Onboard Blue LED** (QR Pairing blinker) |

---

### ESP32-WROOM-32 / NodeMCU-32S Pinout:
Firmware: [`firmware/esp32_freshguard/esp32_freshguard.ino`](file:///c:/Users/mshiv/Downloads/frehtag/firmware/esp32_freshguard/esp32_freshguard.ino)

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
| **Relay 5: Antimicrobial Blue LED**| **GPIO 18** | `OUTPUT` (Active `LOW`) | 450nm pathogen suppression & QR pairing blinker |

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

## 🌐 Standalone IP-Address Web Dashboard (Direct Access)

The ESP8266 firmware operates 100% standalone with its own **built-in Zero-Dependency Web Dashboard** served directly from Flash ROM (no cloud pairing or internet required!):
- **Direct LAN IP Access**: Navigate directly to `http://<ESP-IP>/` in any browser on your phone, tablet, or PC.
- **Standalone Hotspot**: If not connected to Wi-Fi, it broadcasts `FreshTag-Vault` at `http://192.168.4.1/`.
- **Live Auto-Refreshing Conditions (every 1.2s)**:
  - 🌡️ **Temperature**: Real-time °C and °F with target range indicators.
  - 💧 **Relative Humidity**: Real-time % RH with ultrasonic mist status.
  - 🍃 **Ethylene & VOC Gas**: 0–1023 PPM index with dynamic color-coded safety bar.
  - 🚪 **Door Status**: Open / Closed with safety interlock indicator and stabilization countdown.
- **Hardware Actuator Relays**:
  - Live ON/OFF toggle switches for Inlet Fan (D1), Outlet Scrubber (D6), Humidifier Mist (D0), Daylight LED (D3), and Blue LED (D4).
  - Mode Switch: Toggle between **`AUTO` (Autonomous Climate Regulation)** and **`MANUAL` (Hardware Override)**.
- **Botanical Threshold Configuration**:
  - Adjust Min/Max Temperature, Min/Max Humidity, Ethylene Trigger, Gas Hysteresis, and Anti-Flicker Dwell Time directly from the browser with permanent EEPROM Flash storage.
  - Door Interlock Software Toggle: Enable for production or Bypass for desktop prototyping.
- **Integrated Wi-Fi Setup**: Scan nearby networks and save credentials directly from the web dashboard.

---

## 🛡️ Anti-Flicker & Relay Protection Engine

To completely eliminate relay chattering and contact flickering:
1. **Anti-Short-Cycling Dwell Protection**: Relays enforce a minimum 4-second dwell time before any state change is permitted, preventing rapid on/off switching.
2. **Dual-Threshold Hysteresis**:
   - **Gas Purge**: Purge fans energize when gas reaches `>= 230 PPM`, but will only shut off when gas drops below `200 PPM` (`gasThreshold - 30 PPM hysteresis`).
   - **Humidity Regulation**: Ultrasonic mist turns on below `85% RH` and turns off only when reaching `92% RH`.
3. **16-Sample ADC Oversampling + EMA Filtering**: The analog gas reading is smoothed via a 16-sample burst and Exponential Moving Average (`0.75 * previous + 0.25 * sample`) to eliminate electrical noise and RF spikes.
4. **Controlled Loop Rate**: Automatic climate control evaluates at a disciplined 1.2-second interval instead of thousands of times per millisecond.
5. **No Pairing Blinking on Relay Pins**: Blue LED / Relay pins are never toggled by pairing or connection loops.

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
