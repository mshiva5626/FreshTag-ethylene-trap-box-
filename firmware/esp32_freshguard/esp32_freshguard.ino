/*
  ==============================================================================
    Smart FreshGuard - ESP32 Firmware with Wi-Fi SoftAP & QR Provisioning
    Autonomous Botanical Precision Storage Chamber for Fruits and Vegetables
    
    HARDWARE PIN ASSIGNMENTS (PRESERVED):
    - DHT11 Sensor (Temperature & Relative Humidity):   GPIO 4
    - MQ Gas Sensor (Ethylene / C2H4 / VOC Analog):      GPIO 34 (ADC1_CH6)
    - IR Safety Door Sensor (Optical Beam Interlock):    GPIO 14 (INPUT_PULLUP)
    - TTP223 Capacitive Touch Sensor (Bezel Tap/Reset):  GPIO 13
    - Relay 1: Inlet HEPA Fan (Air Intake):             GPIO 16 (Active LOW)
    - Relay 2: Outlet Purge / Catalytic Scrubber Fan:    GPIO 17 (Active LOW)
    - Relay 3: 1.7MHz Ultrasonic Humidifier Mist:       GPIO 5  (Active LOW)
    - Relay 4: 5000K Daylight Inspection LED:           GPIO 19 (Active LOW)
    - Relay 5: 450nm Blue LED / Status & Pairing Blink: GPIO 18 (Active LOW)

    KEY CAPABILITIES:
    1. Zero Bluetooth — Pure Wi-Fi SoftAP & QR Code Provisioning:
       - Broadcasts open Wi-Fi network: "FreshGuard-Setup" (IP: 192.168.4.1)
       - Built-in Captive Portal (DNSServer) automatically launches setup portal
         on iOS, Android, macOS, and Windows.
       - Interactive Web Setup Portal with live 2.4GHz network scanner.
       - Mobile Camera QR Auto-Join compatible: WIFI:S:FreshGuard-Setup;T:nopass;;
    2. Persistent Account Binding across Reboots:
       - Credentials (SSID, Password, Account ID, Device ID, Server) saved to NVS Flash.
       - Auto-reconnects on every boot and power outage to the SAME account indefinitely.
       - Continuous Wi-Fi keep-alive loop (retries every 10s if connection drops).
    3. Factory Reset & Unpair:
       - Web App / REST API: POST /unpair resets credentials and re-opens SoftAP.
       - Hardware Failsafe: Hold Capacitive Touch (GPIO 13) for 7+ seconds to wipe
         credentials and return to pairing mode without needing network access.
    4. Autonomous Botanical Climate PID & Interlock:
       - 5-Second Chamber Stabilization countdown when door closes.
       - Immediate actuator lockout when door is open.
       - Automated catalytic ethylene purge when gas index > threshold.
       - Ultrasonic misting automation when humidity < target.
    5. Periodic Cloud Telemetry Upload:
       - HTTP POST every 2500ms to /api/telemetry matching FreshGuard contract.
       - Non-blocking 1.5s timeout preventing main loop freeze when server is unreachable.
       - Local REST API on Port 80 with complete CORS headers.
  ==============================================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// Universal ArduinoJson v6 and v7 Compatibility
#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
  typedef JsonDocument FreshGuardJsonDoc;
#else
  typedef StaticJsonDocument<1024> FreshGuardJsonDoc;
#endif

// ======================== PIN ASSIGNMENTS ====================================
// Sensor: DHT11 (Temperature & Relative Humidity)
#define DHTPIN               4      // GPIO 4
#define DHTTYPE              DHT11  // DHT11 sensor type

// Sensor: MQ Gas Sensor (Ethylene C2H4 Analog — ESP32 ADC1, 12-bit: 0-4095)
#define MQ_PIN               34     // GPIO 34 (ADC1_CH6)

// Sensor: IR Safety Door Interlock
#define IR_DOOR_PIN          14     // GPIO 14 (INPUT_PULLUP)
#define DOOR_IS_OPEN_LEVEL   HIGH   // HIGH when beam broken / door open

// Sensor: TTP223 Capacitive Bezel Touch
#define TOUCH_PIN            13     // GPIO 13

// Actuator Relays (Active LOW for standard optocoupled relay boards)
#define RELAY_ACTIVE_LEVEL   LOW
#define RELAY_INACTIVE_LEVEL HIGH

#define RELAY_INLET_FAN      16     // GPIO 16 (HEPA Fresh Air Intake)
#define RELAY_OUTLET_FAN     17     // GPIO 17 (C2H4 Catalytic Scrubber)
#define RELAY_HUMIDIFIER     5      // GPIO 5  (1.7MHz Ultrasonic Atomizer)
#define RELAY_BLUE_LED       18     // GPIO 18 (450nm Blue LED / Status Blinker)
#define RELAY_WHITE_LED      19     // GPIO 19 (5000K Inspection Daylight Bar)

// ======================== SOFT-AP & DNS CONSTANTS ============================
#define AP_SSID_NAME         "FreshGuard-Setup"
#define AP_DEFAULT_PASS      ""     // Open network for friction-free phone pairing
const byte DNS_PORT        = 53;

// ======================== STATE MACHINE ENUMS ================================
enum SystemState {
  STATE_NORMAL,
  STATE_DOOR_OPEN,
  STATE_WAIT_5_SECONDS,
  STATE_RESTART,
  STATE_ALERT
};

// ======================== GLOBAL VARIABLES ===================================
SystemState currentState     = STATE_NORMAL;
String systemMode            = "AUTO"; // "AUTO" or "MANUAL"

String deviceId              = "SF-001";
String accountId             = "mshiva5626"; // Bound user account
String serverHost            = "http://192.168.1.100:8080/api/telemetry";

// In-Memory Stored Credentials (prevents repetitive NVS flash reads in loop)
String savedSsid             = "";
String savedPass             = "";
bool   isConfigured          = false;

// Sensor Readings & Hardware Presence Flags
float temperature            = 14.2;
float humidity               = 91.0;
int   gasLevel               = 110;
bool  isDoorOpen             = false;

// Hardware Detection Flags (True if sensor is giving valid physical signals)
bool dhtSensorExists         = false;
bool gasSensorExists         = false;
bool doorSensorExists        = true;

// Glitch filter counters (prevents transient single-read dropouts from toggling relays)
uint8_t dhtFailCount         = 0;
uint8_t gasFailCount         = 0;

// Actuator States
bool inletFanState           = false;
bool outletFanState          = false;
bool humidifierState         = false;
bool blueLedState            = false;
bool whiteLedState           = false;

// Visual Pairing & Status Indicator (Flashing Blue LED on GPIO 18)
bool isPairingMode                  = true;
unsigned long lastPairingBlink      = 0;
const unsigned long PAIRING_BLINK_MS = 350; // 350ms rhythmic flash during pairing mode

// Configurable Botanical Thresholds (Stored in NVS)
float tempMinThreshold       = 1.0;
float tempMaxThreshold       = 4.0;
float humidityMinThreshold   = 90.0;
float humidityMaxThreshold   = 95.0;
int   gasThresholdPpm        = 230;

// Timing variables
unsigned long doorClosedTimestamp   = 0;
const unsigned long RECOVERY_DELAY_MS = 5000;  // 5s chamber stabilization
unsigned long lastTelemetryUpload    = 0;
const unsigned long TELEMETRY_INTERVAL = 2500; // 2.5s upload loop
unsigned long lastWiFiReconnectCheck = 0;
const unsigned long WIFI_RETRY_MS     = 10000; // Retry WiFi every 10s if disconnected

// Touch sensor robust software debouncing & long-press reset
int  lastRawTouchState               = LOW;
unsigned long touchPressStart        = 0;
bool touchLongPressHandled           = false;

// Door sensor debounce
bool lastRawDoorState                = false;
unsigned long lastDoorDebounce       = 0;

// Asynchronous flags
volatile bool pendingWiFiConnect     = false;
volatile bool pendingUnpair          = false;

// Networking Objects
DHT dht(DHTPIN, DHTTYPE);
WebServer localServer(80);
DNSServer dnsServer;
Preferences preferences;
IPAddress apIP(192, 168, 4, 1);
IPAddress netMsk(255, 255, 255, 0);

// Forward declarations
void setRelay(uint8_t pin, bool state);
void readSensors();
bool checkDoorStatus();
void handleDoorWorkflow();
void executeAutoClimateControl();
void handleTouchSensor();
void uploadTelemetry();
void setupHttpServerRoutes();
bool connectToWiFi(const char* ssid, const char* password);
void startPairingModeAP();
void unpairAndResetToAP();
void loadThresholdsFromNVS();
void saveThresholdsToNVS();
void sendCORSHeaders();
bool parseRelayState(JsonVariant v);
void handlePortalRoot();
void handleScanWifi();
void handleWifiConfigApi();

// ======================== EMBEDDED SETUP WEB PORTAL HTML =====================
const char SETUP_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>FreshGuard Vault Setup</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #131d2e;
      --accent: #10b981;
      --accent-hover: #059669;
      --text: #f8fafc;
      --muted: #94a3b8;
      --border: #1e293b;
      --input-bg: #0f172a;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: var(--bg); color: var(--text); display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 20px; padding: 28px 24px; width: 100%; max-width: 440px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
    .header { text-align: center; margin-bottom: 24px; }
    .logo-badge { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; background: rgba(16,185,129,0.15); border-radius: 16px; color: var(--accent); margin-bottom: 12px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
    p.subtitle { font-size: 13px; color: var(--muted); line-height: 1.4; }
    .status-pill { display: inline-flex; align-items: center; gap: 6px; background: rgba(16,185,129,0.12); color: var(--accent); padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 600; margin-top: 10px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.85); } }
    .form-group { margin-bottom: 16px; }
    label { display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; }
    input, select { width: 100%; background: var(--input-bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; color: var(--text); font-size: 14px; outline: none; transition: border-color 0.2s; }
    input:focus, select:focus { border-color: var(--accent); }
    .btn { display: block; width: 100%; background: var(--accent); color: #022c22; font-weight: 700; font-size: 14px; padding: 14px; border: none; border-radius: 14px; cursor: pointer; text-align: center; margin-top: 20px; transition: background 0.2s, transform 0.1s; }
    .btn:active { transform: scale(0.98); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .scan-btn { background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: var(--text); padding: 8px 12px; border-radius: 8px; font-size: 12px; cursor: pointer; margin-top: 6px; width: auto; display: inline-block; }
    .notice { font-size: 11px; color: var(--muted); text-align: center; margin-top: 16px; line-height: 1.5; }
    #status-msg { display: none; margin-top: 16px; padding: 12px; border-radius: 12px; font-size: 12px; text-align: center; }
    .success-msg { background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.3); }
    .error-msg { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo-badge">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      </div>
      <h1>FreshGuard Botanical Vault</h1>
      <p class="subtitle">Precision Chamber Setup & Account Binding</p>
      <div class="status-pill">
        <span class="dot"></span>
        Setup Hotspot Active (192.168.4.1)
      </div>
    </div>

    <form id="setupForm">
      <div class="form-group">
        <label for="ssid">2.4GHz Wi-Fi Network Name (SSID)</label>
        <input type="text" id="ssid" name="ssid" placeholder="Enter or select your Wi-Fi name" required>
        <button type="button" class="scan-btn" id="scanBtn" onclick="scanNetworks()">Scan Visible Networks</button>
      </div>

      <div class="form-group">
        <label for="password">Wi-Fi Password</label>
        <input type="password" id="password" name="password" placeholder="Wi-Fi Password (leave blank if open)">
      </div>

      <div class="form-group">
        <label for="account_id">User Account ID</label>
        <input type="text" id="account_id" name="account_id" value="mshiva5626" required>
      </div>

      <div class="form-group">
        <label for="device_id">Device Hardware ID</label>
        <input type="text" id="device_id" name="device_id" value="SF-001" required>
      </div>

      <div class="form-group">
        <label for="server">Cloud Telemetry URL</label>
        <input type="text" id="server" name="server" value="http://192.168.1.100:8080/api/telemetry" required>
      </div>

      <button type="submit" class="btn" id="submitBtn">Connect Chamber to Wi-Fi</button>
    </form>

    <div id="status-msg"></div>

    <p class="notice">
      Once connected, the chamber will turn off its setup hotspot, link to your account, and stream botanical telemetry.
    </p>
  </div>

  <script>
    const params = new URLSearchParams(window.location.search);
    if (params.get('account')) document.getElementById('account_id').value = params.get('account');
    if (params.get('device')) document.getElementById('device_id').value = params.get('device');

    async function scanNetworks() {
      const btn = document.getElementById('scanBtn');
      btn.innerText = 'Scanning...';
      btn.disabled = true;
      try {
        const res = await fetch('/scan-wifi');
        const data = await res.json();
        if (data.networks && data.networks.length > 0) {
          let select = document.getElementById('netSelect');
          if (!select) {
            select = document.createElement('select');
            select.id = 'netSelect';
            select.style.marginTop = '8px';
            select.onchange = function() {
              if (this.value) document.getElementById('ssid').value = this.value;
            };
            btn.parentNode.insertBefore(select, btn.nextSibling);
          }
          select.innerHTML = '<option value="">-- Select Scanned Network --</option>';
          data.networks.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n.ssid;
            opt.innerText = n.ssid + ' (' + n.rssi + ' dBm)' + (n.secure ? ' 🔒' : '');
            select.appendChild(opt);
          });
          btn.innerText = 'Scan Complete (' + data.networks.length + ' found)';
        } else {
          btn.innerText = 'No networks detected (Rescan)';
        }
      } catch (e) {
        btn.innerText = 'Scan error (Type manually)';
      } finally {
        btn.disabled = false;
      }
    }

    document.getElementById('setupForm').onsubmit = async function(e) {
      e.preventDefault();
      const submitBtn = document.getElementById('submitBtn');
      const statusMsg = document.getElementById('status-msg');
      submitBtn.disabled = true;
      submitBtn.innerText = 'Transmitting to Flash NVS...';

      const payload = {
        ssid: document.getElementById('ssid').value.trim(),
        password: document.getElementById('password').value,
        account_id: document.getElementById('account_id').value.trim(),
        device_id: document.getElementById('device_id').value.trim(),
        server: document.getElementById('server').value.trim()
      };

      try {
        const res = await fetch('/api/wifi-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        statusMsg.style.display = 'block';
        statusMsg.className = 'success-msg';
        statusMsg.innerHTML = '<strong>Credentials Stored!</strong><br>Chamber is now connecting to ' + payload.ssid + '. Once connected, return to your FreshGuard Web App to monitor your produce vault.';
        submitBtn.innerText = 'Connecting...';
      } catch (err) {
        statusMsg.style.display = 'block';
        statusMsg.className = 'error-msg';
        statusMsg.innerText = 'Error sending credentials. Please try again.';
        submitBtn.disabled = false;
        submitBtn.innerText = 'Connect Chamber to Wi-Fi';
      }
    };
  </script>
</body>
</html>
)rawliteral";

// ======================== RELAY STATE PARSER =================================
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

// ======================== CORS HELPER ========================================
void sendCORSHeaders() {
  localServer.sendHeader("Access-Control-Allow-Origin", "*");
  localServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  localServer.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
  localServer.sendHeader("Access-Control-Max-Age", "86400");
}

// ======================== RELAY CONTROL HELPER ===============================
void setRelay(uint8_t pin, bool state) {
  digitalWrite(pin, state ? RELAY_ACTIVE_LEVEL : RELAY_INACTIVE_LEVEL);
}

// ======================== CAPTIVE PORTAL DETECTION ===========================
bool isIp(String str) {
  for (size_t i = 0; i < str.length(); i++) {
    int c = str.charAt(i);
    if (c != '.' && (c < '0' || c > '9')) {
      return false;
    }
  }
  return true;
}

void handlePortalRoot() {
  if (isPairingMode) {
    String host = localServer.hostHeader();
    if (!isIp(host) && host.indexOf("192.168.4.1") < 0) {
      localServer.sendHeader("Location", "http://192.168.4.1/", true);
      localServer.send(302, "text/plain", "");
      return;
    }
    localServer.send(200, "text/html", SETUP_HTML);
  } else {
    localServer.send(200, "text/html", SETUP_HTML);
  }
}

// ======================== WI-FI SCANNER API ==================================
void handleScanWifi() {
  sendCORSHeaders();
  int n = WiFi.scanNetworks();
  String json = "{\"networks\":[";
  for (int i = 0; i < n; ++i) {
    if (i > 0) json += ",";
    json += "{\"ssid\":\"" + WiFi.SSID(i) + "\",\"rssi\":" + String(WiFi.RSSI(i)) + ",\"secure\":" + ((WiFi.encryptionType(i) != WIFI_AUTH_OPEN) ? "true" : "false") + "}";
  }
  json += "]}";
  localServer.send(200, "application/json", json);
}

// ======================== WI-FI CONFIG INGESTION =============================
void handleWifiConfigApi() {
  sendCORSHeaders();
  String newSsid = "";
  String newPass = "";
  String newAccount = "";
  String newDeviceId = "";
  String newServer = "";

  if (localServer.hasArg("plain")) {
    FreshGuardJsonDoc doc;
    DeserializationError err = deserializeJson(doc, localServer.arg("plain"));
    if (!err) {
      if (!doc["ssid"].isNull())       newSsid = doc["ssid"].as<String>();
      if (!doc["password"].isNull())   newPass = doc["password"].as<String>();
      if (!doc["account_id"].isNull()) newAccount = doc["account_id"].as<String>();
      else if (!doc["account"].isNull()) newAccount = doc["account"].as<String>();
      if (!doc["device_id"].isNull())  newDeviceId = doc["device_id"].as<String>();
      if (!doc["server"].isNull())     newServer = doc["server"].as<String>();
    }
  }

  // Fallback to form parameters if submitted via basic HTML form
  if (newSsid.length() == 0 && localServer.hasArg("ssid")) {
    newSsid = localServer.arg("ssid");
    if (localServer.hasArg("password"))   newPass = localServer.arg("password");
    if (localServer.hasArg("account_id")) newAccount = localServer.arg("account_id");
    else if (localServer.hasArg("account")) newAccount = localServer.arg("account");
    if (localServer.hasArg("device_id"))  newDeviceId = localServer.arg("device_id");
    if (localServer.hasArg("server"))     newServer = localServer.arg("server");
  }

  if (newSsid.length() == 0) {
    localServer.send(400, "application/json", "{\"error\":\"Missing SSID\"}");
    return;
  }

  // Persist to Flash NVS via Preferences
  preferences.begin("freshguard", false);
  preferences.putString("ssid", newSsid);
  preferences.putString("password", newPass);
  if (newAccount.length() > 0) {
    preferences.putString("account_id", newAccount);
    accountId = newAccount;
  }
  if (newDeviceId.length() > 0) {
    preferences.putString("device_id", newDeviceId);
    deviceId = newDeviceId;
  }
  if (newServer.length() > 0) {
    preferences.putString("server", newServer);
    serverHost = newServer;
  }
  preferences.putBool("configured", true);
  preferences.end();

  savedSsid = newSsid;
  savedPass = newPass;
  isConfigured = true;

  Serial.printf("\n[NVS] Stored Wi-Fi SSID '%s' & Bound Account '%s' securely to Flash!\n",
                savedSsid.c_str(), accountId.c_str());

  localServer.send(200, "application/json", 
    "{\"status\":\"ok\",\"message\":\"Credentials saved to Flash. Connecting to Wi-Fi...\",\"account_id\":\"" + accountId + "\",\"device_id\":\"" + deviceId + "\"}");

  pendingWiFiConnect = true;
}

// ======================== SOFT-AP PAIRING MODE STARTER ======================
void startPairingModeAP() {
  isPairingMode = true;
  lastPairingBlink = millis();

  Serial.println("\n[Pairing Mode] Starting FreshGuard SoftAP & DNS Captive Portal...");
  WiFi.disconnect();
  delay(100);
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(apIP, apIP, netMsk);
  WiFi.softAP(AP_SSID_NAME, AP_DEFAULT_PASS);

  delay(200);

  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(DNS_PORT, "*", apIP);

  localServer.begin();

  Serial.println("=======================================================");
  Serial.println("  FreshGuard AP Pairing Mode Active!");
  Serial.print("  Wi-Fi SSID:     "); Serial.println(AP_SSID_NAME);
  Serial.print("  Local Gateway:  http://"); Serial.println(WiFi.softAPIP());
  Serial.println("  Wi-Fi QR Code:  WIFI:S:FreshGuard-Setup;T:nopass;;");
  Serial.println("  Awaiting phone connection or setup submission...");
  Serial.println("=======================================================\n");
}

// ======================== FACTORY UNPAIR & AP RESET ==========================
void unpairAndResetToAP() {
  Serial.println("\n[UNPAIR] >>> Deleting WiFi and Account credentials from Flash NVS! <<<");
  
  // Wipe stored credentials from Preferences
  preferences.begin("freshguard", false);
  preferences.clear();
  preferences.putBool("configured", false);
  preferences.end();

  // Reset in-memory identifiers and state
  savedSsid    = "";
  savedPass    = "";
  isConfigured = false;
  accountId    = "unpaired";
  systemMode   = "AUTO";

  // Safely turn off active climate actuators
  inletFanState   = false;
  outletFanState  = false;
  humidifierState = false;
  blueLedState    = false;
  whiteLedState   = false;
  setRelay(RELAY_INLET_FAN, false);
  setRelay(RELAY_OUTLET_FAN, false);
  setRelay(RELAY_HUMIDIFIER, false);
  setRelay(RELAY_BLUE_LED, false);
  setRelay(RELAY_WHITE_LED, false);

  // Restart SoftAP for new pairing
  startPairingModeAP();

  Serial.println("[STATUS] >>> Chamber successfully unpaired! Blue LED flashing for setup. <<<");
}

// ======================== NVS THRESHOLD HELPERS ==============================
void loadThresholdsFromNVS() {
  preferences.begin("fg_thresholds", true);
  tempMinThreshold     = preferences.getFloat("t_min", 1.0);
  tempMaxThreshold     = preferences.getFloat("t_max", 4.0);
  humidityMinThreshold = preferences.getFloat("h_min", 90.0);
  humidityMaxThreshold = preferences.getFloat("h_max", 95.0);
  gasThresholdPpm      = preferences.getInt("g_th", 230);
  preferences.end();

  Serial.printf("[NVS] Loaded Thresholds: Temp %.1f-%.1f C, RH %.1f-%.1f %%, Gas <%d\n",
                tempMinThreshold, tempMaxThreshold,
                humidityMinThreshold, humidityMaxThreshold,
                gasThresholdPpm);
}

void saveThresholdsToNVS() {
  preferences.begin("fg_thresholds", false);
  preferences.putFloat("t_min", tempMinThreshold);
  preferences.putFloat("t_max", tempMaxThreshold);
  preferences.putFloat("h_min", humidityMinThreshold);
  preferences.putFloat("h_max", humidityMaxThreshold);
  preferences.putInt("g_th", gasThresholdPpm);
  preferences.end();

  Serial.println("[NVS] Botanical thresholds successfully persisted to Flash.");
}

// ======================== WIFI CONNECTION HELPER =============================
bool connectToWiFi(const char* ssid, const char* password) {
  Serial.print("\n[WiFi] Connecting to SSID: ");
  Serial.println(ssid);

  WiFi.disconnect();
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    // Smoothly toggle blue LED while attempting connection
    blueLedState = !blueLedState;
    setRelay(RELAY_BLUE_LED, blueLedState);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] >>> Wi-Fi Connected Successfully! <<<");
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("[WiFi] RSSI Signal: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");

    // Close SoftAP and DNS server once connected to station
    dnsServer.stop();
    WiFi.softAPdisconnect(true);

    isPairingMode = false;
    blueLedState = false;
    setRelay(RELAY_BLUE_LED, false);

    // Ensure Local REST Server is running on new station IP
    localServer.begin();
    return true;
  } else {
    Serial.println("\n[WiFi] Connection timed out or authentication failed.");
    return false;
  }
}

// ======================== LOCAL HTTP SERVER ROUTES ===========================
void setupHttpServerRoutes() {
  // Global OPTIONS handler for CORS preflight
  localServer.onNotFound([]() {
    if (localServer.method() == HTTP_OPTIONS) {
      sendCORSHeaders();
      localServer.send(204, "text/plain", "");
      return;
    }
    if (isPairingMode) {
      handlePortalRoot();
      return;
    }
    sendCORSHeaders();
    localServer.send(404, "application/json", "{\"error\":\"Not Found\"}");
  });

  // Portal & Captive redirects
  localServer.on("/", HTTP_GET, handlePortalRoot);
  localServer.on("/setup", HTTP_GET, handlePortalRoot);
  localServer.on("/generate_204", HTTP_GET, handlePortalRoot);
  localServer.on("/hotspot-detect.html", HTTP_GET, handlePortalRoot);
  localServer.on("/ncsi.txt", HTTP_GET, handlePortalRoot);
  localServer.on("/connecttest.txt", HTTP_GET, handlePortalRoot);
  localServer.on("/redirect", HTTP_GET, handlePortalRoot);

  // GET /scan-wifi: Scans and returns nearby 2.4GHz networks
  localServer.on("/scan-wifi", HTTP_OPTIONS, []() {
    sendCORSHeaders();
    localServer.send(204, "text/plain", "");
  });
  localServer.on("/scan-wifi", HTTP_GET, handleScanWifi);

  // POST /api/wifi-config: Receives credentials from Web Portal or Web App
  localServer.on("/api/wifi-config", HTTP_OPTIONS, []() {
    sendCORSHeaders();
    localServer.send(204, "text/plain", "");
  });
  localServer.on("/api/wifi-config", HTTP_POST, handleWifiConfigApi);
  localServer.on("/config", HTTP_POST, handleWifiConfigApi);

  // GET /status: Returns current telemetry, account info, and hardware flags
  localServer.on("/status", HTTP_OPTIONS, []() {
    sendCORSHeaders();
    localServer.send(204, "text/plain", "");
  });

  localServer.on("/status", HTTP_GET, []() {
    sendCORSHeaders();
    FreshGuardJsonDoc doc;
    doc["device_id"]   = deviceId;
    doc["account_id"]  = accountId;
    doc["configured"]  = isConfigured;
    doc["pairing_mode"] = isPairingMode;
    doc["door_status"] = isDoorOpen ? "OPEN" : "CLOSED";
    doc["state"]       = (currentState == STATE_DOOR_OPEN) ? "DOOR_OPEN" :
                         (currentState == STATE_WAIT_5_SECONDS) ? "WAIT_5_SECONDS" :
                         (currentState == STATE_ALERT) ? "ALERT" : "NORMAL";
    doc["system_mode"] = systemMode;

    doc["dht_exists"]  = dhtSensorExists;
    doc["gas_exists"]  = gasSensorExists;
    doc["door_exists"] = doorSensorExists;

    if (dhtSensorExists) {
      doc["temperature"] = round(temperature * 10.0) / 10.0;
      doc["humidity"]    = round(humidity * 10.0) / 10.0;
    } else {
      doc["temperature"] = nullptr;
      doc["humidity"]    = nullptr;
    }

    if (gasSensorExists) {
      doc["gas_level"]   = gasLevel;
    } else {
      doc["gas_level"]   = nullptr;
    }

    doc["inlet_fan"]   = inletFanState ? "ON" : "OFF";
    doc["outlet_fan"]  = outletFanState ? "ON" : "OFF";
    doc["humidifier"]  = humidifierState ? "ON" : "OFF";
    doc["blue_led"]    = blueLedState ? "ON" : "OFF";
    doc["white_led"]   = whiteLedState ? "ON" : "OFF";
    doc["dht_type"]    = "DHT11";
    doc["wifi_rssi"]   = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : 0;
    doc["ip"]          = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP().toString() : WiFi.softAPIP().toString();

    doc["thresholds"]["temp_min"]      = tempMinThreshold;
    doc["thresholds"]["temp_max"]      = tempMaxThreshold;
    doc["thresholds"]["humidity_min"]  = humidityMinThreshold;
    doc["thresholds"]["humidity_max"]  = humidityMaxThreshold;
    doc["thresholds"]["gas_threshold"] = gasThresholdPpm;

    String res;
    serializeJson(doc, res);
    localServer.send(200, "application/json", res);
  });

  // POST /control: Manual control of relays from Web App
  localServer.on("/control", HTTP_OPTIONS, []() {
    sendCORSHeaders();
    localServer.send(204, "text/plain", "");
  });

  localServer.on("/control", HTTP_POST, []() {
    sendCORSHeaders();
    if (localServer.hasArg("plain")) {
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
          if (systemMode == "AUTO" && !isDoorOpen) {
            executeAutoClimateControl();
          }
        }
      }

      // Climate actuators: ONLY controllable in MANUAL mode and when door is CLOSED (Safety Interlock)
      if (systemMode == "MANUAL" && !isDoorOpen) {
        if (!doc["inlet_fan"].isNull()) {
          inletFanState = parseRelayState(doc["inlet_fan"]);
          setRelay(RELAY_INLET_FAN, inletFanState);
        }
        if (!doc["outlet_fan"].isNull()) {
          outletFanState = parseRelayState(doc["outlet_fan"]);
          setRelay(RELAY_OUTLET_FAN, outletFanState);
        }
        if (!doc["humidifier"].isNull()) {
          humidifierState = parseRelayState(doc["humidifier"]);
          setRelay(RELAY_HUMIDIFIER, humidifierState);
        }
      }

      // Lighting actuators: controllable in both AUTO and MANUAL mode
      if (!doc["white_led"].isNull()) {
        whiteLedState = parseRelayState(doc["white_led"]);
        setRelay(RELAY_WHITE_LED, whiteLedState);
      }
      if (!doc["blue_led"].isNull()) {
        isPairingMode = false;
        blueLedState = parseRelayState(doc["blue_led"]);
        setRelay(RELAY_BLUE_LED, blueLedState);
      }

      localServer.send(200, "application/json", "{\"status\":\"ok\",\"mode\":\"" + systemMode + "\"}");
      uploadTelemetry();
    } else {
      localServer.send(400, "application/json", "{\"error\":\"Missing request body\"}");
    }
  });

  // POST /thresholds: Update botanical thresholds locally & persist to Flash NVS
  localServer.on("/thresholds", HTTP_OPTIONS, []() {
    sendCORSHeaders();
    localServer.send(204, "text/plain", "");
  });

  localServer.on("/thresholds", HTTP_POST, []() {
    sendCORSHeaders();
    if (localServer.hasArg("plain")) {
      FreshGuardJsonDoc doc;
      DeserializationError err = deserializeJson(doc, localServer.arg("plain"));
      if (err) {
        localServer.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
        return;
      }

      if (!doc["temp_min"].isNull())      tempMinThreshold     = doc["temp_min"].as<float>();
      if (!doc["temp_max"].isNull())      tempMaxThreshold     = doc["temp_max"].as<float>();
      if (!doc["humidity_min"].isNull())  humidityMinThreshold = doc["humidity_min"].as<float>();
      if (!doc["humidity_max"].isNull())  humidityMaxThreshold = doc["humidity_max"].as<float>();
      if (!doc["gas_threshold"].isNull()) gasThresholdPpm      = doc["gas_threshold"].as<int>();

      saveThresholdsToNVS();

      if (systemMode == "AUTO" && !isDoorOpen) {
        executeAutoClimateControl();
      }

      localServer.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Thresholds updated and saved to NVS\"}");
    } else {
      localServer.send(400, "application/json", "{\"error\":\"Missing request body\"}");
    }
  });

  // POST /unpair: Delete stored WiFi/Account credentials and reset to AP pairing mode
  localServer.on("/unpair", HTTP_OPTIONS, []() {
    sendCORSHeaders();
    localServer.send(204, "text/plain", "");
  });

  localServer.on("/unpair", HTTP_POST, []() {
    Serial.println("\n[HTTP Server] Received /unpair command from App!");
    sendCORSHeaders();
    localServer.send(200, "application/json", "{\"status\":\"ok\",\"action\":\"UNPAIR\",\"message\":\"Chamber credentials wiped. SoftAP pairing active.\"}");
    pendingUnpair = true; // Handled asynchronously in loop()
  });

  localServer.begin();
  Serial.println("[HTTP Server] Local REST API started on port 80 with CORS support");
}

// ======================== SETUP ==============================================
void setup() {
  Serial.begin(115200);
  delay(400);

  Serial.println("\n\n=======================================================");
  Serial.println("  Smart FreshGuard - Autonomous Vault Initializing       ");
  Serial.println("  Firmware: Wi-Fi SoftAP & QR Provisioning Architecture  ");
  Serial.println("=======================================================");

  // Set Relay Outputs to Inactive level FIRST before pinMode to prevent startup chatter
  digitalWrite(RELAY_INLET_FAN, RELAY_INACTIVE_LEVEL);
  digitalWrite(RELAY_OUTLET_FAN, RELAY_INACTIVE_LEVEL);
  digitalWrite(RELAY_HUMIDIFIER, RELAY_INACTIVE_LEVEL);
  digitalWrite(RELAY_BLUE_LED, RELAY_INACTIVE_LEVEL);
  digitalWrite(RELAY_WHITE_LED, RELAY_INACTIVE_LEVEL);

  pinMode(RELAY_INLET_FAN, OUTPUT);
  pinMode(RELAY_OUTLET_FAN, OUTPUT);
  pinMode(RELAY_HUMIDIFIER, OUTPUT);
  pinMode(RELAY_BLUE_LED, OUTPUT);
  pinMode(RELAY_WHITE_LED, OUTPUT);

  // ESP32 ADC: Full 0 - 3.3V attenuation for 12-bit analog gas sensor on GPIO 34
  #if defined(ADC_ATTEN_DB_12)
    analogSetPinAttenuation(MQ_PIN, ADC_ATTEN_DB_12);
  #elif defined(ADC_ATTEN_DB_11)
    analogSetPinAttenuation(MQ_PIN, ADC_ATTEN_DB_11);
  #else
    analogSetPinAttenuation(MQ_PIN, ADC_11db);
  #endif
  analogSetAttenuation(ADC_11db);

  // Initialize Sensors
  pinMode(IR_DOOR_PIN, INPUT_PULLUP);
  pinMode(TOUCH_PIN, INPUT);
  dht.begin();
  Serial.println("[Sensors] DHT11 & MQ Ethylene Analog initialized.");

  // Load botanical thresholds from NVS
  loadThresholdsFromNVS();

  // Initialize Local REST HTTP Server routes
  setupHttpServerRoutes();

  // Load Stored WiFi Credentials and Bound Account from Flash (Preferences NVS)
  preferences.begin("freshguard", true); // read-only mode
  isConfigured        = preferences.getBool("configured", false);
  savedSsid           = preferences.getString("ssid", "");
  savedPass           = preferences.getString("password", "");
  String savedServer  = preferences.getString("server", "");
  String savedDevId   = preferences.getString("device_id", "");
  String savedAccount = preferences.getString("account_id", "");
  preferences.end();

  if (savedServer.length() > 0)  serverHost = savedServer;
  if (savedDevId.length() > 0)   deviceId   = savedDevId;
  if (savedAccount.length() > 0) accountId  = savedAccount;

  // Auto-Reconnect Logic (Handles power outage / re-plugging)
  if (isConfigured && savedSsid.length() > 0) {
    Serial.printf("\n[Power Recovery] Found stored WiFi for '%s' & Account '%s'. Auto-reconnecting...\n", 
                  savedSsid.c_str(), accountId.c_str());
    bool ok = connectToWiFi(savedSsid.c_str(), savedPass.c_str());
    if (ok) {
      isPairingMode = false;
      blueLedState = false;
      setRelay(RELAY_BLUE_LED, false);
      Serial.println("[Power Recovery] Reconnected to home Wi-Fi and restored account binding!");
    } else {
      // Keep credentials intact, retry in loop
      Serial.println("[Power Recovery] Temporary connection failure. Keep-alive will retry connecting...");
      isPairingMode = false;
    }
  } else {
    // No Wi-Fi configured: Start SoftAP Pairing Hotspot
    Serial.printf("\n[Provisioning] No WiFi configured. Launching '%s' hotspot (Account '%s')...\n", 
                  AP_SSID_NAME, accountId.c_str());
    startPairingModeAP();
  }

  // Initial door position check
  checkDoorStatus();
  if (isDoorOpen) {
    currentState = STATE_DOOR_OPEN;
    Serial.println("[State] Initial State: DOOR OPEN (Safety Paused)");
  } else {
    currentState = STATE_NORMAL;
    Serial.println("[State] Initial State: NORMAL (Chamber Sealed)");
  }
}

// ======================== MAIN LOOP ==========================================
void loop() {
  // 0. Process asynchronous Wi-Fi connection request from Web Portal
  if (pendingWiFiConnect) {
    pendingWiFiConnect = false;
    delay(500); // Allow HTTP response to finish sending cleanly
    Serial.println("\n[Provisioning] Connecting to user network...");
    bool ok = connectToWiFi(savedSsid.c_str(), savedPass.c_str());
    if (ok) {
      uploadTelemetry(); // Immediate first sync after provisioning
    } else {
      // Re-open AP pairing hotspot if connection failed
      startPairingModeAP();
    }
  }

  // 0.1 Process asynchronous unpair if requested via HTTP
  if (pendingUnpair) {
    pendingUnpair = false;
    unpairAndResetToAP();
  }

  // 0.2 DNS Captive Portal processing when in AP Pairing mode
  if (isPairingMode) {
    dnsServer.processNextRequest();

    // Rhythmic visual blue LED indicator during pairing mode
    if (millis() - lastPairingBlink >= PAIRING_BLINK_MS) {
      lastPairingBlink = millis();
      blueLedState = !blueLedState;
      setRelay(RELAY_BLUE_LED, blueLedState);
    }
  }

  // 1. Handle incoming HTTP client requests
  localServer.handleClient();

  // 1.1 Wi-Fi Keep-Alive: If configured but disconnected, retry every 10s (preserves account binding)
  if (!isPairingMode && isConfigured && savedSsid.length() > 0) {
    if (WiFi.status() != WL_CONNECTED) {
      if (millis() - lastWiFiReconnectCheck >= WIFI_RETRY_MS) {
        lastWiFiReconnectCheck = millis();
        Serial.printf("[WiFi Keep-Alive] Reconnecting to '%s' for Account '%s'...\n", savedSsid.c_str(), accountId.c_str());
        WiFi.begin(savedSsid.c_str(), savedPass.c_str());
      }
    }
  }

  // 2. Read Capacitive Bezel Touch Sensor (Tap: White LED | 7s Hold: Hardware Factory Reset)
  handleTouchSensor();

  // 3. Read IR Safety Door Sensor and run 5s Stabilization State Machine
  handleDoorWorkflow();

  // 4. Autonomous Climate Control Algorithm (runs during NORMAL and ALERT states)
  if ((currentState == STATE_NORMAL || currentState == STATE_ALERT) && systemMode == "AUTO") {
    executeAutoClimateControl();
  }

  // 5. Periodic Telemetry Upload to Web App
  if (millis() - lastTelemetryUpload >= TELEMETRY_INTERVAL) {
    lastTelemetryUpload = millis();
    readSensors();
    uploadTelemetry();
  }
}

// ======================== SENSOR READING =====================================
void readSensors() {
  // Read DHT11 Temperature & Relative Humidity
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (!isnan(h) && !isnan(t) && h >= 1.0 && h <= 100.0) {
    humidity = h;
    temperature = t;
    dhtSensorExists = true;
    dhtFailCount = 0;
  } else {
    dhtFailCount++;
    if (dhtFailCount >= 3) {
      dhtSensorExists = false;
    }
  }

  // Read MQ Gas Sensor (ESP32 ADC1 is 12-bit: 0-4095)
  int rawGas = analogRead(MQ_PIN);
  if (rawGas > 25 && rawGas < 4085) {
    gasLevel = rawGas >> 2; // Map 12-bit (0-4095) to 0-1023 reference
    gasSensorExists = true;
    gasFailCount = 0;
  } else {
    gasFailCount++;
    if (gasFailCount >= 3) {
      gasSensorExists = false;
    }
  }
}

// ======================== DOOR WORKFLOW & SAFETY INTERLOCK ===================
bool checkDoorStatus() {
  int sensorVal = digitalRead(IR_DOOR_PIN);
  bool rawOpen = (sensorVal == DOOR_IS_OPEN_LEVEL);

  if (rawOpen != lastRawDoorState) {
    lastDoorDebounce = millis();
    lastRawDoorState = rawOpen;
  }

  if ((millis() - lastDoorDebounce) >= 40) {
    isDoorOpen = rawOpen;
  }

  return isDoorOpen;
}

void handleDoorWorkflow() {
  bool currentDoorState = checkDoorStatus();

  switch (currentState) {
    case STATE_NORMAL:
    case STATE_ALERT:
      if (currentDoorState == true) { // Door has just OPENED
        Serial.println("\n[SAFETY INTERLOCK] >>> IR BEAM BROKEN / DOOR OPEN DETECTED! <<<");
        currentState = STATE_DOOR_OPEN;
        
        // Immediately halt active climate devices to prevent chamber air escape
        inletFanState = false;
        outletFanState = false;
        humidifierState = false;
        setRelay(RELAY_INLET_FAN, false);
        setRelay(RELAY_OUTLET_FAN, false);
        setRelay(RELAY_HUMIDIFIER, false);
        
        Serial.println("[Actuators] Inlet Fan: OFF, Outlet Fan: OFF, Mist: OFF (SAFE)");
        Serial.println("[State] System PAUSED. Awaiting door closure.");
        
        uploadTelemetry();
      }
      break;

    case STATE_DOOR_OPEN:
      if (currentDoorState == false) { // Door has just CLOSED
        Serial.println("\n[DOOR] >>> DOOR CLOSED DETECTED! <<<");
        Serial.println("[Timer] Starting 5-second chamber stabilization countdown...");
        currentState = STATE_WAIT_5_SECONDS;
        doorClosedTimestamp = millis();
      }
      break;

    case STATE_WAIT_5_SECONDS:
      // Failsafe check: Did the door re-open during countdown?
      if (currentDoorState == true) {
        Serial.println("\n[SAFETY] >>> DOOR RE-OPENED DURING COUNTDOWN! CANCELLING TIMER <<<");
        currentState = STATE_DOOR_OPEN;
        inletFanState = false;
        outletFanState = false;
        humidifierState = false;
        setRelay(RELAY_INLET_FAN, false);
        setRelay(RELAY_OUTLET_FAN, false);
        setRelay(RELAY_HUMIDIFIER, false);
        return;
      }

      // Check if 5000ms delay has elapsed
      if (millis() - doorClosedTimestamp >= RECOVERY_DELAY_MS) {
        Serial.println("\n[RECOVERY] >>> 5 SECONDS ELAPSED! CHAMBER STABILIZED <<<");
        
        readSensors();
        currentState = STATE_NORMAL;
        Serial.println("[State] Resuming Normal Climate Control Workflow.");
        
        if (systemMode == "AUTO") {
          executeAutoClimateControl();
        }
        
        uploadTelemetry();
      }
      break;

    case STATE_RESTART:
      currentState = STATE_NORMAL;
      break;
  }
}

// ======================== AUTOMATIC CLIMATE LOGIC ============================
void executeAutoClimateControl() {
  if (isDoorOpen) return; // Strict safety interlock

  // 1. Ultrasonic Humidity Control (Only if DHT sensor exists)
  if (dhtSensorExists) {
    if (humidity < humidityMinThreshold) {
      humidifierState = true;
      setRelay(RELAY_HUMIDIFIER, true);
    } else if (humidity >= humidityMaxThreshold) {
      humidifierState = false;
      setRelay(RELAY_HUMIDIFIER, false);
    }
  } else {
    humidifierState = false;
    setRelay(RELAY_HUMIDIFIER, false);
  }

  // 2. Gas / Ripening Control (Ethylene Scrubber Extraction)
  // NOTE: Active cooler/chiller is not integrated in this hardware build.
  // Fans are dedicated to catalytic ethylene scrubbing when VOCs rise.
  // Temperature is passively measured via DHT22 for telemetry and alerts.
  if (gasSensorExists && gasLevel > gasThresholdPpm) {
    inletFanState = true;
    outletFanState = true;
    setRelay(RELAY_INLET_FAN, true);
    setRelay(RELAY_OUTLET_FAN, true);
    currentState = STATE_ALERT;
  } else {
    inletFanState = false;
    outletFanState = false;
    setRelay(RELAY_INLET_FAN, false);
    setRelay(RELAY_OUTLET_FAN, false);
    if (currentState == STATE_ALERT) {
      currentState = STATE_NORMAL;
    }
  }
}

// ======================== TOUCH SENSOR LOCAL CONTROL & RESET =================
void handleTouchSensor() {
  int rawReading = digitalRead(TOUCH_PIN);

  if (rawReading == HIGH) {
    if (touchPressStart == 0) {
      touchPressStart = millis();
    } else if (millis() - touchPressStart >= 7000 && !touchLongPressHandled) {
      touchLongPressHandled = true;
      Serial.println("\n[RESET] >>> Touch held for 7+ seconds! Hardware Reset Triggered! <<<");
      // Rapid visual confirmation flash
      for (int i = 0; i < 6; i++) {
        setRelay(RELAY_BLUE_LED, true);
        delay(70);
        setRelay(RELAY_BLUE_LED, false);
        delay(70);
      }
      unpairAndResetToAP();
    }
  } else {
    if (touchPressStart > 0) {
      unsigned long duration = millis() - touchPressStart;
      if (!touchLongPressHandled && duration > 50 && duration < 3000) {
        // Normal short tap: toggle white LED
        whiteLedState = !whiteLedState;
        setRelay(RELAY_WHITE_LED, whiteLedState);
        Serial.print("[Touch Sensor] Capacitive Bezel Tap: White LED is now ");
        Serial.println(whiteLedState ? "ON" : "OFF");
        uploadTelemetry();
      }
      touchPressStart = 0;
      touchLongPressHandled = false;
    }
  }
}

// ======================== TELEMETRY UPLOAD (REST API) ========================
void uploadTelemetry() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (serverHost.length() < 10) return;
  if (accountId == "unpaired" || accountId.length() == 0) return;

  WiFiClient client;
  WiFiClientSecure clientSecure;
  HTTPClient http;

  http.setTimeout(1500); // 1.5s non-blocking timeout

  bool isHttps = serverHost.startsWith("https://");
  if (isHttps) {
    clientSecure.setInsecure();
    http.begin(clientSecure, serverHost);
  } else {
    http.begin(client, serverHost);
  }

  http.addHeader("Content-Type", "application/json");

  FreshGuardJsonDoc doc;
  doc["device_id"]   = deviceId;
  doc["account_id"]  = accountId;
  doc["door_status"] = isDoorOpen ? "OPEN" : "CLOSED";
  doc["state"]       = (currentState == STATE_DOOR_OPEN) ? "DOOR_OPEN" :
                       (currentState == STATE_WAIT_5_SECONDS) ? "WAIT_5_SECONDS" :
                       (currentState == STATE_ALERT) ? "ALERT" : "NORMAL";

  doc["dht_exists"]  = dhtSensorExists;
  doc["gas_exists"]  = gasSensorExists;
  doc["door_exists"] = doorSensorExists;

  if (dhtSensorExists) {
    doc["temperature"] = round(temperature * 10.0) / 10.0;
    doc["humidity"]    = round(humidity * 10.0) / 10.0;
  } else {
    doc["temperature"] = nullptr;
    doc["humidity"]    = nullptr;
  }

  if (gasSensorExists) {
    doc["gas_level"]   = gasLevel;
  } else {
    doc["gas_level"]   = nullptr;
  }

  doc["system_mode"] = systemMode;
  doc["inlet_fan"]   = inletFanState ? "ON" : "OFF";
  doc["outlet_fan"]  = outletFanState ? "ON" : "OFF";
  doc["humidifier"]  = humidifierState ? "ON" : "OFF";
  doc["blue_led"]    = blueLedState ? "ON" : "OFF";
  doc["white_led"]   = whiteLedState ? "ON" : "OFF";

  String requestBody;
  serializeJson(doc, requestBody);

  int httpCode = http.POST(requestBody);
  if (httpCode > 0) {
    Serial.printf("[HTTP POST] Code: %d, Data sent for account '%s'\n", httpCode, accountId.c_str());
  } else {
    Serial.printf("[HTTP POST] Upload error: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}
