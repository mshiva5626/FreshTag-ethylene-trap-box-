/*
  ==============================================================================
    Smart FreshTag - ESP8266 Autonomous Botanical Precision Storage Chamber
    PREMIUM STANDALONE WEB DASHBOARD • CALIBRATION STUDIO • CYCLIC AERATION
    
    HARDWARE PIN ASSIGNMENTS (ESP8266 NodeMCU):
    - DHT11 Sensor (Temperature & Humidity):       D2 (GPIO 4)
    - MQ Gas Sensor (Ethylene / C2H4 Analog):       A0 (ADC0, 10-bit: 0 - 1023)
    - IR Safety Door Sensor (Beam Interlock):       D5 (GPIO 14, INPUT_PULLUP)
    - TTP223 Capacitive Touch Sensor (Tap/Reset):   D7 (GPIO 13, INPUT)
      * Tap (< 3s): Toggle 5000K Inspection Daylight LED
      * Long Hold (20 seconds): Wipe Wi-Fi credentials & restore Standalone Hotspot ("FreshTag-Vault")
    - Relay 1: Inlet HEPA Fan (Air Intake):        D1 (GPIO 5,  Active LOW)
    - Relay 2: Outlet Purge / Scrubber Fan:        D6 (GPIO 12, Active LOW)
    - Relay 3: 1.7MHz Ultrasonic Humidifier Mist:  D0 (GPIO 16, Active LOW)
    - Relay 4: 5000K Daylight Inspection LED:      D3 (GPIO 0,  Active LOW)
    - Relay 5 / Aux: Antimicrobial Blue LED:       D4 (GPIO 2,  Active LOW)

    NEW CAPABILITIES & USER SPECIFICATIONS:
    1. Premium Glassmorphic Web Dashboard with Navigation Tabs:
       - 📊 Chamber Console (Real-time gauges, live status, relays, cycle monitor)
       - 🔄 Cyclic Aeration & Automations (2 min ON, 5 min OFF schedule)
       - 🔬 Calibration Studio (Hidden/discreet tab: Live vs Show Data mode, 
         manual value editor, sensor offsets, and IR door polarity switch)
       - 📶 Wi-Fi Manager (Scanner, RSSI meter, IP setup, Wi-Fi Reset button)
    2. Intelligent Cyclic Ventilation Automation:
       - 2 Minutes Fan ON -> 5 Minutes Fan OFF -> Repeats continuously.
       - High PPM Continuous Override: If Ethylene exceeds threshold, fans run 
         CONTINUOUSLY until gas clears below safe bounds, then resume cyclic mode!
       - One-click toggle switch to enable/disable cyclic automation.
    3. IR Door Sensor Accuracy & Polarity Tuning:
       - Live reading always reflected on dashboard (never locked to closed).
       - Selectable polarity: Active HIGH vs Active LOW to match any sensor module.
       - Configurable Safety Interlock bypass for bench testing.
    4. Sensor Calibration & "Show Data" Mode:
       - Switch between "Live Hardware Data" and "Show Data / Override Mode".
       - Edit manual values (Temp, Humidity, Gas) in case sensor hardware is low-accuracy.
       - Sensor calibration offsets (+/- Temp, +/- Humidity, Gas Scale).
    5. Anti-Flicker & Low-Power Thermal Management:
       - Minimum 4s relay dwell lock, dual-hysteresis, CPU idle yield, 16dBm RF.
    6. Hardware Wi-Fi Recovery (20-Second Touch Sensor Hold):
       - Press and hold TTP223 capacitive touch sensor (Pin D7) for 20 seconds.
       - Wipes saved Wi-Fi credentials from Flash EEPROM & SDK flash.
       - Strobe LED confirmation and auto-reboots into standalone Hotspot ("FreshTag-Vault")
         at http://192.168.4.1 so Wi-Fi can be reconfigured effortlessly.
  ==============================================================================
*/

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266mDNS.h>
#include <WiFiClient.h>
#include <DNSServer.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <EEPROM.h>

// Universal ArduinoJson v6 and v7 Compatibility
#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
  typedef JsonDocument FreshGuardJsonDoc;
#else
  typedef StaticJsonDocument<2048> FreshGuardJsonDoc;
#endif

// SoftAP Hotspot Constants
#define AP_SSID_NAME         "FreshTag-Vault"
#define AP_DEFAULT_PASS      ""     // Open hotspot for instant access
const byte DNS_PORT        = 53;

// ======================== PIN ASSIGNMENTS ====================================
#define DHTPIN               4      // D2 / GPIO 4
#define DHTTYPE              DHT11  // DHT11 sensor type
#define MQ_PIN               A0     // A0 / ADC0 (0 - 1023)
#define IR_DOOR_PIN          14     // D5 / GPIO 14 (INPUT_PULLUP)
#define TOUCH_PIN            13     // D7 / GPIO 13 (TTP223 Touch sensor)

// Relay Polarities (Active LOW for standard optocoupled relay modules)
#define RELAY_ACTIVE_LEVEL   LOW
#define RELAY_INACTIVE_LEVEL HIGH

// Actuators & Relays (Safe GPIOs & Boot Strapping Notes)
#define RELAY_INLET_FAN      5      // D1 / GPIO 5  (HEPA Fresh Air Intake) - Safe GPIO
#define RELAY_OUTLET_FAN     12     // D6 / GPIO 12 (C2H4 Catalytic Scrubber) - Safe GPIO
#define RELAY_HUMIDIFIER     16     // D0 / GPIO 16 (1.7MHz Ultrasonic Atomizer) - Safe GPIO
// NOTE: Pin D3 (GPIO 0) is the NodeMCU Bootloader Flash Pin. If an attached relay prevents upload,
// hold the "FLASH" button on the board when Arduino IDE shows "Connecting...", or unplug D3 wire during upload.
#define RELAY_WHITE_LED      0      // D3 / GPIO 0  (5000K Inspection Daylight Bar)
#define RELAY_BLUE_LED       2      // D4 / GPIO 2  (Antimicrobial Blue LED / Aux)

// ======================== EEPROM PERSISTENCE STRUCT ==========================
#define EEPROM_SIZE          1024
#define EEPROM_MAGIC         0x46545636 // 'FTV6' - FreshTag Vault v6 (Calibrated Sensors)

struct VaultConfig {
  uint32_t magic;
  bool     configured;
  char     ssid[33];
  char     password[65];
  char     device_id[33];
  float    temp_min;
  float    temp_max;
  float    humidity_min;
  float    humidity_max;
  float    gas_threshold_ppm;       // Ethylene purge trigger in real PPM (default: 5.0 PPM)
  float    gas_hysteresis_ppm;      // Gas hysteresis in PPM (default: 1.0 PPM)
  int      min_dwell_sec;
  bool     door_interlock_enabled;
  bool     door_open_active_high;   // true = HIGH is open, false = LOW is open
  bool     cyclic_fan_enabled;      // 2 min ON / 5 min OFF ventilation cycle
  int      cyclic_run_sec;          // default: 120 (2 minutes)
  int      cyclic_rest_sec;         // default: 300 (5 minutes)
  bool     override_mode_enabled;   // true = Show Data / Manual Values, false = Live Sensors
  float    manual_temp;             // Manual temperature value
  float    manual_humidity;         // Manual humidity value
  float    manual_gas_ppm;          // Manual gas PPM value
  float    temp_offset;             // Calibration offset (°C)
  float    humidity_offset;         // Calibration offset (% RH)
  float    gas_scale;               // Calibration scale multiplier
  float    gas_r0;                  // MQ Clean Air baseline resistance in kOhm
  uint8_t  dht_type;                // 11 = DHT11, 22 = DHT22
  uint32_t checksum;
};

// ======================== STATE MACHINE ENUMS ================================
enum SystemState {
  STATE_NORMAL,
  STATE_DOOR_OPEN,
  STATE_WAIT_5_SECONDS,
  STATE_ALERT
};

enum FanCyclePhase {
  FAN_CYCLE_RUNNING, // 2 Minutes ON
  FAN_CYCLE_RESTING  // 5 Minutes OFF
};

// ======================== GLOBAL VARIABLES ===================================
SystemState currentState          = STATE_NORMAL;
String systemMode                 = "AUTO"; // "AUTO" or "MANUAL"
String deviceId                   = "FT-ESP8266";

// Stored Wi-Fi Credentials
String savedSsid                  = "";
String savedPass                  = "";
bool   isConfigured               = false;

// Displayed / Regulated Telemetry Values (Initialized to 0 until physical read)
float temperature                 = 0.0;
float humidity                    = 0.0;
float gasPpm                      = 0.0; // Calibrated Ethylene in PPM (e.g. 0.2 - 25.0 PPM)
int   gasLevel                    = 0;   // 0 - 100% Produce Air Quality Index
bool  isDoorOpen                  = false;

// Raw Hardware Sensor Readings
float rawTemperature              = 0.0;
float rawHumidity                 = 0.0;
int   rawGasLevel                 = 0;    // Raw ADC count (0 - 1023)
float rawGasRs                    = 25.0; // Measured Sensor Resistance in kOhm
int   rawDoorPinState             = HIGH;

bool dhtSensorExists              = false;
bool gasSensorExists              = false;
bool doorSensorExists             = true;
uint8_t dhtFailCount              = 0;
uint8_t gasFailCount              = 0;

// Actuator States
bool inletFanState                = false;
bool outletFanState               = false;
bool humidifierState              = false;
bool whiteLedState                = false;
bool blueLedState                 = false;

// Anti-Flicker & Relay Protection Dwell Timers
unsigned long minRelayDwellMs     = 4000; // 4 seconds minimum dwell time
unsigned long lastInletFanSwitch  = 0;
unsigned long lastOutletFanSwitch = 0;
unsigned long lastHumidifierSwitch= 0;

// Configurable Botanical Thresholds (Stored in EEPROM)
float tempMinThreshold            = 1.0;
float tempMaxThreshold            = 4.0;
float humidityMinThreshold        = 85.0;
float humidityMaxThreshold        = 92.0;
float gasThresholdPpm             = 5.0; // 5.0 PPM Ethylene purge trigger (Realistic)
float gasHysteresisPpm            = 1.0; // Purge shuts off below (5.0 - 1.0 = 4.0 PPM)
float gasR0                       = 25.0;// Clean-air baseline resistance in kOhm
uint8_t dhtModel                  = 11;  // 11 = DHT11, 22 = DHT22

// Door Interlock & Polarity
bool  doorInterlockEnabled        = false; // Default: bypassed for desk testing
bool  doorOpenActiveHigh          = true;  // true = HIGH is open, false = LOW is open
bool  lastRawDoorState            = false;
unsigned long lastDoorDebounce    = 0;

// Cyclic Ventilation Schedule (2 Minutes ON / 5 Minutes OFF)
bool  cyclicFanEnabled            = true;  // Can be toggled ON/OFF in dashboard
int   cyclicRunSec                = 120;   // 2 minutes run time
int   cyclicRestSec               = 300;   // 5 minutes rest time
FanCyclePhase fanCyclePhase       = FAN_CYCLE_RUNNING;
unsigned long fanCycleStartTime   = 0;
int   fanCycleRemainingSec        = 120;

// Sensor Calibration & "Show Data" Mode
bool  overrideModeEnabled         = false; // true = Show Data / Manual Values, false = Live Sensors
float manualTemp                  = 22.5;  // Realistic room temperature fallback
float manualHumidity              = 55.0;  // Realistic room humidity fallback
float manualGas                   = 0.4;   // Realistic clean air PPM fallback
float tempOffset                  = 0.0;
float humidityOffset              = 0.0;
float gasScaleFactor              = 1.0;

// Timers
unsigned long doorClosedTimestamp   = 0;
const unsigned long RECOVERY_DELAY_MS = 5000;  // 5s chamber stabilization
unsigned long lastSensorReadTime     = 0;
const unsigned long SENSOR_INTERVAL  = 1200;  // Sample sensors every 1.2s
unsigned long lastDhtReadTime        = 0;
unsigned long lastWiFiReconnectCheck = 0;
const unsigned long WIFI_RETRY_MS    = 30000; // Check WiFi every 30s if disconnected
int           wifiRetryCount          = 0;

// Touch Sensor State & Hardware 20-Second Factory Reset
int           lastRawTouchState         = LOW;
unsigned long touchPressStart           = 0;
unsigned long touchReleaseTime          = 0;
bool          touchResetTriggered       = false;
unsigned long lastTouchLogTime          = 0;
const unsigned long TOUCH_RESET_HOLD_MS = 20000UL; // 20 seconds hold threshold

// Asynchronous flags
volatile bool pendingWiFiConnect     = false;

// Networking Objects
DHT dht(DHTPIN, DHTTYPE);
ESP8266WebServer localServer(80);
DNSServer dnsServer;
IPAddress apIP(192, 168, 4, 1);
IPAddress netMsk(255, 255, 255, 0);

// Forward Declarations
bool safeSetRelay(uint8_t pin, bool desiredState, bool force = false);
void readSensors();
void calibrateCleanAirGasBaseline();
bool checkDoorStatus();
void handleDoorWorkflow();
void executeAutoClimateControl();
void handleTouchSensor();
void resetWiFiAndCredentials();
void setupHttpServerRoutes();
bool connectToWiFi(const char* ssid, const char* password);
void startStandaloneAP();
void loadConfigFromEEPROM();
void saveConfigToEEPROM();
void sendCORSHeaders();
bool parseRelayState(JsonVariant v);
uint32_t calculateChecksum(const VaultConfig& cfg);

