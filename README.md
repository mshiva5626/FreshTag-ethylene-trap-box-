# 🌱 Smart FreshGuard — IoT Intelligent Fruit & Vegetable Storage Chamber

**Smart FreshGuard** is a responsive, full-stack IoT web application and automated hardware controller for an **ESP32-based smart agricultural storage chamber**. It monitors temperature, humidity, gas/air-quality (as an indicator of ripening-related gases such as ethylene), and door access. It autonomously operates an **Inlet Fan, Outlet Fan, Ultrasonic Humidifier, Blue Antimicrobial LED, and White LED** through relay modules.

---

## ⚡ Key Feature: IR Door Safety Interlock & 5-Second Recovery Workflow

The system implements a strict state machine to prevent chamber disruption from ambient room air:

```text
 ┌────────────────────────────────────────────────────────┐
 │                      DOOR CLOSED                       │
 │  - Normal climate control running                      │
 │  - Sensors sampled on interval                         │
 │  - Relays regulated per crop thresholds                │
 └──────────────────────────┬─────────────────────────────┘
                            │ IR Sensor detects DOOR OPEN
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │                   DOOR OPEN / PAUSED                   │
 │  - Inlet Fan: OFF                                      │
 │  - Outlet Fan: OFF                                     │
 │  - Humidifier: OFF                                     │
 │  - Climate control loop: PAUSED                        │
 │  - Door-open telemetry event uploaded to Web App       │
 └──────────────────────────┬─────────────────────────────┘
                            │ IR Sensor detects DOOR CLOSED
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │           5-SECOND STABILIZATION COUNTDOWN             │
 │  - Radial countdown timer ticks: 5.0s -> 0.0s          │
 │  - Fans & Humidifier remain OFF                        │
 │  - IF DOOR OPENS AGAIN: Timer ABORTS -> Returns PAUSED │
 └──────────────────────────┬─────────────────────────────┘
                            │ 5 seconds complete without interruption
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │                   SYSTEM RESTART                       │
 │  - Fans restart                                        │
 │  - DHT22 (Temp & Humidity) & MQ (Gas) sensors sampled  │
 │  - Automatic climate logic evaluates fresh readings    │
 │  - Live Web App displays: "✓ SYSTEM ACTIVE"            │
 └────────────────────────────────────────────────────────┘
```

---

## 🛠️ Hardware Wiring & Pinout Guide

| Component | ESP32 GPIO | GPIO # | Function / Relay Channel |
| :--- | :--- | :--- | :--- |
| **DHT22** | **GPIO4** | 4 | Digital Temp & Relative Humidity Data (with 10k pull-up) |
| **MQ Gas Sensor** | **GPIO34** | 34 | Analog ethylene / VOC / air quality voltage — ADC1_CH6 (0–4095, 12-bit) |
| **IR Door Sensor** | **GPIO14** | 14 | Obstacle detection beam across door frame |
| **Touch Sensor (TTP223)** | **GPIO13** | 13 | Capacitive pulse for local White LED toggle |
| **Relay 1: Inlet Fan** | **GPIO16** | 16 | Introduces fresh air into chamber |
| **Relay 2: Outlet Fan** | **GPIO17** | 17 | Exhausts chamber air & purges ethylene |
| **Relay 3: Humidifier** | **GPIO5** | 5 | Ultrasonic mist generation to prevent wilting |
| **Relay 4: Blue LED** | **GPIO18** | 18 | 450nm experimental antimicrobial preservation light |
| **Relay 5: White LED** | **GPIO19** | 19 | Chamber interior illumination |

---

## 🍇 Modular Crop Storage Presets

Different produce categories require distinct microclimatic storage setpoints. Smart FreshGuard includes pre-calibrated agricultural profiles:

* **🍎 Apples (*Malus domestica*)**: 1.0 - 4.0°C | 90 - 95% RH | Gas limit: 230 ppm | Blue light: 30 min/day
* **🍌 Bananas (*Musa acuminata*)**: 13.0 - 15.0°C | 85 - 90% RH | Gas limit: 210 ppm | Blue light: OFF (Chilling sensitive!)
* **🍅 Tomatoes (*Solanum lycopersicum*)**: 10.0 - 13.0°C | 85 - 90% RH | Gas limit: 260 ppm | Blue light: 20 min/day
* **🥬 Leafy Greens (Spinach & Lettuce)**: 0.5 - 3.5°C | 95 - 98% RH | Gas limit: 180 ppm | Near-saturation humidity
* **🍓 Strawberries (*Fragaria × ananassa*)**: 0.0 - 2.0°C | 90 - 95% RH | Gas limit: 190 ppm | Blue light inhibits gray mold
* **🥔 Potatoes (*Solanum tuberosum*)**: 7.0 - 10.0°C | 85 - 90% RH | Gas limit: 280 ppm | Keep in complete darkness!
* **🍊 Oranges & Citrus**: 4.0 - 8.0°C | 85 - 90% RH | Gas limit: 240 ppm
* **⚙️ Custom Protocol**: User-tunable sliders for temperature, humidity, and gas threshold limits.

---

## 🚀 How to Run the Application

### 1. Launch the Local Web & REST API Server
Double-click `start_server.bat` or run in PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1
```
The server will start on `http://localhost:8080`.

### 2. Open the Dashboard in your Browser
Navigate to:
```
http://localhost:8080
```
*(You can also double-click `index.html` to run in standalone browser mode with the built-in hardware simulator!)*

---

## 🔬 Interactive Hardware Lab (Built-in Simulator)

Click the **"Hardware Lab"** button in the top right navbar to test the chamber without physical hardware:
1. **Open Door**: Simulates breaking the IR beam. Watch the 3D door swing open, fans and humidifier immediately stop, and the dashboard turn red with safety alerts.
2. **Close Door (5s Delay)**: Watch the radial 5-second countdown timer dial tick down. When 0.0s is reached, fans restart and sensor readings stabilize.
3. **Cancel Countdown Test**: Click "Close Door", then click "Open Door" within 2 seconds. The countdown is immediately aborted and the system remains safely paused!
4. **Tap Touch Sensor**: Toggles the White LED relay locally just like touching the physical TTP223 sensor.
5. **Ripening Gas Spike**: Injects an ethylene surge to test the automated exhaust ventilation purge.
6. **Virtual Serial Monitor**: Displays real-time Arduino C++ serial output at 115200 baud.

---

## 📡 ESP32 REST API Endpoints

* `GET /api/telemetry/latest` — Returns current chamber temperature, humidity, gas ppm, door status, and relay states.
* `POST /api/telemetry` — ESP32 telemetry upload endpoint.
* `POST /api/control` — Web app manual relay override commands (Inlet Fan, Outlet Fan, Humidifier, White LED, Blue LED, Mode).
* `GET /api/telemetry/history` — Returns historical sensor readings.
* `GET /api/config` — Fetches current crop threshold configuration.
* `POST /api/config` — Deploys updated setpoints to the chamber.
* `GET /api/export/csv` — Generates and downloads full CSV telemetry log.

---

## 💻 Arduino ESP32 Firmware Setup

The production-ready firmware is located in:
```
firmware/esp32_freshguard.ino
```

### Steps to Flash:
1. Open `firmware/esp32_freshguard.ino` in the Arduino IDE.
2. In **Tools > Board**, select **ESP32 Dev Module** or **WEMOS LOLIN32**.
3. Install required libraries from Arduino Library Manager:
   - `DHT sensor library` by Adafruit
   - `ArduinoJson` (v6.x) by Benoit Blanchon
   - `WiFi`, `HTTPClient` & `WebServer` (included with ESP32 Arduino core)
4. Update `WIFI_SSID`, `WIFI_PASSWORD`, and `SERVER_HOST` with your Wi-Fi credentials and PC's local IP address.
5. Connect your ESP32 via USB-C/micro-USB and click **Upload**.