// ==============================================================================
// EMBEDDED ZERO-DEPENDENCY PREMIUM WEB DASHBOARD (HTML / CSS / JS in PROGMEM)
// ==============================================================================
const char DASHBOARD_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>FreshTag Vault — Advanced Climate Console</title>
  <style>
    :root {
      --bg: #07090e;
      --card-bg: rgba(15, 23, 42, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent: #10b981;
      --accent-glow: rgba(16, 185, 129, 0.25);
      --text: #f8fafc;
      --muted: #94a3b8;
      --danger: #ef4444;
      --warning: #f59e0b;
      --sky: #38bdf8;
      --purple: #a855f7;
      --input-bg: rgba(7, 10, 18, 0.85);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: var(--bg); background-image: radial-gradient(circle at 50% 0%, rgba(16,185,129,0.08) 0%, transparent 60%); color: var(--text); min-height: 100vh; padding: 16px; display: flex; justify-content: center; }
    .container { width: 100%; max-width: 980px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }

    /* Top Header Bar */
    header { background: var(--card-bg); backdrop-filter: blur(20px); border: 1px solid var(--card-border); border-radius: 24px; padding: 20px 24px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
    .branding { display: flex; align-items: center; gap: 14px; }
    .logo-badge { width: 50px; height: 50px; border-radius: 16px; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); display: flex; align-items: center; justify-content: center; color: var(--accent); }
    h1 { font-size: 21px; font-weight: 800; letter-spacing: -0.02em; }
    .subtitle { font-size: 12px; color: var(--muted); margin-top: 2px; }
    
    .status-pill { display: inline-flex; align-items: center; gap: 7px; padding: 7px 16px; border-radius: 999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .pill-normal { background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.3); }
    .pill-alert { background: rgba(239,68,68,0.18); color: #f87171; border: 1px solid rgba(239,68,68,0.4); animation: glowAlert 1.5s infinite alternate; }
    .pill-door { background: rgba(245,158,11,0.18); color: #fbbf24; border: 1px solid rgba(245,158,11,0.4); }
    .pill-stabilize { background: rgba(56,189,248,0.18); color: #7dd3fc; border: 1px solid rgba(56,189,248,0.4); }
    @keyframes glowAlert { from { box-shadow: 0 0 5px rgba(239,68,68,0.2); } to { box-shadow: 0 0 16px rgba(239,68,68,0.6); } }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: pulse 1.6s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.8); } }

    /* Navigation Tabs */
    .nav-tabs { display: flex; gap: 8px; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(12px); padding: 6px; border-radius: 18px; border: 1px solid var(--card-border); overflow-x: auto; }
    .tab-btn { flex: 1; min-width: 120px; border: none; background: transparent; color: var(--muted); padding: 10px 14px; border-radius: 12px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 7px; white-space: nowrap; }
    .tab-btn:hover { color: var(--text); background: rgba(255,255,255,0.04); }
    .tab-btn.active { background: var(--accent); color: #022c22; box-shadow: 0 4px 14px var(--accent-glow); }
    .tab-btn.tab-secret { color: #cbd5e1; border: 1px dashed rgba(255,255,255,0.15); }
    .tab-btn.tab-secret.active { background: #3b82f6; color: #fff; border-color: #60a5fa; box-shadow: 0 4px 14px rgba(59,130,246,0.3); }

    /* Content Panels */
    .tab-pane { display: none; flex-direction: column; gap: 18px; animation: fadeIn 0.25s ease; }
    .tab-pane.active { display: flex; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

    /* Cyclic Aeration Banner */
    .cycle-banner { background: linear-gradient(90deg, rgba(16,185,129,0.12) 0%, rgba(56,189,248,0.08) 100%); border: 1px solid rgba(16,185,129,0.3); border-radius: 18px; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; }
    .cycle-status-left { display: flex; align-items: center; gap: 12px; }
    .cycle-icon-box { width: 40px; height: 40px; border-radius: 12px; background: rgba(16,185,129,0.2); display: flex; align-items: center; justify-content: center; font-size: 18px; }
    .cycle-title { font-size: 13px; font-weight: 700; }
    .cycle-timer { font-size: 12px; color: var(--sky); font-weight: 700; margin-top: 2px; }
    .cycle-toggle-switch { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--muted); }

    /* Telemetry Grid */
    .telemetry-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(215px, 1fr)); gap: 16px; }
    .sensor-card { background: var(--card-bg); backdrop-filter: blur(16px); border: 1px solid var(--card-border); border-radius: 20px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden; }
    .card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .card-label { font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .card-icon { width: 36px; height: 36px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.05); }
    .sensor-val { font-size: 36px; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 4px; }
    .sensor-val span { font-size: 16px; font-weight: 600; color: var(--muted); margin-left: 4px; }
    .sensor-sub { font-size: 11px; color: var(--muted); font-weight: 600; }
    .progress-bar-bg { width: 100%; height: 7px; background: rgba(255,255,255,0.08); border-radius: 999px; margin-top: 14px; overflow: hidden; }
    .progress-bar-fill { height: 100%; border-radius: 999px; transition: width 0.4s ease, background 0.4s ease; }

    /* Actuators Control Grid */
    .actuators-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 14px; }
    .actuator-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 18px; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; gap: 14px; }
    .actuator-card.active { border-color: var(--accent); background: linear-gradient(180deg, rgba(16,185,129,0.12) 0%, rgba(15,23,42,0.8) 100%); }
    .actuator-header { display: flex; justify-content: space-between; align-items: center; }
    .actuator-name { font-size: 13px; font-weight: 700; }
    .actuator-pin { font-size: 10px; color: var(--muted); background: rgba(255,255,255,0.06); padding: 2px 7px; border-radius: 6px; }
    .actuator-state-badge { font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
    .actuator-state-badge.on { color: #34d399; }
    .actuator-state-badge.off { color: var(--muted); }
    .btn-toggle { width: 100%; padding: 11px; border-radius: 12px; border: 1px solid var(--card-border); font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s; background: rgba(255,255,255,0.06); color: var(--text); }
    .btn-toggle.btn-on { background: var(--accent); color: #022c22; border-color: var(--accent); box-shadow: 0 4px 12px var(--accent-glow); }

    /* Cards & Forms */
    .content-box { background: var(--card-bg); backdrop-filter: blur(20px); border: 1px solid var(--card-border); border-radius: 22px; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .box-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--card-border); padding-bottom: 14px; }
    .box-title { font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 8px; }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
    
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    label { font-size: 12px; font-weight: 700; color: var(--muted); }
    input[type="number"], input[type="text"], input[type="password"], select { background: var(--input-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 11px 14px; color: var(--text); font-size: 13px; outline: none; transition: border-color 0.2s; }
    input:focus, select:focus { border-color: var(--accent); }

    .btn-primary { background: var(--accent); color: #022c22; font-weight: 700; font-size: 13px; padding: 12px 22px; border: none; border-radius: 12px; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px; justify-content: center; }
    .btn-primary:hover { filter: brightness(1.1); transform: translateY(-1px); }
    .btn-secondary { background: rgba(255,255,255,0.08); color: var(--text); border: 1px solid var(--card-border); font-weight: 700; font-size: 13px; padding: 12px 18px; border-radius: 12px; cursor: pointer; }

    /* Switch Component */
    .switch-label { display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; }
    .switch-ui { width: 44px; height: 24px; background: rgba(255,255,255,0.15); border-radius: 999px; position: relative; transition: background 0.3s; }
    .switch-ui::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: #fff; border-radius: 50%; transition: transform 0.3s; }
    input:checked + .switch-ui { background: var(--accent); }
    input:checked + .switch-ui::after { transform: translateX(20px); }
    .hidden-chk { display: none; }

    /* Toast Notification */
    #toast { position: fixed; bottom: 24px; right: 24px; padding: 13px 22px; border-radius: 14px; font-size: 13px; font-weight: 700; color: #fff; background: #1e293b; border: 1px solid #334155; box-shadow: 0 12px 32px rgba(0,0,0,0.6); opacity: 0; transform: translateY(12px); transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); pointer-events: none; z-index: 9999; }
    #toast.show { opacity: 1; transform: translateY(0); }
    #toast.success { background: #064e3b; border-color: #059669; color: #a7f3d0; }
    #toast.error { background: #7f1d1d; border-color: #dc2626; color: #fecaca; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header>
      <div class="branding">
        <div class="logo-badge">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <h1>FreshTag Produce Vault</h1>
          <p class="subtitle">ESP8266 Precision Botanical Climate Chamber</p>
        </div>
      </div>
      <div class="status-pill pill-normal" id="status-pill">
        <span class="dot"></span>
        <span id="status-text">INITIALIZING...</span>
      </div>
    </header>

    <!-- Navigation Tabs -->
    <div class="nav-tabs">
      <button class="tab-btn active" onclick="switchTab('tab-console')">📊 Vault Live</button>
      <button class="tab-btn" onclick="switchTab('tab-relays')">⚡ Actuators</button>
      <button class="tab-btn" onclick="switchTab('tab-automations')">🔄 Automations</button>
      <button class="tab-btn tab-secret" onclick="switchTab('tab-calibration')">🔬 Calibration Studio</button>
      <button class="tab-btn" onclick="switchTab('tab-network')">📶 Wi-Fi</button>
    </div>

    <!-- ==================== TAB 1: VAULT LIVE CONSOLE ==================== -->
    <div class="tab-pane active" id="tab-console">
      <!-- Cyclic Ventilation Status Banner -->
      <div class="cycle-banner">
        <div class="cycle-status-left">
          <div class="cycle-icon-box" id="cycle-icon">🌀</div>
          <div>
            <div class="cycle-title">Cyclic Aeration: <span id="cycle-phase-lbl" style="color:var(--accent);">2 MIN RUNNING</span></div>
            <div class="cycle-timer" id="cycle-timer-lbl">Time Remaining: 02:00</div>
          </div>
        </div>
        <div class="cycle-toggle-switch">
          <span>Cycle Auto:</span>
          <label class="switch-label">
            <input type="checkbox" id="chk-cyclic-enabled" class="hidden-chk" onchange="toggleCyclicAutomation(this.checked)">
            <span class="switch-ui"></span>
          </label>
        </div>
      </div>

      <!-- Telemetry Cards -->
      <div class="telemetry-grid">
        <!-- Temperature Card -->
        <div class="sensor-card">
          <div class="card-top">
            <span class="card-label">Temperature</span>
            <div class="card-icon" style="color: var(--sky);">🌡️</div>
          </div>
          <div>
            <div class="sensor-val"><span id="temp-val">--</span><span>°C</span></div>
            <div class="sensor-sub" id="temp-sub">Target: <strong id="temp-target-lbl">1.0 - 4.0 °C</strong></div>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" id="temp-bar" style="width: 50%; background: var(--sky);"></div>
          </div>
        </div>

        <!-- Humidity Card -->
        <div class="sensor-card">
          <div class="card-top">
            <span class="card-label">Humidity</span>
            <div class="card-icon" style="color: #34d399;">💧</div>
          </div>
          <div>
            <div class="sensor-val"><span id="hum-val">--</span><span>% RH</span></div>
            <div class="sensor-sub" id="hum-sub">Target: <strong id="hum-target-lbl">85% - 92%</strong></div>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" id="hum-bar" style="width: 80%; background: #34d399;"></div>
          </div>
        </div>

        <!-- Gas / Ethylene Card -->
        <div class="sensor-card">
          <div class="card-top">
            <span class="card-label">Ethylene Gas (C₂H₄)</span>
            <div class="card-icon" style="color: var(--warning);">🍃</div>
          </div>
          <div>
            <div class="sensor-val"><span id="gas-val">--</span><span>PPM</span></div>
            <div class="sensor-sub" id="gas-sub"><span id="gas-target-lbl">Purge: > 5.0 PPM</span></div>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" id="gas-bar" style="width: 25%; background: var(--accent);"></div>
          </div>
        </div>

        <!-- Safety Door Card -->
        <div class="sensor-card">
          <div class="card-top">
            <span class="card-label">Chamber Door</span>
            <div class="card-icon" style="color: #fbbf24;">🚪</div>
          </div>
          <div>
            <div class="sensor-val" id="door-status-text" style="font-size: 26px; font-weight: 800; margin-top: 6px;">CLOSED</div>
            <div class="sensor-sub" id="door-sub-text">Interlock Active</div>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" id="door-bar" style="width: 100%; background: #10b981;"></div>
          </div>
          <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
            <span id="door-pin-badge" style="font-weight: 700; color: var(--sky);">Pin D5: --</span>
            <button type="button" onclick="toggleDoorPolarity()" style="background: rgba(255,255,255,0.08); border: 1px solid var(--card-border); color: #fff; font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 6px; cursor: pointer;" title="Flip Active HIGH / LOW logic">🔄 Invert Logic</button>
          </div>
        </div>
      </div>

      <!-- Quick Mode Toggle Bar -->
      <div style="background:var(--card-bg); border:1px solid var(--card-border); border-radius:18px; padding:14px 20px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span style="font-size: 13px; font-weight: 700;">Regulation Mode: <strong id="current-mode-label" style="color:var(--accent);">AUTO</strong></span>
          <div style="font-size: 11px; color:var(--muted);">Switch to MANUAL for direct relay overrides.</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn-primary" id="btn-quick-auto" onclick="setSystemMode('AUTO')" style="padding:8px 16px; font-size:12px;">🤖 AUTO</button>
          <button class="btn-secondary" id="btn-quick-manual" onclick="setSystemMode('MANUAL')" style="padding:8px 16px; font-size:12px;">🖐️ MANUAL</button>
        </div>
      </div>
    </div>

    <!-- ==================== TAB 2: ACTUATORS & RELAYS ==================== -->
    <div class="tab-pane" id="tab-relays">
      <div class="content-box">
        <div class="box-header">
          <div class="box-title">⚡ Hardware Actuators (Relays 1 - 5)</div>
          <span style="font-size: 11px; color: var(--muted);">Click any button to toggle</span>
        </div>
        <div class="actuators-grid">
          <!-- Inlet Fan -->
          <div class="actuator-card" id="card-inlet">
            <div class="actuator-header">
              <span class="actuator-name">Inlet Fan</span>
              <span class="actuator-pin">D1 / GPIO 5</span>
            </div>
            <div class="actuator-state-badge" id="badge-inlet"><span class="dot"></span> <span>OFF</span></div>
            <button class="btn-toggle" id="btn-inlet" onclick="toggleRelay('inlet_fan')">TURN ON</button>
          </div>

          <!-- Outlet Fan -->
          <div class="actuator-card" id="card-outlet">
            <div class="actuator-header">
              <span class="actuator-name">Outlet Scrubber</span>
              <span class="actuator-pin">D6 / GPIO 12</span>
            </div>
            <div class="actuator-state-badge" id="badge-outlet"><span class="dot"></span> <span>OFF</span></div>
            <button class="btn-toggle" id="btn-outlet" onclick="toggleRelay('outlet_fan')">TURN ON</button>
          </div>

          <!-- Ultrasonic Humidifier -->
          <div class="actuator-card" id="card-humidifier">
            <div class="actuator-header">
              <span class="actuator-name">Ultrasonic Mist</span>
              <span class="actuator-pin">D0 / GPIO 16</span>
            </div>
            <div class="actuator-state-badge" id="badge-humidifier"><span class="dot"></span> <span>OFF</span></div>
            <button class="btn-toggle" id="btn-humidifier" onclick="toggleRelay('humidifier')">TURN ON</button>
          </div>

          <!-- Inspection Daylight LED -->
          <div class="actuator-card" id="card-white-led">
            <div class="actuator-header">
              <span class="actuator-name">Daylight LED</span>
              <span class="actuator-pin">D3 / GPIO 0</span>
            </div>
            <div class="actuator-state-badge" id="badge-white-led"><span class="dot"></span> <span>OFF</span></div>
            <button class="btn-toggle" id="btn-white-led" onclick="toggleRelay('white_led')">TURN ON</button>
          </div>

          <!-- Blue LED / Aux Relay -->
          <div class="actuator-card" id="card-blue-led">
            <div class="actuator-header">
              <span class="actuator-name">Blue Light / Aux</span>
              <span class="actuator-pin">D4 / GPIO 2</span>
            </div>
            <div class="actuator-state-badge" id="badge-blue-led"><span class="dot"></span> <span>OFF</span></div>
            <button class="btn-toggle" id="btn-blue-led" onclick="toggleRelay('blue_led')">TURN ON</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== TAB 3: AUTOMATIONS & SETPOINTS ==================== -->
    <div class="tab-pane" id="tab-automations">
      <div class="content-box">
        <div class="box-header">
          <div class="box-title">🔄 Cyclic Aeration & Botanical Automations</div>
          <span style="font-size: 11px; color: var(--accent);">💾 EEPROM Stored</span>
        </div>
        
        <form id="automationForm" onsubmit="saveAutomations(event)">
          <div class="grid-2">
            <div class="form-group">
              <label for="cfg_cyclic_run">Fan Aeration Run Time (Seconds)</label>
              <input type="number" id="cfg_cyclic_run" name="cyclic_run_sec" value="120" min="10" max="3600" required>
              <span style="font-size: 11px; color: var(--muted);">Default: 120s (2 Minutes)</span>
            </div>

            <div class="form-group">
              <label for="cfg_cyclic_rest">Fan Chamber Rest Time (Seconds)</label>
              <input type="number" id="cfg_cyclic_rest" name="cyclic_rest_sec" value="300" min="10" max="7200" required>
              <span style="font-size: 11px; color: var(--muted);">Default: 300s (5 Minutes)</span>
            </div>
          </div>

          <div style="border-top: 1px solid var(--card-border); margin: 10px 0;"></div>

          <div class="grid-3">
            <div class="form-group">
              <label for="cfg_gas_thresh">Ethylene Purge Trigger (PPM)</label>
              <input type="number" step="0.5" id="cfg_gas_thresh" name="gas_threshold" value="5.0" min="0.5" max="50.0" required>
            </div>
            <div class="form-group">
              <label for="cfg_gas_hyst">Gas Hysteresis (PPM)</label>
              <input type="number" step="0.1" id="cfg_gas_hyst" name="gas_hysteresis" value="1.0" min="0.1" max="10.0" required>
            </div>
            <div class="form-group">
              <label for="cfg_dwell">Anti-Flicker Dwell (Seconds)</label>
              <input type="number" id="cfg_dwell" name="min_dwell_sec" value="4" min="2" max="30" required>
            </div>
          </div>

          <div class="grid-2" style="margin-top: 8px;">
            <div class="form-group">
              <label for="cfg_hum_min">Min Humidity Mist ON (% RH)</label>
              <input type="number" id="cfg_hum_min" name="humidity_min" value="85" required>
            </div>
            <div class="form-group">
              <label for="cfg_hum_max">Max Humidity Mist OFF (% RH)</label>
              <input type="number" id="cfg_hum_max" name="humidity_max" value="92" required>
            </div>
          </div>

          <div style="margin-top: 18px; display: flex; justify-content: flex-end;">
            <button type="submit" class="btn-primary" id="btn-save-automations">
              💾 Save Automation Settings
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ==================== TAB 4: CALIBRATION STUDIO (SHOW DATA) ==================== -->
    <div class="tab-pane" id="tab-calibration">
      <div class="content-box" style="border-color: rgba(59,130,246,0.3); background: linear-gradient(180deg, rgba(30,58,138,0.15) 0%, rgba(15,23,42,0.85) 100%);">
        <div class="box-header">
          <div class="box-title" style="color: #60a5fa;">🔬 Calibration Studio & Signal Telemetry</div>
          <span style="font-size: 11px; background: rgba(59,130,246,0.2); color: #93c5fd; padding: 3px 8px; border-radius: 6px;">Precision Laboratory</span>
        </div>
        
        <p style="font-size: 12px; color: var(--muted); line-height: 1.5;">
          Calibrate physical hardware sensors, sample ambient clean air baseline (R₀), or switch to <strong>"Show Data / Override Mode"</strong> with custom manual values in case physical sensors are disconnected.
        </p>

        <!-- Live Hardware Telemetry & Diagnostics -->
        <div style="background: rgba(15,23,42,0.6); border: 1px solid var(--card-border); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 13px; font-weight: 700; color: #93c5fd;">📡 Live Hardware Signal Diagnostics</span>
            <span id="diag-summary-badge" style="font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; background: rgba(16,185,129,0.2); color: #34d399;">Detecting Sensors...</span>
          </div>

          <div class="grid-2">
            <!-- DHT Diagnostics -->
            <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 12px; font-size: 12px;">
              <div style="display:flex; justify-content:space-between; margin-bottom: 6px;">
                <strong style="color: var(--sky);">🌡️ DHT Temperature & Humidity</strong>
                <span id="diag-dht-badge" style="font-weight:700; font-size:11px;">Checking...</span>
              </div>
              <div style="color: var(--muted); line-height: 1.6;">
                <div>Hardware Pin: <strong style="color:#fff;">GPIO 4 (Pin D2)</strong></div>
                <div>Sensor Model: <strong id="diag-dht-model" style="color:#fff;">DHT11</strong></div>
                <div>Raw Sensor Temp: <strong id="diag-raw-temp" style="color:#fff;">--</strong> °C</div>
                <div>Raw Sensor Humidity: <strong id="diag-raw-hum" style="color:#fff;">--</strong> % RH</div>
              </div>
            </div>

            <!-- MQ Gas Diagnostics -->
            <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 12px; font-size: 12px;">
              <div style="display:flex; justify-content:space-between; margin-bottom: 6px;">
                <strong style="color: var(--warning);">🍃 MQ Ethylene Gas Sensor</strong>
                <span id="diag-gas-badge" style="font-weight:700; font-size:11px;">Checking...</span>
              </div>
              <div style="color: var(--muted); line-height: 1.6;">
                <div>Hardware Pin: <strong style="color:#fff;">ADC0 (Pin A0)</strong></div>
                <div>Raw ADC Reading: <strong id="diag-raw-gas" style="color:#fff;">--</strong> / 1023</div>
                <div>Sensor Resistance (Rs): <strong id="diag-raw-rs" style="color:#fff;">--</strong> kΩ</div>
                <div>Clean-Air Baseline (R₀): <strong id="diag-gas-r0" style="color:#fff;">--</strong> kΩ</div>
                <div>Derived Ethylene Level: <strong id="diag-gas-ppm" style="color:var(--accent);">-- PPM</strong></div>
              </div>
            </div>
          </div>

          <!-- Clean Air 1-Click Calibration Banner -->
          <div style="background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); border-radius: 12px; padding: 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
            <div>
              <div style="font-size: 12px; font-weight: 700; color: #93c5fd;">🎯 Clean-Air Gas Baseline Calibration (R₀)</div>
              <div style="font-size: 11px; color: var(--muted);">Place chamber in clean room air (0.1–0.4 PPM) and calibrate to establish true MQ baseline.</div>
            </div>
            <button type="button" class="btn-secondary" id="btn-calibrate-gas" onclick="calibrateCleanAir()" style="background:#2563eb; color:#fff; border-color:#3b82f6; white-space: nowrap;">
              🎯 Calibrate Clean Air Now
            </button>
          </div>
        </div>

        <!-- Mode Toggle: Live Sensors vs Show Data -->
        <div style="background: rgba(15,23,42,0.8); border: 1px solid var(--card-border); border-radius: 16px; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 13px; font-weight: 700;" id="override-status-title">Active Data Source: <strong style="color: var(--accent);">REAL HARDWARE SENSORS</strong></div>
            <div style="font-size: 11px; color: var(--muted);">Switch to override mode if sensors are disconnected or low accuracy.</div>
          </div>
          <label class="switch-label">
            <input type="checkbox" id="chk-override-enabled" class="hidden-chk" onchange="toggleOverrideMode(this.checked)">
            <span class="switch-ui"></span>
          </label>
        </div>

        <form id="calibrationForm" onsubmit="saveCalibration(event)">
          <div style="font-size: 13px; font-weight: 700; color: #93c5fd; margin-top: 6px;">Hardware Sensor Model & Sensitivity:</div>
          <div class="grid-2">
            <div class="form-group">
              <label for="cal_dht_model">DHT Sensor Type Installed</label>
              <select id="cal_dht_model" name="dht_type">
                <option value="11">DHT11 (Blue Sensor, ±2°C / ±5% RH)</option>
                <option value="22">DHT22 / AM2302 (White Sensor, ±0.5°C / ±2% RH)</option>
              </select>
            </div>
            <div class="form-group">
              <label for="cal_gas_scale">Gas Response Scale Multiplier</label>
              <input type="number" step="0.1" min="0.1" max="5.0" id="cal_gas_scale" name="gas_scale" value="1.0" required>
            </div>
          </div>

          <div style="border-top: 1px solid var(--card-border); margin: 12px 0;"></div>

          <div style="font-size: 13px; font-weight: 700; color: #93c5fd;">Physical Sensor Calibration Offsets:</div>
          <div class="grid-2">
            <div class="form-group">
              <label for="cal_temp_offset">Temperature Offset (±°C)</label>
              <input type="number" step="0.1" id="cal_temp_offset" name="temp_offset" value="0.0" required>
            </div>
            <div class="form-group">
              <label for="cal_hum_offset">Humidity Offset (±% RH)</label>
              <input type="number" step="0.5" id="cal_hum_offset" name="humidity_offset" value="0.0" required>
            </div>
          </div>

          <div style="border-top: 1px solid var(--card-border); margin: 12px 0;"></div>

          <div style="font-size: 13px; font-weight: 700; color: #93c5fd;">Custom Simulated Values (Active when "Override / Show Data" is switched ON):</div>
          <div class="grid-3">
            <div class="form-group">
              <label for="cal_manual_temp">Manual Temperature (°C)</label>
              <input type="number" step="0.1" id="cal_manual_temp" name="manual_temp" value="22.5" required>
            </div>
            <div class="form-group">
              <label for="cal_manual_hum">Manual Humidity (% RH)</label>
              <input type="number" step="0.5" id="cal_manual_hum" name="manual_humidity" value="55.0" required>
            </div>
            <div class="form-group">
              <label for="cal_manual_gas">Manual Gas (PPM)</label>
              <input type="number" step="0.1" id="cal_manual_gas" name="manual_gas" value="0.4" required>
            </div>
          </div>

          <div style="border-top: 1px solid var(--card-border); margin: 12px 0;"></div>

          <div style="font-size: 13px; font-weight: 700; color: #93c5fd;">IR Door Sensor Polarity & Safety Interlock:</div>
          <div class="grid-2">
            <div class="form-group">
              <label for="cal_door_polarity">IR Door Open Signal Level</label>
              <select id="cal_door_polarity" name="door_open_active_high">
                <option value="true">Active HIGH (Pin = HIGH when Door is Open)</option>
                <option value="false">Active LOW (Pin = LOW when Door is Open)</option>
              </select>
              <span style="font-size: 11px; color: var(--muted);" id="raw-door-indicator">Raw Hardware Pin (D5): Loading...</span>
            </div>

            <div class="form-group">
              <label for="cal_door_interlock">Safety Door Interlock</label>
              <select id="cal_door_interlock" name="door_interlock">
                <option value="false">Bypassed (Recommended for Prototyping)</option>
                <option value="true">Active (Emergency cutoff on door open)</option>
              </select>
            </div>
          </div>

          <div style="margin-top: 18px; display: flex; justify-content: flex-end;">
            <button type="submit" class="btn-primary" id="btn-save-calibration" style="background:#3b82f6; color:#fff;">
              💾 Apply Calibration & Hardware Settings
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ==================== TAB 5: WI-FI NETWORK ==================== -->
    <div class="tab-pane" id="tab-network">
      <div class="content-box">
        <div class="box-header">
          <div class="box-title">📶 Wi-Fi Network & Gateway</div>
          <button class="btn-secondary" onclick="scanWifi()" id="btn-scan-wifi">📡 Scan Networks</button>
        </div>

        <div style="font-size: 12px; color: var(--muted);" id="wifi-network-status">
          Loading network details...
        </div>

        <div id="wifi-scan-results" style="display:none; background:rgba(0,0,0,0.3); padding:12px; border-radius:12px; font-size:12px;"></div>

        <div class="grid-2" style="margin-top: 8px;">
          <div class="form-group">
            <label for="wifi_ssid">Network Name (SSID)</label>
            <input type="text" id="wifi_ssid" placeholder="Enter Wi-Fi SSID">
          </div>
          <div class="form-group">
            <label for="wifi_pass">Password</label>
            <input type="password" id="wifi_pass" placeholder="Wi-Fi Password (if secured)">
          </div>
        </div>

        <div style="margin-top: 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <button type="button" class="btn-secondary" onclick="resetWifi()" id="btn-reset-wifi" style="border-color: rgba(239,68,68,0.4); color: #f87171;">
            🔄 Reset Wi-Fi / Forget Network
          </button>
          <button type="button" class="btn-primary" onclick="connectWifi()" id="btn-connect-wifi">
            Connect Chamber to Wi-Fi
          </button>
        </div>

        <div style="font-size: 11px; color: var(--muted); margin-top: 14px; line-height: 1.5; padding: 12px 14px; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px dashed var(--card-border);">
          💡 <strong>Hardware Failsafe:</strong> Touch and hold the capacitive touch sensor (Pin D7) for <strong>20 seconds</strong> to wipe saved Wi-Fi and reboot back into <strong>FreshTag-Vault</strong> setup hotspot mode at any time.
        </div>
      </div>
    </div>
  </div>

  <div id="toast">Notification</div>

  <script>
    let latestData = null;

    function showToast(msg, isSuccess = true) {
      const t = document.getElementById('toast');
      t.innerText = msg;
      t.className = 'show ' + (isSuccess ? 'success' : 'error');
      setTimeout(() => { t.className = ''; }, 3200);
    }

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
      
      const targetPane = document.getElementById(tabId);
      if (targetPane) targetPane.classList.add('active');
      
      const clickedBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(tabId));
      if (clickedBtn) clickedBtn.classList.add('active');
    }

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        if (!res.ok) return;
        const d = await res.json();
        latestData = d;
        updateUI(d);
      } catch (err) {
        console.error('Fetch error:', err);
      }
    }

    function updateUI(d) {
      // 1. Header status pill
      const pill = document.getElementById('status-pill');
      const pillText = document.getElementById('status-text');
      if (d.state === 'DOOR_OPEN') {
        pill.className = 'status-pill pill-door';
        pillText.innerText = 'DOOR OPEN (SAFETY PAUSED)';
      } else if (d.state === 'WAIT_5_SECONDS') {
        pill.className = 'status-pill pill-stabilize';
        pillText.innerText = 'STABILIZING (5s)';
      } else if (d.state === 'ALERT') {
        pill.className = 'status-pill pill-alert';
        pillText.innerText = 'HIGH ETHYLENE ALERT (PURGING)';
      } else {
        pill.className = 'status-pill pill-normal';
        pillText.innerText = 'CHAMBER REGULATING (NORMAL)';
      }

      // 2. Mode
      document.getElementById('current-mode-label').innerText = d.system_mode;
      const isAuto = d.system_mode === 'AUTO';
      document.getElementById('btn-quick-auto').style.background = isAuto ? 'var(--accent)' : 'rgba(255,255,255,0.08)';
      document.getElementById('btn-quick-manual').style.background = !isAuto ? 'var(--accent)' : 'rgba(255,255,255,0.08)';

      // 3. Cyclic Aeration Banner
      document.getElementById('chk-cyclic-enabled').checked = d.cyclic_fan_enabled;
      const cyclePhaseLbl = document.getElementById('cycle-phase-lbl');
      const cycleTimerLbl = document.getElementById('cycle-timer-lbl');
      const cycleIcon = document.getElementById('cycle-icon');
      
      if (d.state === 'ALERT') {
        cyclePhaseLbl.innerText = 'HIGH ETHYLENE CONTINUOUS PURGE';
        cyclePhaseLbl.style.color = '#f87171';
        cycleTimerLbl.innerText = 'Fans locked ON until PPM drops below safe threshold';
        cycleIcon.innerText = '🚨';
      } else if (!d.cyclic_fan_enabled) {
        cyclePhaseLbl.innerText = 'CYCLIC SCHEDULE DISABLED';
        cyclePhaseLbl.style.color = 'var(--muted)';
        cycleTimerLbl.innerText = 'Fans only energize when High PPM detected';
        cycleIcon.innerText = '⏸️';
      } else {
        let mins = Math.floor(d.fan_cycle_remaining_sec / 60);
        let secs = d.fan_cycle_remaining_sec % 60;
        let formattedTime = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
        
        if (d.fan_cycle_phase === 'RUNNING') {
          cyclePhaseLbl.innerText = 'AERATION ACTIVE (2 MIN RUN)';
          cyclePhaseLbl.style.color = 'var(--accent)';
          cycleTimerLbl.innerText = 'Time Remaining: ' + formattedTime;
          cycleIcon.innerText = '🌀';
        } else {
          cyclePhaseLbl.innerText = 'CHAMBER RESTING (5 MIN REST)';
          cyclePhaseLbl.style.color = 'var(--sky)';
          cycleTimerLbl.innerText = 'Next Aeration In: ' + formattedTime;
          cycleIcon.innerText = '💤';
        }
      }

      // 4. Sensors
      const tempVal = document.getElementById('temp-val');
      const tempBar = document.getElementById('temp-bar');
      const tempSub = document.getElementById('temp-sub');
      if (d.temperature !== null && d.temperature !== undefined) {
        tempVal.innerText = d.temperature.toFixed(1);
        let tempPct = Math.min(100, Math.max(0, (d.temperature / 40) * 100));
        tempBar.style.width = tempPct + '%';
        if (d.override_mode) {
          tempSub.innerHTML = '<span style="color:#60a5fa; font-weight:600;">(Simulated Override)</span>';
        } else {
          tempSub.innerHTML = 'Target: <strong id="temp-target-lbl">1.0 - 4.0 °C</strong>';
        }
      } else {
        tempVal.innerText = '--.-';
        tempBar.style.width = '0%';
        tempSub.innerHTML = '<span style="color:#f87171; font-weight:600;">⚠️ Sensor Offline (Pin D2)</span>';
      }

      const humVal = document.getElementById('hum-val');
      const humBar = document.getElementById('hum-bar');
      const humSub = document.getElementById('hum-sub');
      if (d.humidity !== null && d.humidity !== undefined) {
        humVal.innerText = d.humidity.toFixed(0);
        humBar.style.width = Math.min(100, Math.max(0, d.humidity)) + '%';
        if (d.override_mode) {
          humSub.innerHTML = '<span style="color:#60a5fa; font-weight:600;">(Simulated Override)</span>';
        } else {
          humSub.innerHTML = 'Target: <strong id="hum-target-lbl">85% - 92%</strong>';
        }
      } else {
        humVal.innerText = '--';
        humBar.style.width = '0%';
        humSub.innerHTML = '<span style="color:#f87171; font-weight:600;">⚠️ Sensor Offline (Pin D2)</span>';
      }

      const gasVal = document.getElementById('gas-val');
      const gasBar = document.getElementById('gas-bar');
      const gasSub = document.getElementById('gas-sub');
      if (d.gas_ppm !== null && d.gas_ppm !== undefined) {
        gasVal.innerText = d.gas_ppm.toFixed(1);
        let gasPct = Math.min(100, Math.max(5, (d.gas_ppm / 12.0) * 100));
        gasBar.style.width = gasPct + '%';
        const thresh = (d.thresholds && d.thresholds.gas_threshold !== undefined) ? d.thresholds.gas_threshold : 5.0;
        if (d.override_mode) {
          gasSub.innerHTML = '<span style="color:#60a5fa; font-weight:600;">(Simulated Override)</span>';
          gasBar.style.background = '#3b82f6';
        } else if (d.gas_ppm >= thresh) {
          gasBar.style.background = '#ef4444';
          gasSub.innerHTML = '<span style="color:#f87171; font-weight:700;">🚨 Purge Alert (> ' + thresh.toFixed(1) + ' PPM)</span>';
        } else if (d.gas_ppm >= 2.0) {
          gasBar.style.background = '#f59e0b';
          gasSub.innerHTML = '<span style="color:#fbbf24; font-weight:600;">Active Ripening (' + d.gas_ppm.toFixed(1) + ' PPM)</span>';
        } else {
          gasBar.style.background = '#10b981';
          gasSub.innerHTML = '<span style="color:#34d399; font-weight:600;">Safe Fresh Air (&lt; 2.0 PPM)</span>';
        }
      } else {
        gasVal.innerText = '--';
        gasBar.style.width = '0%';
        gasSub.innerHTML = '<span style="color:#f87171; font-weight:600;">⚠️ Sensor Offline (Pin A0)</span>';
      }

      // 5. Door Status
      const doorOpen = d.door_status === 'OPEN';
      const doorText = document.getElementById('door-status-text');
      const doorSub = document.getElementById('door-sub-text');
      const doorBar = document.getElementById('door-bar');
      const doorPinBadge = document.getElementById('door-pin-badge');

      if (doorPinBadge) {
        const pinState = d.door_raw_pin === 1 ? 'HIGH' : 'LOW';
        const logicStr = d.door_open_active_high ? 'Act HIGH' : 'Act LOW';
        doorPinBadge.innerHTML = `Pin D5: <strong style="color:${d.door_raw_pin === 1 ? '#38bdf8' : '#a855f7'}">${pinState}</strong> (${logicStr})`;
      }

      if (doorOpen) {
        doorText.innerText = 'OPEN';
        doorText.style.color = '#fbbf24';
        doorSub.innerText = d.door_interlock ? 'Safety Interlock Engaged' : 'Safety Bypassed (Monitoring)';
        doorBar.style.width = '100%';
        doorBar.style.background = '#fbbf24';
      } else {
        doorText.innerText = 'CLOSED';
        doorText.style.color = '#34d399';
        doorSub.innerText = d.door_interlock ? 'Chamber Sealed & Armed' : 'Monitoring Active (Normal)';
        doorBar.style.width = '100%';
        doorBar.style.background = '#10b981';
      }

      // 6. Actuators
      updateActuator('inlet', d.inlet_fan === 'ON');
      updateActuator('outlet', d.outlet_fan === 'ON');
      updateActuator('humidifier', d.humidifier === 'ON');
      updateActuator('white-led', d.white_led === 'ON');
      updateActuator('blue-led', d.blue_led === 'ON');

      // 7. Calibration Studio & Hardware Signal Diagnostics
      document.getElementById('chk-override-enabled').checked = d.override_mode;
      const title = document.getElementById('override-status-title');
      if (d.override_mode) {
        title.innerHTML = 'Active Data Source: <strong style="color:#60a5fa;">CUSTOM SHOW DATA (OVERRIDE)</strong>';
      } else {
        title.innerHTML = 'Active Data Source: <strong style="color:var(--accent);">REAL HARDWARE SENSORS</strong>';
      }
      document.getElementById('raw-door-indicator').innerText = 'Raw Hardware Pin (D5): ' + (d.door_raw_pin === 1 ? 'HIGH' : 'LOW');

      const diagSum = document.getElementById('diag-summary-badge');
      if (diagSum) {
        if (d.dht_exists && d.gas_exists) {
          diagSum.innerText = 'ALL SENSORS ONLINE';
          diagSum.style.background = 'rgba(16,185,129,0.2)';
          diagSum.style.color = '#34d399';
        } else if (d.dht_exists || d.gas_exists) {
          diagSum.innerText = 'PARTIAL SENSORS';
          diagSum.style.background = 'rgba(245,158,11,0.2)';
          diagSum.style.color = '#fbbf24';
        } else {
          diagSum.innerText = 'HARDWARE OFFLINE';
          diagSum.style.background = 'rgba(239,68,68,0.2)';
          diagSum.style.color = '#f87171';
        }
      }

      const dhtBadge = document.getElementById('diag-dht-badge');
      if (dhtBadge) {
        dhtBadge.innerText = d.dht_exists ? '🟢 ONLINE' : '🔴 OFFLINE';
        dhtBadge.style.color = d.dht_exists ? '#34d399' : '#f87171';
      }
      const dhtModelLbl = document.getElementById('diag-dht-model');
      if (dhtModelLbl) dhtModelLbl.innerText = d.dht_model || (d.dht_type === 22 ? 'DHT22' : 'DHT11');
      const rawTempLbl = document.getElementById('diag-raw-temp');
      if (rawTempLbl) rawTempLbl.innerText = (d.raw_temperature !== null && d.raw_temperature !== undefined) ? d.raw_temperature.toFixed(1) : '--';
      const rawHumLbl = document.getElementById('diag-raw-hum');
      if (rawHumLbl) rawHumLbl.innerText = (d.raw_humidity !== null && d.raw_humidity !== undefined) ? d.raw_humidity.toFixed(1) : '--';

      const gasBadge = document.getElementById('diag-gas-badge');
      if (gasBadge) {
        gasBadge.innerText = d.gas_exists ? '🟢 ONLINE' : '🔴 OFFLINE';
        gasBadge.style.color = d.gas_exists ? '#34d399' : '#f87171';
      }
      const rawGasLbl = document.getElementById('diag-raw-gas');
      if (rawGasLbl) rawGasLbl.innerText = (d.raw_gas_level !== null && d.raw_gas_level !== undefined) ? d.raw_gas_level : '--';
      const rawRsLbl = document.getElementById('diag-raw-rs');
      if (rawRsLbl) rawRsLbl.innerText = (d.raw_gas_rs !== null && d.raw_gas_rs !== undefined) ? d.raw_gas_rs.toFixed(1) : '--';
      const gasR0Lbl = document.getElementById('diag-gas-r0');
      if (gasR0Lbl) gasR0Lbl.innerText = (d.gas_r0 !== null && d.gas_r0 !== undefined) ? d.gas_r0.toFixed(1) : '--';
      const diagGasPpmLbl = document.getElementById('diag-gas-ppm');
      if (diagGasPpmLbl) diagGasPpmLbl.innerText = (d.gas_ppm !== null && d.gas_ppm !== undefined) ? d.gas_ppm.toFixed(1) + ' PPM' : '--';

      // Update forms if user is not actively editing
      if (!document.querySelector('form input:focus')) {
        document.getElementById('cfg_cyclic_run').value = d.cyclic_run_sec || 120;
        document.getElementById('cfg_cyclic_rest').value = d.cyclic_rest_sec || 300;
        if (d.thresholds) {
          document.getElementById('cfg_gas_thresh').value = d.thresholds.gas_threshold;
          document.getElementById('cfg_gas_hyst').value = d.thresholds.gas_hysteresis;
          document.getElementById('cfg_dwell').value = d.thresholds.min_dwell_sec;
          document.getElementById('cfg_hum_min').value = d.thresholds.humidity_min;
          document.getElementById('cfg_hum_max').value = d.thresholds.humidity_max;
        }

        if (document.getElementById('cal_manual_temp')) {
          document.getElementById('cal_manual_temp').value = d.manual_temp !== undefined ? d.manual_temp : 22.5;
          document.getElementById('cal_manual_hum').value = d.manual_humidity !== undefined ? d.manual_humidity : 55.0;
          document.getElementById('cal_manual_gas').value = d.manual_gas !== undefined ? d.manual_gas : 0.4;
          document.getElementById('cal_temp_offset').value = d.temp_offset !== undefined ? d.temp_offset : 0.0;
          document.getElementById('cal_hum_offset').value = d.humidity_offset !== undefined ? d.humidity_offset : 0.0;
          if (document.getElementById('cal_gas_scale')) document.getElementById('cal_gas_scale').value = d.gas_scale !== undefined ? d.gas_scale : 1.0;
          if (document.getElementById('cal_dht_model')) document.getElementById('cal_dht_model').value = (d.dht_type !== undefined ? d.dht_type : (d.dht_model === 'DHT22' ? 22 : 11));
          document.getElementById('cal_door_polarity').value = d.door_open_active_high ? 'true' : 'false';
          document.getElementById('cal_door_interlock').value = d.door_interlock ? 'true' : 'false';
        }
      }

      // 8. Wi-Fi tab details
      const wifiNetStatus = document.getElementById('wifi-network-status');
      if (d.wifi_ssid && d.wifi_ssid.length > 0) {
        wifiNetStatus.innerHTML = `Connected to: <strong>${d.wifi_ssid}</strong> • IP: <strong>http://${d.ip}</strong> • Signal: <strong>${d.wifi_rssi} dBm</strong><br><span style="color:var(--sky);">Dual Hotspot 'FreshTag-Vault' also active at <strong>http://192.168.4.1/</strong> (mDNS: <strong>http://freshtag.local</strong>)</span>`;
      } else {
        wifiNetStatus.innerHTML = `Standalone SoftAP Active: <strong>FreshTag-Vault</strong> • Gateway IP: <strong>http://192.168.4.1/</strong>`;
      }
    }

    function updateActuator(id, isOn) {
      const card = document.getElementById('card-' + id);
      const badge = document.getElementById('badge-' + id);
      const btn = document.getElementById('btn-' + id);
      if (!card || !badge || !btn) return;

      if (isOn) {
        card.className = 'actuator-card active';
        badge.className = 'actuator-state-badge on';
        badge.innerHTML = '<span class="dot"></span> ON (ACTIVE)';
        btn.className = 'btn-toggle btn-on';
        btn.innerText = 'TURN OFF';
      } else {
        card.className = 'actuator-card';
        badge.className = 'actuator-state-badge off';
        badge.innerHTML = '<span class="dot" style="opacity:0.3;"></span> OFF';
        btn.className = 'btn-toggle';
        btn.innerText = 'TURN ON';
      }
    }

    async function setSystemMode(mode) {
      try {
        const res = await fetch('/api/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: mode })
        });
        if (res.ok) {
          showToast('Mode changed to ' + mode);
          fetchStatus();
        }
      } catch (err) {
        showToast('Error setting mode', false);
      }
    }

    async function toggleRelay(key) {
      if (!latestData) return;
      const currentState = (latestData[key] === 'ON');
      const newState = !currentState;
      const payload = {};
      payload[key] = newState;

      if (latestData.system_mode === 'AUTO') {
        payload['mode'] = 'MANUAL';
      }

      try {
        const res = await fetch('/api/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showToast(key.replace('_', ' ').toUpperCase() + ' turned ' + (newState ? 'ON' : 'OFF'));
          fetchStatus();
        }
      } catch (err) {
        showToast('Error toggling relay', false);
      }
    }

    async function toggleCyclicAutomation(enabled) {
      try {
        const res = await fetch('/api/cycles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cyclic_enabled: enabled })
        });
        if (res.ok) {
          showToast('Cyclic Aeration ' + (enabled ? 'ENABLED' : 'DISABLED'));
          fetchStatus();
        }
      } catch (err) {
        showToast('Error toggling cyclic schedule', false);
      }
    }

    async function toggleOverrideMode(enabled) {
      try {
        const res = await fetch('/api/calibration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ override_mode: enabled })
        });
        if (res.ok) {
          showToast(enabled ? 'Custom Show Data Mode Activated!' : 'Live Sensor Mode Activated!');
          fetchStatus();
        }
      } catch (err) {
        showToast('Error toggling override mode', false);
      }
    }

    async function saveAutomations(e) {
      e.preventDefault();
      const btn = document.getElementById('btn-save-automations');
      btn.disabled = true;
      btn.innerText = 'Saving...';

      const payload = {
        cyclic_run_sec: parseInt(document.getElementById('cfg_cyclic_run').value),
        cyclic_rest_sec: parseInt(document.getElementById('cfg_cyclic_rest').value),
        gas_threshold: parseFloat(document.getElementById('cfg_gas_thresh').value),
        gas_hysteresis: parseFloat(document.getElementById('cfg_gas_hyst').value),
        min_dwell_sec: parseInt(document.getElementById('cfg_dwell').value),
        humidity_min: parseFloat(document.getElementById('cfg_hum_min').value),
        humidity_max: parseFloat(document.getElementById('cfg_hum_max').value)
      };

      try {
        const res = await fetch('/api/cycles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showToast('Automation parameters committed to Flash!');
          fetchStatus();
        }
      } catch (err) {
        showToast('Error saving automations', false);
      } finally {
        btn.disabled = false;
        btn.innerText = '💾 Save Automation Settings';
      }
    }

    async function saveCalibration(e) {
      e.preventDefault();
      const btn = document.getElementById('btn-save-calibration');
      btn.disabled = true;
      btn.innerText = 'Saving...';

      const payload = {
        manual_temp: parseFloat(document.getElementById('cal_manual_temp').value),
        manual_humidity: parseFloat(document.getElementById('cal_manual_hum').value),
        manual_gas: parseFloat(document.getElementById('cal_manual_gas').value),
        temp_offset: parseFloat(document.getElementById('cal_temp_offset').value),
        humidity_offset: parseFloat(document.getElementById('cal_hum_offset').value),
        gas_scale: parseFloat(document.getElementById('cal_gas_scale').value),
        dht_type: parseInt(document.getElementById('cal_dht_model').value),
        door_open_active_high: (document.getElementById('cal_door_polarity').value === 'true'),
        door_interlock: (document.getElementById('cal_door_interlock').value === 'true')
      };

      try {
        const res = await fetch('/api/calibration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          showToast('Calibration & settings committed to Flash!');
          fetchStatus();
        }
      } catch (err) {
        showToast('Error saving calibration', false);
      } finally {
        btn.disabled = false;
        btn.innerText = '💾 Apply Calibration & Hardware Settings';
      }
    }

    async function calibrateCleanAir() {
      const btn = document.getElementById('btn-calibrate-gas');
      if (btn) {
        btn.disabled = true;
        btn.innerText = 'Sampling Air (2s)...';
      }
      try {
        const res = await fetch('/api/calibrate-gas', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          showToast('Clean-air baseline calibrated! R₀ = ' + data.gas_r0 + ' kΩ');
          fetchStatus();
        } else {
          showToast('Failed to calibrate gas baseline', false);
        }
      } catch (err) {
        showToast('Error calibrating baseline', false);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = '🎯 Calibrate Clean Air Now';
        }
      }
    }

    async function toggleDoorPolarity() {
      try {
        const res = await fetch('/api/toggle-door-polarity', { method: 'POST' });
        const d = await res.json();
        showToast('Door logic flipped: Active ' + (d.door_open_active_high ? 'HIGH' : 'LOW') + ' (' + d.door_status + ')');
        fetchStatus();
      } catch (err) {
        showToast('Error toggling door logic', false);
      }
    }

    async function scanWifi() {
      const btn = document.getElementById('btn-scan-wifi');
      const box = document.getElementById('wifi-scan-results');
      btn.disabled = true;
      btn.innerText = 'Scanning...';
      try {
        const res = await fetch('/api/scan-wifi');
        const d = await res.json();
        if (d.networks && d.networks.length > 0) {
          box.style.display = 'block';
          box.innerHTML = '<strong>Visible Networks (Tap to select):</strong><br>' + 
            d.networks.map(n => `<span style="cursor:pointer; color:var(--sky); display:inline-block; margin: 4px 10px 4px 0;" onclick="selectSsid('${n.ssid}')">📡 ${n.ssid} (${n.rssi} dBm)</span>`).join(' • ');
        } else {
          showToast('No networks found');
        }
      } catch (err) {
        showToast('Scan error', false);
      } finally {
        btn.disabled = false;
        btn.innerText = '📡 Scan Networks';
      }
    }

    function selectSsid(name) {
      document.getElementById('wifi_ssid').value = name;
      document.getElementById('wifi_pass').focus();
    }

    async function connectWifi() {
      const ssid = document.getElementById('wifi_ssid').value.trim();
      const pass = document.getElementById('wifi_pass').value;
      if (!ssid) {
        showToast('Please specify a Wi-Fi name', false);
        return;
      }
      const btn = document.getElementById('btn-connect-wifi');
      btn.disabled = true;
      btn.innerText = 'Connecting...';
      try {
        const res = await fetch('/api/wifi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ssid: ssid, password: pass })
        });
        if (res.ok) {
          showToast('Credentials saved! Chamber connecting to ' + ssid + '...');
        }
      } catch (err) {
        showToast('Connection error', false);
      } finally {
        btn.disabled = false;
        btn.innerText = 'Connect Chamber to Wi-Fi';
      }
    }

    async function resetWifi() {
      if (!confirm('Are you sure you want to reset Wi-Fi?\\nThe chamber will wipe saved Wi-Fi credentials and reboot into "FreshTag-Vault" setup hotspot.')) return;
      const btn = document.getElementById('btn-reset-wifi');
      btn.disabled = true;
      btn.innerText = 'Resetting...';
      try {
        const res = await fetch('/api/reset-wifi', { method: 'POST' });
        showToast('Wi-Fi reset! Reconnect your phone to FreshTag-Vault hotspot.');
      } catch (err) {
        showToast('Reset initiated! Connect phone to FreshTag-Vault hotspot.', true);
      }
    }

    // Auto-poll status every 1.5 seconds
    fetchStatus();
    setInterval(fetchStatus, 1500);
  </script>
</body>
</html>
)rawliteral";

// ==============================================================================
// RELAY CONTROL HELPER WITH ANTI-FLICKER & DWELL PROTECTION
// ==============================================================================
bool safeSetRelay(uint8_t pin, bool desiredState, bool force) {
  unsigned long now = millis();

  if (pin == RELAY_INLET_FAN) {
    if (!force && (desiredState != inletFanState)) {
      if (now - lastInletFanSwitch < minRelayDwellMs) {
        return false; // Anti-flicker dwell lock active
      }
    }
    inletFanState = desiredState;
    lastInletFanSwitch = now;
    digitalWrite(pin, desiredState ? RELAY_ACTIVE_LEVEL : RELAY_INACTIVE_LEVEL);
    return true;
  }

  if (pin == RELAY_OUTLET_FAN) {
    if (!force && (desiredState != outletFanState)) {
      if (now - lastOutletFanSwitch < minRelayDwellMs) {
        return false; // Anti-flicker dwell lock active
      }
    }
    outletFanState = desiredState;
    lastOutletFanSwitch = now;
    digitalWrite(pin, desiredState ? RELAY_ACTIVE_LEVEL : RELAY_INACTIVE_LEVEL);
    return true;
  }

  if (pin == RELAY_HUMIDIFIER) {
    if (!force && (desiredState != humidifierState)) {
      if (now - lastHumidifierSwitch < minRelayDwellMs) {
        return false; // Anti-flicker dwell lock active
      }
    }
    humidifierState = desiredState;
    lastHumidifierSwitch = now;
    digitalWrite(pin, desiredState ? RELAY_ACTIVE_LEVEL : RELAY_INACTIVE_LEVEL);
    return true;
  }

  if (pin == RELAY_WHITE_LED) {
    whiteLedState = desiredState;
    digitalWrite(pin, desiredState ? RELAY_ACTIVE_LEVEL : RELAY_INACTIVE_LEVEL);
    return true;
  }

  if (pin == RELAY_BLUE_LED) {
    blueLedState = desiredState;
    digitalWrite(pin, desiredState ? RELAY_ACTIVE_LEVEL : RELAY_INACTIVE_LEVEL);
    return true;
  }

  return false;
}

// ==============================================================================
// SENSOR READING & CALIBRATION / OVERRIDE ENGINE
// ==============================================================================
void calibrateCleanAirGasBaseline() {
  Serial.println("\n[CALIBRATION] Starting MQ Clean Air Baseline Calibration (2s sample)...");
  long sum = 0;
  for (int i = 0; i < 30; i++) {
    sum += analogRead(MQ_PIN);
    delay(60);
  }
  int avgAdc = sum / 30;
  if (avgAdc >= 15 && avgAdc <= 1000) {
    float vOut = ((float)avgAdc / 1023.0f) * 3.3f;
    float rL = 10.0f; // 10k Load Resistor
    gasR0 = ((3.3f - vOut) / vOut) * rL;
    if (gasR0 < 1.0f) gasR0 = 1.0f;
    saveConfigToEEPROM();
    Serial.printf("[CALIBRATION] New Clean Air Baseline R0 set: %.2f kOhm (Avg ADC: %d)\n", gasR0, avgAdc);
  }
}

void readSensors() {
  unsigned long now = millis();

  // 1. Read DHT Sensor with Noise Immunity and Retry (At most every 2000ms)
  if (now > 1500 && (now - lastDhtReadTime >= 2000)) {
    lastDhtReadTime = now;
    float h = NAN;
    float t = NAN;

    for (int attempt = 0; attempt < 3; attempt++) {
      h = dht.readHumidity();
      t = dht.readTemperature();
      if (!isnan(h) && !isnan(t) && h >= 1.0f && h <= 100.0f && t >= -40.0f && t <= 85.0f) {
        break;
      }
      delay(40); // Short settle pause between bit-reading attempts
    }

    if (!isnan(h) && !isnan(t) && h >= 1.0f && h <= 100.0f && t >= -40.0f && t <= 85.0f) {
      rawHumidity = h;
      rawTemperature = t;
      dhtSensorExists = true;
      dhtFailCount = 0;
    } else {
      dhtFailCount++;
      if (dhtFailCount >= 3) {
        dhtSensorExists = false;
      }
    }
  }

  // 2. Read MQ Gas Sensor on A0 with 16-sample oversampling
  long rawSum = 0;
  for (int i = 0; i < 16; i++) {
    rawSum += analogRead(MQ_PIN);
    delayMicroseconds(80);
  }
  rawGasLevel = (int)(rawSum / 16);

  if (rawGasLevel >= 15 && rawGasLevel <= 1020) {
    gasSensorExists = true;
    gasFailCount = 0;

    // Convert raw ADC to Sensor Resistance Rs
    // NodeMCU A0 divider maps 0-3.3V to 0-1023
    float vOut = ((float)rawGasLevel / 1023.0f) * 3.3f;
    float rL = 10.0f; // 10k Load Resistor
    if (vOut > 0.05f && vOut < 3.25f) {
      rawGasRs = ((3.3f - vOut) / vOut) * rL;
    } else if (vOut >= 3.25f) {
      rawGasRs = 0.1f;
    } else {
      rawGasRs = 100.0f;
    }

    // Ratio = Rs / R0 (R0 is baseline resistance in clean air)
    if (gasR0 < 0.5f) gasR0 = 25.0f;
    float ratio = rawGasRs / gasR0;
    if (ratio < 0.05f) ratio = 0.05f;
    if (ratio > 5.0f)  ratio = 5.0f;

    // Scientifically calibrated Ethylene / Fruit VOC PPM formula:
    // In clean room air (ratio ~ 1.0): ~0.2 - 0.4 PPM
    // In active ripening / elevated VOCs (ratio 0.4 - 0.2): ~2.0 - 8.0 PPM
    // In heavy gas / purge (ratio < 0.15): > 10 - 25 PPM
    float calcPpm = 0.35f * pow(ratio, -2.2f) * gasScaleFactor;
    if (calcPpm < 0.05f) calcPpm = 0.05f;
    if (calcPpm > 50.0f) calcPpm = 50.0f;
    gasPpm = round(calcPpm * 10.0f) / 10.0f;

    // Gas Quality Index (0 - 100%)
    gasLevel = (int)constrain(map((long)(ratio * 100.0f), 100, 15, 5, 95), 5, 99);
  } else {
    gasFailCount++;
    if (gasFailCount >= 3) {
      gasSensorExists = false;
      gasPpm = 0.0f;
      gasLevel = 0;
    }
  }

  // 3. Read Raw Door Sensor Pin on D5
  rawDoorPinState = digitalRead(IR_DOOR_PIN);

  // 4. Apply Calibration Studio Settings:
  if (overrideModeEnabled) {
    // Show Data / Override Mode: Output user's configured manual values
    temperature = manualTemp;
    humidity    = manualHumidity;
    gasPpm      = manualGas;
    gasLevel    = (int)constrain(map((long)(manualGas * 10.0f), 0, 150, 5, 95), 5, 99);
  } else {
    // Live Hardware Mode with Calibration Offsets
    if (dhtSensorExists) {
      temperature = rawTemperature + tempOffset;
      humidity    = rawHumidity + humidityOffset;
      if (humidity > 100.0f) humidity = 100.0f;
      if (humidity < 0.0f)   humidity = 0.0f;
    }
  }
}

// ==============================================================================
// DOOR STATUS & STABILIZATION WORKFLOW
// ==============================================================================
bool checkDoorStatus() {
  // Read hardware pin state using configured polarity
  int sensorVal = digitalRead(IR_DOOR_PIN);
  rawDoorPinState = sensorVal;
  bool rawOpen = doorOpenActiveHigh ? (sensorVal == HIGH) : (sensorVal == LOW);

  if (rawOpen != lastRawDoorState) {
    lastDoorDebounce = millis();
    lastRawDoorState = rawOpen;
  }

  if ((millis() - lastDoorDebounce) >= 50) { // 50ms responsive debounce
    if (isDoorOpen != rawOpen) {
      isDoorOpen = rawOpen;
      Serial.printf("[DOOR] Status changed -> %s | Pin D5=%s | Polarity=Active %s\n",
                    isDoorOpen ? "OPEN" : "CLOSED",
                    sensorVal == HIGH ? "HIGH" : "LOW",
                    doorOpenActiveHigh ? "HIGH" : "LOW");
    }
  }

  return isDoorOpen;
}

void handleDoorWorkflow() {
  bool currentDoorState = checkDoorStatus();

  // If safety interlock is bypassed, don't lock out actuators, but door state is still tracked!
  if (!doorInterlockEnabled) {
    if (currentState == STATE_DOOR_OPEN || currentState == STATE_WAIT_5_SECONDS) {
      currentState = STATE_NORMAL;
    }
    return;
  }

  switch (currentState) {
    case STATE_NORMAL:
    case STATE_ALERT:
      if (currentDoorState == true) { // Door opened
        Serial.println("\n[DOOR] Chamber door opened. Engaging safety pause.");
        currentState = STATE_DOOR_OPEN;
        safeSetRelay(RELAY_INLET_FAN, false, true);
        safeSetRelay(RELAY_OUTLET_FAN, false, true);
        safeSetRelay(RELAY_HUMIDIFIER, false, true);
      }
      break;

    case STATE_DOOR_OPEN:
      if (currentDoorState == false) { // Door closed
        Serial.println("\n[DOOR] Chamber door closed. Starting 5s stabilization countdown...");
        currentState = STATE_WAIT_5_SECONDS;
        doorClosedTimestamp = millis();
      }
      break;

    case STATE_WAIT_5_SECONDS:
      if (currentDoorState == true) { // Door re-opened
        currentState = STATE_DOOR_OPEN;
        safeSetRelay(RELAY_INLET_FAN, false, true);
        safeSetRelay(RELAY_OUTLET_FAN, false, true);
        safeSetRelay(RELAY_HUMIDIFIER, false, true);
        return;
      }

      if (millis() - doorClosedTimestamp >= RECOVERY_DELAY_MS) {
        Serial.println("\n[DOOR] Chamber stabilized. Resuming normal regulation.");
        readSensors();
        currentState = STATE_NORMAL;
        if (systemMode == "AUTO") {
          executeAutoClimateControl();
        }
      }
      break;
  }
}

// ==============================================================================
// AUTONOMOUS CLIMATE & CYCLIC AERATION LOGIC
// ==============================================================================
void executeAutoClimateControl() {
  if (doorInterlockEnabled && isDoorOpen) return;

  unsigned long now = millis();

  // 1. Ultrasonic Humidity Regulation with Hysteresis
  if (humidity < humidityMinThreshold) {
    safeSetRelay(RELAY_HUMIDIFIER, true);
  } else if (humidity >= humidityMaxThreshold) {
    safeSetRelay(RELAY_HUMIDIFIER, false);
  }

  // 2. High PPM Ethylene Emergency Override:
  // If PPM is high, fans run CONTINUOUSLY until air clears!
  if (gasSensorExists && gasPpm >= gasThresholdPpm) {
    currentState = STATE_ALERT;
    safeSetRelay(RELAY_INLET_FAN, true, true);
    safeSetRelay(RELAY_OUTLET_FAN, true, true);
    return; // Overrides cyclic aeration until gas clears!
  } else if (currentState == STATE_ALERT) {
    float clearThreshold = gasThresholdPpm - gasHysteresisPpm;
    if (clearThreshold < 0.2f) clearThreshold = 0.2f;
    if (gasPpm < clearThreshold || !gasSensorExists) {
      currentState = STATE_NORMAL;
      // Gas cleared: reset cyclic schedule
      fanCyclePhase = FAN_CYCLE_RUNNING;
      fanCycleStartTime = now;
    } else {
      // Still in alert purge
      safeSetRelay(RELAY_INLET_FAN, true);
      safeSetRelay(RELAY_OUTLET_FAN, true);
      return;
    }
  }

  // 3. Cyclic Aeration Schedule (2 Minutes ON / 5 Minutes OFF)
  if (cyclicFanEnabled) {
    if (fanCyclePhase == FAN_CYCLE_RUNNING) {
      unsigned long elapsedSec = (now - fanCycleStartTime) / 1000UL;
      if (elapsedSec >= (unsigned long)cyclicRunSec) {
        // 2 Minutes elapsed: Switch to RESTING (OFF)
        fanCyclePhase = FAN_CYCLE_RESTING;
        fanCycleStartTime = now;
        safeSetRelay(RELAY_INLET_FAN, false);
        safeSetRelay(RELAY_OUTLET_FAN, false);
        Serial.println("[AERATION] 2-Minute run complete. Chamber resting for 5 minutes.");
      } else {
        fanCycleRemainingSec = cyclicRunSec - elapsedSec;
        safeSetRelay(RELAY_INLET_FAN, true);
        safeSetRelay(RELAY_OUTLET_FAN, true);
      }
    } else { // FAN_CYCLE_RESTING
      unsigned long elapsedSec = (now - fanCycleStartTime) / 1000UL;
      if (elapsedSec >= (unsigned long)cyclicRestSec) {
        // 5 Minutes elapsed: Switch back to RUNNING (ON)
        fanCyclePhase = FAN_CYCLE_RUNNING;
        fanCycleStartTime = now;
        safeSetRelay(RELAY_INLET_FAN, true);
        safeSetRelay(RELAY_OUTLET_FAN, true);
        Serial.println("[AERATION] 5-Minute rest complete. Starting 2-minute fresh aeration.");
      } else {
        fanCycleRemainingSec = cyclicRestSec - elapsedSec;
        safeSetRelay(RELAY_INLET_FAN, false);
        safeSetRelay(RELAY_OUTLET_FAN, false);
      }
    }
  } else {
    // Cyclic schedule disabled: Keep fans OFF unless triggered by PPM or manual
    if (inletFanState) safeSetRelay(RELAY_INLET_FAN, false);
    if (outletFanState) safeSetRelay(RELAY_OUTLET_FAN, false);
  }
}

// ==============================================================================
// WI-FI RESET & CREDENTIALS WIPE (HARDWARE TOUCH 20s OR WEB API)
// ==============================================================================
void resetWiFiAndCredentials() {
  Serial.println("\n=======================================================");
  Serial.println("  [RESET] >>> INITIATING WI-FI CREDENTIAL WIPE <<<     ");
  Serial.println("=======================================================");

  // 1. Safe shutdown of active climate relays during reset
  safeSetRelay(RELAY_INLET_FAN, false, true);
  safeSetRelay(RELAY_OUTLET_FAN, false, true);
  safeSetRelay(RELAY_HUMIDIFIER, false, true);

  // 2. Clear in-memory Wi-Fi credentials
  savedSsid    = "";
  savedPass    = "";
  isConfigured = false;

  // 3. Persist cleared Wi-Fi credentials to EEPROM Flash
  saveConfigToEEPROM();

  // 4. Wipe internal ESP8266 SDK Non-OS Wi-Fi flash configuration sector
  WiFi.disconnect(true);
  delay(100);

  // 5. Visual confirmation: Strobe White & Blue LEDs (6 rapid pulses)
  for (int i = 0; i < 6; i++) {
    digitalWrite(RELAY_WHITE_LED, RELAY_ACTIVE_LEVEL);
    digitalWrite(RELAY_BLUE_LED, RELAY_ACTIVE_LEVEL);
    delay(100);
    digitalWrite(RELAY_WHITE_LED, RELAY_INACTIVE_LEVEL);
    digitalWrite(RELAY_BLUE_LED, RELAY_INACTIVE_LEVEL);
    delay(100);
  }

  Serial.println("  [RESET] Wi-Fi credentials wiped from Flash.");
  Serial.println("  [RESET] Rebooting ESP8266 into Standalone Hotspot: " AP_SSID_NAME);
  Serial.println("=======================================================\n");
  delay(300);

  // 6. Clean reboot into Standalone Access Point mode
  ESP.restart();
}

// ==============================================================================
// TOUCH SENSOR: BEZEL LIGHT TAP & 20-SECOND WI-FI RESET
// ==============================================================================
void handleTouchSensor() {
  int rawReading = digitalRead(TOUCH_PIN);
  unsigned long now = millis();

  if (rawReading == HIGH) {
    touchReleaseTime = 0; // Cancel any release debounce timer

    if (touchPressStart == 0) {
      touchPressStart = now;
      touchResetTriggered = false;
      lastTouchLogTime = now;
      Serial.println("[Touch] Sensor pressed. (Tap: Daylight LED | Hold 20s: Reset Wi-Fi)");
    } else if (!touchResetTriggered) {
      unsigned long elapsed = now - touchPressStart;

      // Periodic progress log in Serial monitor every 2 seconds
      if (now - lastTouchLogTime >= 2000) {
        lastTouchLogTime = now;
        unsigned long secRemaining = (elapsed >= TOUCH_RESET_HOLD_MS) ? 0 : (TOUCH_RESET_HOLD_MS - elapsed + 999) / 1000UL;
        Serial.printf("[Touch] Holding touch sensor: %lu / 20 seconds (Reset in %lu sec)...\n",
                      elapsed / 1000UL, secRemaining);
      }

      // Check if 20 seconds (20,000 ms) threshold is reached
      if (elapsed >= TOUCH_RESET_HOLD_MS) {
        touchResetTriggered = true;
        Serial.println("\n*******************************************************");
        Serial.println("  [Touch] >>> 20 SECONDS REACHED! WI-FI RESET TRIGGERED! <<<");
        Serial.println("*******************************************************");
        resetWiFiAndCredentials();
      }
    }
  } else {
    // Sensor reading is LOW
    if (touchPressStart > 0 && !touchResetTriggered) {
      // Debounce short release noise (require 100ms stable LOW before concluding release)
      if (touchReleaseTime == 0) {
        touchReleaseTime = now;
      } else if (now - touchReleaseTime >= 100) {
        unsigned long duration = touchReleaseTime - touchPressStart;

        if (duration > 50 && duration < 3000) {
          // Short tap (< 3s): toggle inspection white daylight LED
          whiteLedState = !whiteLedState;
          safeSetRelay(RELAY_WHITE_LED, whiteLedState);
          Serial.printf("[Touch] Inspection Daylight LED toggled %s (Tap duration: %lums)\n",
                        whiteLedState ? "ON" : "OFF", duration);
        } else if (duration >= 3000) {
          Serial.printf("[Touch] Released after %lu seconds. (Hold full 20s to reset Wi-Fi)\n",
                        duration / 1000UL);
        }

        touchPressStart = 0;
        touchReleaseTime = 0;
        touchResetTriggered = false;
      }
    } else if (touchResetTriggered) {
      touchPressStart = 0;
      touchReleaseTime = 0;
      touchResetTriggered = false;
    }
  }
}

// ==============================================================================
// EEPROM FLASH STORAGE
// ==============================================================================
uint32_t calculateChecksum(const VaultConfig& cfg) {
  const uint8_t* p = (const uint8_t*)&cfg;
  size_t len = sizeof(VaultConfig) - sizeof(uint32_t);
  uint32_t sum = 5381;
  for (size_t i = 0; i < len; i++) {
    sum = ((sum << 5) + sum) + p[i];
  }
  return sum;
}

void loadConfigFromEEPROM() {
  EEPROM.begin(EEPROM_SIZE);
  VaultConfig cfg;
  EEPROM.get(0, cfg);

  if (cfg.magic == EEPROM_MAGIC && cfg.checksum == calculateChecksum(cfg)) {
    isConfigured           = cfg.configured;
    savedSsid              = String(cfg.ssid);
    savedPass              = String(cfg.password);
    deviceId               = String(cfg.device_id);
    tempMinThreshold       = cfg.temp_min;
    tempMaxThreshold       = cfg.temp_max;
    humidityMinThreshold   = cfg.humidity_min;
    humidityMaxThreshold   = cfg.humidity_max;
    gasThresholdPpm        = cfg.gas_threshold_ppm;
    gasHysteresisPpm       = cfg.gas_hysteresis_ppm;
    minRelayDwellMs        = (unsigned long)cfg.min_dwell_sec * 1000UL;
    doorInterlockEnabled   = cfg.door_interlock_enabled;
    doorOpenActiveHigh     = cfg.door_open_active_high;
    cyclicFanEnabled       = cfg.cyclic_fan_enabled;
    cyclicRunSec           = cfg.cyclic_run_sec;
    cyclicRestSec          = cfg.cyclic_rest_sec;
    overrideModeEnabled    = cfg.override_mode_enabled;
    manualTemp             = cfg.manual_temp;
    manualHumidity         = cfg.manual_humidity;
    manualGas              = cfg.manual_gas_ppm;
    tempOffset             = cfg.temp_offset;
    humidityOffset         = cfg.humidity_offset;
    gasScaleFactor         = cfg.gas_scale;
    gasR0                  = cfg.gas_r0;
    dhtModel               = cfg.dht_type;

    if (minRelayDwellMs < 2000) minRelayDwellMs = 4000;
    if (cyclicRunSec < 10) cyclicRunSec = 120;
    if (cyclicRestSec < 10) cyclicRestSec = 300;
    if (gasScaleFactor <= 0.05f) gasScaleFactor = 1.0f;
    if (gasR0 < 1.0f) gasR0 = 25.0f;
    if (gasThresholdPpm < 0.2f || gasThresholdPpm > 100.0f) gasThresholdPpm = 5.0f;
    if (gasHysteresisPpm < 0.1f) gasHysteresisPpm = 1.0f;
    if (dhtModel != 22) dhtModel = 11;
    if (deviceId.length() == 0) deviceId = "FT-ESP8266";

    Serial.println("[EEPROM] Configuration loaded successfully from Flash.");
  } else {
    Serial.println("[EEPROM] Initializing Flash defaults with realistic calibration...");
    isConfigured           = false;
    savedSsid              = "";
    savedPass              = "";
    deviceId               = "FT-ESP8266";
    tempMinThreshold       = 1.0;
    tempMaxThreshold       = 4.0;
    humidityMinThreshold   = 85.0;
    humidityMaxThreshold   = 92.0;
    gasThresholdPpm        = 5.0;  // 5.0 PPM realistic Ethylene purge trigger
    gasHysteresisPpm       = 1.0;  // 1.0 PPM hysteresis
    minRelayDwellMs        = 4000;
    doorInterlockEnabled   = false;
    doorOpenActiveHigh     = true; // default active HIGH
    cyclicFanEnabled       = true; // 2 min ON / 5 min OFF enabled
    cyclicRunSec           = 120;  // 2 minutes
    cyclicRestSec          = 300;  // 5 minutes
    overrideModeEnabled    = false;
    manualTemp             = 22.5; // Realistic room temperature
    manualHumidity         = 55.0; // Realistic room humidity
    manualGas              = 0.4;  // Realistic room clean air PPM
    tempOffset             = 0.0;
    humidityOffset         = 0.0;
    gasScaleFactor         = 1.0;
    gasR0                  = 25.0; // Default 25kOhm clean-air baseline
    dhtModel               = 11;   // Default DHT11

    saveConfigToEEPROM();
  }
}

void saveConfigToEEPROM() {
  VaultConfig cfg;
  memset(&cfg, 0, sizeof(cfg));
  cfg.magic                  = EEPROM_MAGIC;
  cfg.configured             = isConfigured;
  strncpy(cfg.ssid, savedSsid.c_str(), sizeof(cfg.ssid) - 1);
  strncpy(cfg.password, savedPass.c_str(), sizeof(cfg.password) - 1);
  strncpy(cfg.device_id, deviceId.c_str(), sizeof(cfg.device_id) - 1);
  cfg.temp_min               = tempMinThreshold;
  cfg.temp_max               = tempMaxThreshold;
  cfg.humidity_min           = humidityMinThreshold;
  cfg.humidity_max           = humidityMaxThreshold;
  cfg.gas_threshold_ppm      = gasThresholdPpm;
  cfg.gas_hysteresis_ppm     = gasHysteresisPpm;
  cfg.min_dwell_sec          = (int)(minRelayDwellMs / 1000UL);
  cfg.door_interlock_enabled = doorInterlockEnabled;
  cfg.door_open_active_high  = doorOpenActiveHigh;
  cfg.cyclic_fan_enabled     = cyclicFanEnabled;
  cfg.cyclic_run_sec         = cyclicRunSec;
  cfg.cyclic_rest_sec        = cyclicRestSec;
  cfg.override_mode_enabled  = overrideModeEnabled;
  cfg.manual_temp            = manualTemp;
  cfg.manual_humidity        = manualHumidity;
  cfg.manual_gas_ppm         = manualGas;
  cfg.temp_offset            = tempOffset;
  cfg.humidity_offset        = humidityOffset;
  cfg.gas_scale              = gasScaleFactor;
  cfg.gas_r0                 = gasR0;
  cfg.dht_type               = dhtModel;
  cfg.checksum               = calculateChecksum(cfg);

  EEPROM.put(0, cfg);
  EEPROM.commit();
  Serial.println("[EEPROM] Configuration committed to Flash.");
}

// ==============================================================================
// WI-FI & NETWORKING
// ==============================================================================
void startStandaloneAP() {
  Serial.println("\n[WiFi] Starting Standalone Access Point: " AP_SSID_NAME);
  WiFi.disconnect();
  delay(50);
  WiFi.mode(WIFI_AP);
  WiFi.setOutputPower(16.0); // Thermal optimization
  WiFi.setSleepMode(WIFI_NONE_SLEEP); // Ensure web server responds immediately
  WiFi.softAPConfig(apIP, apIP, netMsk);
  WiFi.softAP(AP_SSID_NAME, AP_DEFAULT_PASS);
  delay(150);

  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(DNS_PORT, "*", apIP);

  localServer.begin();

  if (MDNS.begin("freshtag")) {
    MDNS.addService("http", "tcp", 80);
  }

  Serial.println("=======================================================");
  Serial.println("  [WiFi] Access Point Active!");
  Serial.printf("  [WiFi] Hotspot SSID:  %s (No password)\n", AP_SSID_NAME);
  Serial.printf("  [WiFi] Dashboard URL: http://%s\n", WiFi.softAPIP().toString().c_str());
  Serial.println("=======================================================");
}

bool connectToWiFi(const char* ssid, const char* password) {
  if (!ssid || strlen(ssid) == 0) {
    startStandaloneAP();
    return false;
  }

  Serial.printf("\n[WiFi] Initializing Chamber Network (Dual Hotspot + Station: %s)...\n", ssid);
  
  // 1. Dual mode (WIFI_AP_STA) so Hotspot 'FreshTag-Vault' is ALWAYS active and accessible
  WiFi.mode(WIFI_AP_STA);
  WiFi.setOutputPower(16.0);
  WiFi.setSleepMode(WIFI_NONE_SLEEP); // Keep radio receiver active for instant HTTP responses
  
  // 2. Configure and launch SoftAP hotspot on 192.168.4.1 immediately
  WiFi.softAPConfig(apIP, apIP, netMsk);
  WiFi.softAP(AP_SSID_NAME, AP_DEFAULT_PASS);
  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(DNS_PORT, "*", apIP);
  localServer.begin();

  if (MDNS.begin("freshtag")) {
    MDNS.addService("http", "tcp", 80);
  }

  Serial.println("  [WiFi] Access Point 'FreshTag-Vault' is ONLINE at http://192.168.4.1/");

  // 3. Initiate station connection
  WiFi.begin(ssid, password);
  Serial.printf("  [WiFi] Connecting to network '%s' ", ssid);

  // Fast non-blocking settle loop (up to 3 seconds), servicing web requests
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 15) {
    delay(200);
    dnsServer.processNextRequest();
    localServer.handleClient();
    yield();
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiRetryCount = 0;
    Serial.println("\n\n=======================================================");
    Serial.println("  🌱 FreshTag Chamber Online & Connected!             ");
    Serial.println("=======================================================");
    Serial.printf("  Option 1 (Local Wi-Fi IP):  http://%s\n", WiFi.localIP().toString().c_str());
    Serial.printf("  Option 2 (Direct Hotspot):   http://%s  (SSID: %s)\n", WiFi.softAPIP().toString().c_str(), AP_SSID_NAME);
    Serial.println("  Option 3 (mDNS Name):       http://freshtag.local\n");
    Serial.println("=======================================================\n");
    return true;
  } else {
    Serial.println("\n  [WiFi] Station not connected yet. Running in Dual AP mode.");
    Serial.printf("  👉 Chamber Access Point is active: '%s' -> http://192.168.4.1/\n\n", AP_SSID_NAME);
    return false;
  }
}

// ==============================================================================
// LOCAL REST API & WEB SERVER ROUTES
// ==============================================================================
void sendCORSHeaders() {
  localServer.sendHeader("Access-Control-Allow-Origin", "*");
  localServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  localServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

bool parseRelayState(JsonVariant v) {
  if (v.is<bool>()) return v.as<bool>();
  if (v.is<int>()) return v.as<int>() != 0;
  if (v.is<const char*>() || v.is<String>()) {
    String s = v.as<String>();
    s.toUpperCase();
    return (s == "ON" || s == "1" || s == "TRUE");
  }
  return false;
}

void setupHttpServerRoutes() {
  // CORS Preflight
  localServer.onNotFound([]() {
    if (localServer.method() == HTTP_OPTIONS) {
      sendCORSHeaders();
      localServer.send(204, "text/plain", "");
      return;
    }
    // Captive portal fallback
    localServer.sendHeader("Location", "http://192.168.4.1/", true);
    localServer.send(302, "text/plain", "");
  });

  // Serve Main Standalone Web Dashboard directly from PROGMEM Flash
  auto serveDashboard = []() {
    localServer.send_P(200, "text/html", DASHBOARD_HTML);
  };

  localServer.on("/", HTTP_GET, serveDashboard);
  localServer.on("/index.html", HTTP_GET, serveDashboard);
  localServer.on("/dashboard", HTTP_GET, serveDashboard);
  localServer.on("/generate_204", HTTP_GET, serveDashboard);
  localServer.on("/hotspot-detect.html", HTTP_GET, serveDashboard);

  // Live Telemetry Status Endpoint (/api/status & /status)
  auto handleStatus = []() {
    sendCORSHeaders();
    FreshGuardJsonDoc doc;
    doc["device_id"]      = deviceId;
    doc["hardware"]       = "ESP8266";
    doc["door_status"]    = isDoorOpen ? "OPEN" : "CLOSED";
    doc["door_raw_pin"]   = digitalRead(IR_DOOR_PIN);
    doc["door_open_active_high"] = doorOpenActiveHigh;
    doc["door_interlock"] = doorInterlockEnabled;
    doc["state"]          = (currentState == STATE_DOOR_OPEN) ? "DOOR_OPEN" :
                            (currentState == STATE_WAIT_5_SECONDS) ? "WAIT_5_SECONDS" :
                            (currentState == STATE_ALERT) ? "ALERT" : "NORMAL";
    doc["system_mode"]    = systemMode;

    // Sensor Hardware Presence Flags
    doc["dht_exists"]     = dhtSensorExists;
    doc["gas_exists"]     = gasSensorExists;
    doc["dht_model"]      = (dhtModel == 22) ? "DHT22" : "DHT11";
    doc["dht_type"]       = dhtModel;

    // Regulated / Displayed Values
    if (dhtSensorExists || overrideModeEnabled) {
      doc["temperature"]  = round(temperature * 10.0) / 10.0;
      doc["humidity"]     = round(humidity * 10.0) / 10.0;
    } else {
      doc["temperature"]  = nullptr;
      doc["humidity"]     = nullptr;
    }

    if (gasSensorExists || overrideModeEnabled) {
      doc["gas_ppm"]      = round(gasPpm * 10.0) / 10.0;
      doc["gas_level"]    = gasLevel; // 0 - 100 Index
    } else {
      doc["gas_ppm"]      = nullptr;
      doc["gas_level"]    = nullptr;
    }

    // Raw Hardware Diagnostics
    doc["raw_temperature"]= round(rawTemperature * 10.0) / 10.0;
    doc["raw_humidity"]   = round(rawHumidity * 10.0) / 10.0;
    doc["raw_gas_level"]  = rawGasLevel; // 0 - 1023 ADC
    doc["raw_gas_rs"]     = round(rawGasRs * 10.0) / 10.0;
    doc["gas_r0"]         = round(gasR0 * 10.0) / 10.0;

    // Calibration Studio State
    doc["override_mode"]  = overrideModeEnabled;
    doc["manual_temp"]    = manualTemp;
    doc["manual_humidity"]= manualHumidity;
    doc["manual_gas"]     = manualGas;
    doc["temp_offset"]    = tempOffset;
    doc["humidity_offset"]= humidityOffset;
    doc["gas_scale"]      = gasScaleFactor;

    // Cyclic Aeration State
    doc["cyclic_fan_enabled"]     = cyclicFanEnabled;
    doc["cyclic_run_sec"]         = cyclicRunSec;
    doc["cyclic_rest_sec"]        = cyclicRestSec;
    doc["fan_cycle_phase"]        = (fanCyclePhase == FAN_CYCLE_RUNNING) ? "RUNNING" : "RESTING";
    doc["fan_cycle_remaining_sec"]= fanCycleRemainingSec;

    // Relays
    doc["inlet_fan"]      = inletFanState ? "ON" : "OFF";
    doc["outlet_fan"]     = outletFanState ? "ON" : "OFF";
    doc["humidifier"]     = humidifierState ? "ON" : "OFF";
    doc["white_led"]      = whiteLedState ? "ON" : "OFF";
    doc["blue_led"]       = blueLedState ? "ON" : "OFF";

    // Network & Diagnostics
    doc["wifi_ssid"]      = (WiFi.status() == WL_CONNECTED) ? WiFi.SSID() : "";
    doc["wifi_rssi"]      = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : 0;
    doc["ip"]             = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
    doc["uptime_sec"]     = millis() / 1000UL;

    JsonObject th         = doc.createNestedObject("thresholds");
    th["temp_min"]        = tempMinThreshold;
    th["temp_max"]        = tempMaxThreshold;
    th["humidity_min"]    = humidityMinThreshold;
    th["humidity_max"]    = humidityMaxThreshold;
    th["gas_threshold"]   = gasThresholdPpm;
    th["gas_hysteresis"]  = gasHysteresisPpm;
    th["min_dwell_sec"]   = (int)(minRelayDwellMs / 1000UL);

    String res;
    serializeJson(doc, res);
    localServer.send(200, "application/json", res);
  };

  localServer.on("/api/status", HTTP_GET, handleStatus);
  localServer.on("/status", HTTP_GET, handleStatus);

  // Relay & Mode Control Endpoint (/api/control & /control)
  auto handleControl = []() {
    sendCORSHeaders();
    if (!localServer.hasArg("plain")) {
      localServer.send(400, "application/json", "{\"error\":\"Missing body\"}");
      return;
    }

    FreshGuardJsonDoc doc;
    DeserializationError err = deserializeJson(doc, localServer.arg("plain"));
    if (err) {
      localServer.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
      return;
    }

    if (!doc["mode"].isNull()) {
      String m = doc["mode"].as<String>();
      m.toUpperCase();
      if (m == "AUTO" || m == "MANUAL") {
        systemMode = m;
        if (systemMode == "AUTO") {
          executeAutoClimateControl();
        }
      }
    }

    if (!doc["inlet_fan"].isNull()) {
      safeSetRelay(RELAY_INLET_FAN, parseRelayState(doc["inlet_fan"]), true);
    }
    if (!doc["outlet_fan"].isNull()) {
      safeSetRelay(RELAY_OUTLET_FAN, parseRelayState(doc["outlet_fan"]), true);
    }
    if (!doc["humidifier"].isNull()) {
      safeSetRelay(RELAY_HUMIDIFIER, parseRelayState(doc["humidifier"]), true);
    }
    if (!doc["white_led"].isNull()) {
      safeSetRelay(RELAY_WHITE_LED, parseRelayState(doc["white_led"]), true);
    }
    if (!doc["blue_led"].isNull()) {
      safeSetRelay(RELAY_BLUE_LED, parseRelayState(doc["blue_led"]), true);
    }

    localServer.send(200, "application/json", "{\"status\":\"ok\",\"mode\":\"" + systemMode + "\"}");
  };

  localServer.on("/api/control", HTTP_POST, handleControl);
  localServer.on("/control", HTTP_POST, handleControl);

  // Cyclic Aeration & Automations Endpoint (/api/cycles)
  auto handleCycles = []() {
    sendCORSHeaders();
    if (!localServer.hasArg("plain")) {
      localServer.send(400, "application/json", "{\"error\":\"Missing body\"}");
      return;
    }

    FreshGuardJsonDoc doc;
    DeserializationError err = deserializeJson(doc, localServer.arg("plain"));
    if (err) {
      localServer.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
      return;
    }

    if (!doc["cyclic_enabled"].isNull())  cyclicFanEnabled = doc["cyclic_enabled"].as<bool>();
    if (!doc["cyclic_run_sec"].isNull())  cyclicRunSec     = doc["cyclic_run_sec"].as<int>();
    if (!doc["cyclic_rest_sec"].isNull()) cyclicRestSec    = doc["cyclic_rest_sec"].as<int>();
    if (!doc["gas_threshold"].isNull())   gasThresholdPpm  = doc["gas_threshold"].as<float>();
    if (!doc["gas_hysteresis"].isNull())  gasHysteresisPpm = doc["gas_hysteresis"].as<float>();
    if (!doc["min_dwell_sec"].isNull())   minRelayDwellMs  = (unsigned long)doc["min_dwell_sec"].as<int>() * 1000UL;
    if (!doc["humidity_min"].isNull())    humidityMinThreshold = doc["humidity_min"].as<float>();
    if (!doc["humidity_max"].isNull())    humidityMaxThreshold = doc["humidity_max"].as<float>();

    if (cyclicRunSec < 10) cyclicRunSec = 10;
    if (cyclicRestSec < 10) cyclicRestSec = 10;
    if (minRelayDwellMs < 2000) minRelayDwellMs = 2000;
    if (gasThresholdPpm < 0.2f) gasThresholdPpm = 0.2f;

    saveConfigToEEPROM();
    localServer.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Automations updated\"}");
  };

  localServer.on("/api/cycles", HTTP_POST, handleCycles);

  // Calibration Studio Endpoint (/api/calibration)
  auto handleCalibration = []() {
    sendCORSHeaders();
    if (!localServer.hasArg("plain")) {
      localServer.send(400, "application/json", "{\"error\":\"Missing body\"}");
      return;
    }

    FreshGuardJsonDoc doc;
    DeserializationError err = deserializeJson(doc, localServer.arg("plain"));
    if (err) {
      localServer.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
      return;
    }

    if (!doc["override_mode"].isNull())         overrideModeEnabled   = doc["override_mode"].as<bool>();
    if (!doc["manual_temp"].isNull())           manualTemp            = doc["manual_temp"].as<float>();
    if (!doc["manual_humidity"].isNull())       manualHumidity        = doc["manual_humidity"].as<float>();
    if (!doc["manual_gas"].isNull())            manualGas             = doc["manual_gas"].as<float>();
    if (!doc["temp_offset"].isNull())           tempOffset            = doc["temp_offset"].as<float>();
    if (!doc["humidity_offset"].isNull())       humidityOffset        = doc["humidity_offset"].as<float>();
    if (!doc["gas_scale"].isNull())             gasScaleFactor        = doc["gas_scale"].as<float>();
    if (!doc["gas_r0"].isNull())                gasR0                 = doc["gas_r0"].as<float>();
    if (!doc["dht_type"].isNull()) {
      dhtModel = doc["dht_type"].as<uint8_t>();
      dht = DHT(DHTPIN, (dhtModel == 22) ? DHT22 : DHT11);
      dht.begin();
    }
    if (!doc["door_open_active_high"].isNull()) doorOpenActiveHigh    = doc["door_open_active_high"].as<bool>();
    if (!doc["door_interlock"].isNull())        doorInterlockEnabled  = doc["door_interlock"].as<bool>();

    saveConfigToEEPROM();
    readSensors();
    checkDoorStatus();

    localServer.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Calibration applied\"}");
  };

  localServer.on("/api/calibration", HTTP_POST, handleCalibration);

  // Calibrate Clean Air Baseline Endpoint (/api/calibrate-gas)
  auto handleCalibrateGas = []() {
    sendCORSHeaders();
    calibrateCleanAirGasBaseline();
    readSensors();
    localServer.send(200, "application/json", "{\"status\":\"ok\",\"gas_r0\":" + String(gasR0, 2) + ",\"gas_ppm\":" + String(gasPpm, 1) + "}");
  };

  localServer.on("/api/calibrate-gas", HTTP_POST, handleCalibrateGas);

  // Quick 1-click toggle for Door Polarity
  auto handleToggleDoorPolarity = []() {
    sendCORSHeaders();
    doorOpenActiveHigh = !doorOpenActiveHigh;
    saveConfigToEEPROM();
    checkDoorStatus();
    Serial.printf("[DOOR] Polarity flipped -> Active %s | Status: %s | Pin D5=%s\n", 
                  doorOpenActiveHigh ? "HIGH" : "LOW", 
                  isDoorOpen ? "OPEN" : "CLOSED",
                  rawDoorPinState == HIGH ? "HIGH" : "LOW");
    localServer.send(200, "application/json", "{\"status\":\"ok\",\"door_open_active_high\":" + String(doorOpenActiveHigh ? "true" : "false") + ",\"door_status\":\"" + String(isDoorOpen ? "OPEN" : "CLOSED") + "\"}");
  };

  localServer.on("/api/toggle-door-polarity", HTTP_POST, handleToggleDoorPolarity);

  // Wi-Fi Scan Endpoint
  auto handleScan = []() {
    sendCORSHeaders();
    int n = WiFi.scanNetworks();
    String json = "{\"networks\":[";
    for (int i = 0; i < n; ++i) {
      if (i > 0) json += ",";
      json += "{\"ssid\":\"" + WiFi.SSID(i) + "\",\"rssi\":" + String(WiFi.RSSI(i)) + "}";
    }
    json += "]}";
    localServer.send(200, "application/json", json);
  };

  localServer.on("/api/scan-wifi", HTTP_GET, handleScan);
  localServer.on("/scan-wifi", HTTP_GET, handleScan);

  // Wi-Fi Setup Endpoint
  auto handleWifi = []() {
    sendCORSHeaders();
    if (!localServer.hasArg("plain")) {
      localServer.send(400, "application/json", "{\"error\":\"Missing body\"}");
      return;
    }

    FreshGuardJsonDoc doc;
    DeserializationError err = deserializeJson(doc, localServer.arg("plain"));
    if (err || doc["ssid"].isNull()) {
      localServer.send(400, "application/json", "{\"error\":\"Missing SSID\"}");
      return;
    }

    savedSsid = doc["ssid"].as<String>();
    savedPass = doc["password"].isNull() ? "" : doc["password"].as<String>();
    isConfigured = true;
    saveConfigToEEPROM();

    localServer.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Saved. Connecting to Wi-Fi...\"}");
    wifiRetryCount = 0;
    pendingWiFiConnect = true;
  };

  localServer.on("/api/wifi", HTTP_POST, handleWifi);
  localServer.on("/api/wifi-config", HTTP_POST, handleWifi);

  // Wi-Fi Reset / Wipe Endpoint (/api/reset-wifi & /reset-wifi)
  auto handleResetWifi = []() {
    sendCORSHeaders();
    localServer.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Wi-Fi credentials reset. Rebooting to FreshTag-Vault hotspot...\"}");
    delay(200);
    resetWiFiAndCredentials();
  };

  localServer.on("/api/reset-wifi", HTTP_POST, handleResetWifi);
  localServer.on("/reset-wifi", HTTP_POST, handleResetWifi);

  localServer.begin();
  Serial.println("[HTTP Server] Local REST API started on port 80");
}

// ==============================================================================
// ARDUINO SETUP
// ==============================================================================
void setup() {
  Serial.begin(115200);
  delay(250);

  Serial.println("\n\n=======================================================");
  Serial.println("  🌱 FreshTag ESP8266 - Precision Botanical Chamber   ");
  Serial.println("  Cyclic Aeration • Calibration Studio • Zero Flicker ");
  Serial.println("=======================================================");

  // Set Relay Outputs to Inactive level FIRST before pinMode to prevent boot chatter
  digitalWrite(RELAY_INLET_FAN, RELAY_INACTIVE_LEVEL);
  digitalWrite(RELAY_OUTLET_FAN, RELAY_INACTIVE_LEVEL);
  digitalWrite(RELAY_HUMIDIFIER, RELAY_INACTIVE_LEVEL);
  digitalWrite(RELAY_WHITE_LED, RELAY_INACTIVE_LEVEL);
  digitalWrite(RELAY_BLUE_LED, RELAY_INACTIVE_LEVEL);

  pinMode(RELAY_INLET_FAN, OUTPUT);
  pinMode(RELAY_OUTLET_FAN, OUTPUT);
  pinMode(RELAY_HUMIDIFIER, OUTPUT);
  pinMode(RELAY_WHITE_LED, OUTPUT);
  pinMode(RELAY_BLUE_LED, OUTPUT);

  // Load Stored Thresholds & Wi-Fi from Flash EEPROM
  loadConfigFromEEPROM();

  // Initialize Sensors
  pinMode(IR_DOOR_PIN, INPUT_PULLUP);
  pinMode(TOUCH_PIN, INPUT);
  pinMode(DHTPIN, INPUT_PULLUP); // Enable pull-up on D2 (GPIO 4) for noise immunity & reliable DHT communication
  dht = DHT(DHTPIN, (dhtModel == 22) ? DHT22 : DHT11);
  dht.begin();
  Serial.printf("[Sensors] %s initialized on D2 (GPIO %d) with INPUT_PULLUP.\n",
                (dhtModel == 22) ? "DHT22" : "DHT11", DHTPIN);
  Serial.printf("[Sensors] MQ Ethylene Gas Sensor on A0 (Clean-Air Baseline R0: %.1f kOhm, Threshold: %.1f PPM)\n",
                gasR0, gasThresholdPpm);

  // Thermal & Power Optimization (Reduce RF Power to 16.0dBm to eliminate heat)
  WiFi.setOutputPower(16.0);
  WiFi.setSleepMode(WIFI_NONE_SLEEP);

  // Setup REST Web Server & Embedded Dashboard
  setupHttpServerRoutes();

  // Connect to Wi-Fi if credentials exist, otherwise start Standalone Access Point
  if (savedSsid.length() > 0) {
    connectToWiFi(savedSsid.c_str(), savedPass.c_str());
  } else {
    startStandaloneAP();
  }

  // Initialize Cyclic Ventilation Timer
  fanCyclePhase = FAN_CYCLE_RUNNING;
  fanCycleStartTime = millis();

  // Allow sensor power bus to settle (1.2s), then perform initial physical sensor read
  delay(1200);
  readSensors();
  checkDoorStatus();
}

// ==============================================================================
// ARDUINO MAIN LOOP
// ==============================================================================
void loop() {
  // 1. Process asynchronous Wi-Fi connect request from dashboard
  if (pendingWiFiConnect) {
    pendingWiFiConnect = false;
    delay(400);
    connectToWiFi(savedSsid.c_str(), savedPass.c_str());
  }

  // 2. DNS Captive Portal processing when in SoftAP mode
  if (WiFi.getMode() == WIFI_AP || WiFi.getMode() == WIFI_AP_STA) {
    dnsServer.processNextRequest();
  }

  // 3. Handle incoming HTTP Dashboard and API requests
  localServer.handleClient();
  MDNS.update();

  // 4. Fast Responsive Door Sensor Edge Detection (50ms debounce)
  checkDoorStatus();

  // 5. Read Capacitive Bezel Touch Sensor
  handleTouchSensor();

  // 6. Periodic Sensor Reading & Automation loop (Run every 1.2s)
  unsigned long now = millis();
  if (now - lastSensorReadTime >= SENSOR_INTERVAL) {
    lastSensorReadTime = now;

    // Read physical sensors & apply calibration studio offsets
    readSensors();

    // Check door interlock & handle stabilization state machine
    handleDoorWorkflow();

    // Execute Autonomous Climate & Cyclic Aeration (2 min ON / 5 min OFF)
    if (systemMode == "AUTO" && (currentState == STATE_NORMAL || currentState == STATE_ALERT)) {
      executeAutoClimateControl();
    }
  }

  // 7. Wi-Fi Reconnect Keep-Alive (controlled retry every 30s)
  if (savedSsid.length() > 0 && WiFi.status() != WL_CONNECTED) {
    if (now - lastWiFiReconnectCheck >= WIFI_RETRY_MS) {
      lastWiFiReconnectCheck = now;
      if (wifiRetryCount < 3) {
        wifiRetryCount++;
        Serial.printf("[WiFi] Background reconnect %d/3 to '%s'...\n", wifiRetryCount, savedSsid.c_str());
        WiFi.begin(savedSsid.c_str(), savedPass.c_str());
      }
    }
  } else if (WiFi.status() == WL_CONNECTED) {
    wifiRetryCount = 0;
  }

  // 8. Thermal Throttling & CPU Idle Yield
  delay(10);
}
