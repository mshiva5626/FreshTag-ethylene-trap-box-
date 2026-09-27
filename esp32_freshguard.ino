/*
  ==============================================================================
    Smart FreshGuard - ESP32 Firmware with Bluetooth (BLE) Provisioning
    Autonomous Botanical Precision Storage Chamber for Fruits and Vegetables
    
    HARDWARE PIN ASSIGNMENTS (UNCHANGED):
    - DHT11 Sensor (Temperature & Relative Humidity):   GPIO 4
    - MQ Gas Sensor (Ethylene / C2H4 / VOC Analog):      GPIO 34 (ADC1_CH6)
    - IR Safety Door Sensor (Optical Beam Interlock):    GPIO 14 (INPUT_PULLUP)
    - TTP223 Capacitive Touch Sensor (Bezel Light Tap):  GPIO 13
    - Relay 1: Inlet HEPA Fan (Air Intake):             GPIO 16 (Active LOW)
    - Relay 2: Outlet Purge / Catalytic Scrubber Fan:    GPIO 17 (Active LOW)
    - Relay 3: 1.7MHz Ultrasonic Humidifier Mist:       GPIO 5  (Active LOW)
    - Relay 4: 5000K Daylight Inspection LED:           GPIO 19 (Active LOW)
    - Relay 5: 450nm Antimicrobial Blue LED / BLE Blinker: GPIO 18 (Active LOW)

    KEY CAPABILITIES:
    1. Bluetooth Low Energy (BLE) Provisioning (Service 4fafc201...):
       - Scan name: "FreshGuard" / "FreshGuard-Vault-ESP32"
       - Web Bluetooth API pairing directly from Laptop/Mobile browser.
       - Auto-reconnect on boot using Preferences (NVS Flash).
       - Decoupled asynchronous handling preventing Bluetooth stack watchdog timeouts.
       - Adheres strictly to 31-byte advertising packet limits (no "adv data too long" errors).
    2. Local REST API on Port 80 with Full CORS Headers:
       - GET  /status      -> Returns telemetry, thresholds, and relay status
       - POST /control     -> Manual relay override & AUTO/MANUAL mode toggle
       - POST /thresholds  -> Dynamic threshold tuning (temp, humidity, gas)
       - POST /unpair      -> Wipes stored WiFi & Account NVS, resets to BLE
       - OPTIONS /*        -> Complete CORS preflight handling for web browsers
    3. Autonomous Climate PID & Interlock:
       - 5-Second Chamber Stabilization countdown when door closes.
       - Immediate actuator lockout when door is open.
       - Automated catalytic ethylene purge when gas index > threshold.
       - Resilient state machine preventing lockouts during ALERT state recovery.
       - Ultrasonic misting automation when humidity < target.
    4. Periodic Cloud Telemetry Upload:
       - HTTP POST every 2500ms to /api/telemetry matching FreshGuard contract.
       - Non-blocking 1.5s timeout preventing main loop freeze when server is unreachable.
       - Supports both HTTP and HTTPS endpoints.
  ==============================================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// Universal ArduinoJson v6 and v7 Compatibility
#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
  typedef JsonDocument FreshGuardJsonDoc;
#else
  typedef StaticJsonDocument<1024> FreshGuardJsonDoc;
#endif

// ======================== PIN ASSIGNMENTS (UNCHANGED) ========================
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
#define RELAY_BLUE_LED       18     // GPIO 18 (450nm Antimicrobial Blue Light)
#define RELAY_WHITE_LED      19     // GPIO 19 (5000K Inspection Daylight Bar)

// ======================== BLE GATT UUIDs =============================
#define BLE_DEVICE_NAME        "FreshGuard-Vault-ESP32"
#define SERVICE_UUID           "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHAR_WIFI_CONFIG_UUID  "beb5483e-36e1-4688-b7f5-ea07361b26a8" // Write (JSON)
#define CHAR_STATUS_UUID       "1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e" // Read / Notify

// ======================== STATE MACHINE ENUMS ========================
enum SystemState {
  STATE_NORMAL,
  STATE_DOOR_OPEN,
  STATE_WAIT_5_SECONDS,
  STATE_RESTART,
  STATE_ALERT
};

// ======================== GLOBAL VARIABLES ===========================
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
int gasLevel                 = 110;
bool isDoorOpen              = false;

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

// Visual Pairing Indicator (Flashing Blue LED on GPIO 18)
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

// Touch sensor robust software debouncing
int  lastRawTouchState               = LOW;
int  debouncedTouchState             = LOW;
unsigned long lastTouchDebounce      = 0;

// Door sensor debounce
bool lastRawDoorState                = false;
unsigned long lastDoorDebounce       = 0;

// BLE globals & asynchronous decouplers
BLEServer* pServer                  = nullptr;
BLECharacteristic* pStatusChar      = nullptr;
BLECharacteristic* pConfigChar      = nullptr;
bool bleClientConnected             = false;
bool oldBleClientConnected          = false;

// Decoupled asynchronous flags (prevents blocking FreeRTOS Bluetooth stack)
volatile bool pendingWiFiConfig     = false;
String pendingConfigPayload         = "";
volatile bool pendingUnpair         = false;

// Objects
DHT dht(DHTPIN, DHTTYPE);
WebServer localServer(80);
Preferences preferences;

// Forward declarations
void setRelay(uint8_t pin, bool state);
void readSensors();
bool checkDoorStatus();
void handleDoorWorkflow();
void executeAutoClimateControl();
void handleTouchSensor();
void uploadTelemetry();
void setupLocalHttpServer();
bool connectToWiFi(const char* ssid, const char* password);
void sendStatusBLE(String statusMsg);
void processWiFiConfig(String jsonPayload);
void initBLE();
void unpairAndResetToBLE();
void loadThresholdsFromNVS();
void saveThresholdsToNVS();
void sendCORSHeaders();
bool parseRelayState(JsonVariant v);

// ======================== RELAY STATE PARSER =========================
// Handles boolean true/false, integer 1/0, and strings "ON"/"OFF"/"TRUE"/"FALSE"
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

// ======================== CORS HELPER ================================
void sendCORSHeaders() {
  localServer.sendHeader("Access-Control-Allow-Origin", "*");
  localServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  localServer.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
  localServer.sendHeader("Access-Control-Max-Age", "86400");
}

// ======================== BLE CALLBACKS ==============================
class FreshGuardBLEServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override {
    bleClientConnected = true;
    Serial.println("\n[BLE] >>> Client Connected to FreshGuard Bluetooth! <<<");
  }

  void onDisconnect(BLEServer* pServer) override {
    bleClientConnected = false;
    Serial.println("[BLE] Client disconnected.");
  }
};

class FreshGuardConfigCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) override {
    #if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
      String value = pCharacteristic->getValue();
    #else
      String value = String(pCharacteristic->getValue().c_str());
    #endif

    if (value.length() > 0) {
      Serial.printf("\n[BLE Config Write Received] (%d bytes): %s\n", value.length(), value.c_str());
      // Hand off to loop() asynchronously so the FreeRTOS Bluetooth stack is never blocked
      pendingConfigPayload = value;
      pendingWiFiConfig = true;
    }
  }
};

// ======================== BLE HELPER =================================
void sendStatusBLE(String statusMsg) {
  if (pStatusChar != nullptr) {
    pStatusChar->setValue(statusMsg.c_str());
    if (bleClientConnected) {
      pStatusChar->notify();
    }
  }
  Serial.print("[BLE Status Notify] ");
  Serial.println(statusMsg);
}

void initBLE() {
  Serial.println("[BLE] Initializing Bluetooth Low Energy subsystem...");
  BLEDevice::init("FreshGuard");
  BLEDevice::setMTU(517); // Set MTU to 517 to avoid JSON truncation

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new FreshGuardBLEServerCallbacks());

  BLEService* pService = pServer->createService(SERVICE_UUID);

  // Status & Notification characteristic (Read / Notify)
  pStatusChar = pService->createCharacteristic(
    CHAR_STATUS_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pStatusChar->addDescriptor(new BLE2902());
  pStatusChar->setValue("STATUS:BOOT_INITIALIZING");

  // WiFi Configuration characteristic (Write & Write Without Response)
  pConfigChar = pService->createCharacteristic(
    CHAR_WIFI_CONFIG_UUID,
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_WRITE_NR
  );
  pConfigChar->setCallbacks(new FreshGuardConfigCallbacks());

  pService->start();

  // Primary Advertisement Data: Flags + 128-bit Service UUID
  // Flags (3 bytes) + 128-bit UUID (18 bytes) = 21 bytes (Fits safely in 31-byte limit!)
  BLEAdvertisementData advData;
  advData.setFlags(0x06); // General Discoverable + BR/EDR Not Supported
  advData.setCompleteServices(BLEUUID(SERVICE_UUID));

  // Scan Response Data: Device Name
  // Complete Local Name: 2 bytes header + 22 bytes string = 24 bytes (Fits safely in 31-byte limit!)
  BLEAdvertisementData scanData;
  scanData.setName("FreshGuard-Vault-ESP32");

  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->setAdvertisementData(advData);
  pAdvertising->setScanResponseData(scanData);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06); // 7.5ms
  pAdvertising->setMaxPreferred(0x12); // 22.5ms
  BLEDevice::startAdvertising();

  Serial.println("[BLE] Advertising started. Service UUID: " SERVICE_UUID " | Scan Name: FreshGuard-Vault-ESP32");
}

// ======================== FACTORY UNPAIR & BLE RESET =================
void unpairAndResetToBLE() {
  Serial.println("\n[UNPAIR] >>> Deleting WiFi and Account credentials from Flash NVS! <<<");
  
  // Wipe all stored data from Preferences
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

  // Fully disconnect WiFi and clear credentials
  Serial.println("[WiFi] Disconnecting WiFi radio and clearing stored network...");
  WiFi.disconnect(true, true);
  delay(150);
  WiFi.mode(WIFI_STA);

  // Activate pairing mode blue light flashing
  isPairingMode = true;
  lastPairingBlink = millis();

  // Notify connected BLE client
  sendStatusBLE("STATUS:UNPAIRED:READY_FOR_NEW_USER");

  // Restart BLE advertising in fresh pairing mode
  Serial.println("[BLE] Restarting BLE advertising in pairing mode...");
  BLEDevice::startAdvertising();

  Serial.println("[STATUS] >>> Chamber successfully unpaired! Blue LED flashing for pairing. <<<");
}

// ======================== NVS THRESHOLD HELPERS ======================
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

// ======================== NVS CONFIG PROCESSING ======================
void processWiFiConfig(String jsonPayload) {
  FreshGuardJsonDoc doc;
  DeserializationError err = deserializeJson(doc, jsonPayload);
  if (err) {
    Serial.println("[BLE] JSON Parse Error in WiFi config!");
    sendStatusBLE("ERROR:JSON_PARSE");
    return;
  }

  // Check for Unpair / Delete / Reset command
  String actionStr = !doc["action"].isNull() ? doc["action"].as<String>() : "";
  bool unpairFlag  = !doc["unpair"].isNull() ? doc["unpair"].as<bool>() : false;

  if (actionStr == "UNPAIR" || actionStr == "DELETE" || actionStr == "RESET" || unpairFlag) {
    unpairAndResetToBLE();
    return;
  }

  String newSsid    = !doc["ssid"].isNull() ? doc["ssid"].as<String>() : "";
  String newPass    = !doc["password"].isNull() ? doc["password"].as<String>() : "";
  String newServer  = !doc["server"].isNull() ? doc["server"].as<String>() : "";
  String newId      = !doc["device_id"].isNull() ? doc["device_id"].as<String>() : "";
  String newAccount = !doc["account_id"].isNull() ? doc["account_id"].as<String>() :
                      (!doc["account"].isNull() ? doc["account"].as<String>() : "");

  if (newSsid.length() == 0) {
    sendStatusBLE("ERROR:EMPTY_SSID");
    return;
  }

  // Persist to NVS flash memory via Preferences
  preferences.begin("freshguard", false); // read/write mode
  preferences.putString("ssid", newSsid);
  preferences.putString("password", newPass);
  if (newServer.length() > 0) {
    preferences.putString("server", newServer);
    serverHost = newServer;
  }
  if (newId.length() > 0) {
    preferences.putString("device_id", newId);
    deviceId = newId;
  }
  if (newAccount.length() > 0) {
    preferences.putString("account_id", newAccount);
    accountId = newAccount;
  }
  preferences.putBool("configured", true);
  preferences.end();

  // Update in-memory credentials for auto-reconnect
  savedSsid = newSsid;
  savedPass = newPass;
  isConfigured = true;

  Serial.printf("[NVS] WiFi & Account '%s' securely saved to Flash!\n", accountId.c_str());
  sendStatusBLE("STATUS:CONNECTING_TO_WIFI:ACCOUNT:" + accountId);

  // Attempt connection
  bool success = connectToWiFi(newSsid.c_str(), newPass.c_str());
  if (success) {
    isPairingMode = false;
    blueLedState = false;
    setRelay(RELAY_BLUE_LED, false); // Turn off pairing flash upon successful connection
    sendStatusBLE("STATUS:CONNECTED:" + WiFi.localIP().toString() + ":ACCOUNT:" + accountId);
  } else {
    isPairingMode = true; // Keep flashing blue LED if connection failed
    sendStatusBLE("STATUS:WIFI_FAILED:ACCOUNT:" + accountId);
  }
}

// ======================== WIFI CONNECTION HELPER =====================
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
    // Smoothly flash blue LED while connecting
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

    // Ensure Local REST Server is active
    localServer.begin();
    return true;
  } else {
    Serial.println("\n[WiFi] Connection timed out or authentication failed.");
    return false;
  }
}

// ======================== RELAY CONTROL HELPER =======================
void setRelay(uint8_t pin, bool state) {
  digitalWrite(pin, state ? RELAY_ACTIVE_LEVEL : RELAY_INACTIVE_LEVEL);
}

// ======================== SETUP ======================================
void setup() {
  Serial.begin(115200);
  delay(400);

  Serial.println("\n\n=======================================================");
  Serial.println("  Smart FreshGuard - ESP32 Autonomous Vault Initializing ");
  Serial.println("=======================================================");

  // Set Relay Outputs to Inactive level FIRST before pinMode to prevent startup relay chatter
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

  // Initialize Local REST HTTP Server routes once
  setupLocalHttpServer();

  // Initialize BLE Provisioning Subsystem
  initBLE();

  // Load Stored WiFi Credentials and Account from Flash (Preferences NVS)
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
      sendStatusBLE("STATUS:CONNECTED:" + WiFi.localIP().toString() + ":ACCOUNT:" + accountId);
    } else {
      isPairingMode = true; // Flashes blue LED while offline / awaiting pairing
      lastPairingBlink = millis();
      sendStatusBLE("STATUS:WIFI_FAILED:ACCOUNT:" + accountId);
    }
  } else {
    isPairingMode = true; // Flashes blue LED while in BLE pairing mode
    lastPairingBlink = millis();
    Serial.printf("\n[Provisioning] No WiFi configured. Blue LED flashing for Bluetooth pairing (Account '%s')...\n", accountId.c_str());
    sendStatusBLE("STATUS:AWAITING_WIFI_CONFIG:ACCOUNT:" + accountId);
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

// ======================== MAIN LOOP ==================================
void loop() {
  // 0. Process asynchronous BLE WiFi provisioning if requested
  if (pendingWiFiConfig) {
    pendingWiFiConfig = false;
    processWiFiConfig(pendingConfigPayload);
  }

  // 0.1 Process asynchronous unpair if requested via HTTP
  if (pendingUnpair) {
    pendingUnpair = false;
    unpairAndResetToBLE();
  }

  // 0.2 BLE Connection state transition handler
  if (bleClientConnected && !oldBleClientConnected) {
    oldBleClientConnected = bleClientConnected;
    if (WiFi.status() == WL_CONNECTED) {
      sendStatusBLE("STATUS:CONNECTED:" + WiFi.localIP().toString() + ":ACCOUNT:" + accountId);
    } else {
      sendStatusBLE("STATUS:AWAITING_WIFI_CONFIG:ACCOUNT:" + accountId);
    }
  }
  if (!bleClientConnected && oldBleClientConnected) {
    oldBleClientConnected = bleClientConnected;
    delay(200); // Give BLE stack time to finish disconnect
    BLEDevice::startAdvertising();
    Serial.println("[BLE] Advertising resumed in background.");
  }

  // 0.3 Blue LED Pairing Mode Flashing (GPIO 18 visual indicator)
  if (isPairingMode) {
    if (millis() - lastPairingBlink >= PAIRING_BLINK_MS) {
      lastPairingBlink = millis();
      blueLedState = !blueLedState;
      setRelay(RELAY_BLUE_LED, blueLedState);
    }
  }

  // 1. Handle incoming HTTP client requests if WiFi is online
  if (WiFi.status() == WL_CONNECTED) {
    localServer.handleClient();
  } else {
    // Background WiFi Auto-Reconnect if connection was lost after boot (using in-memory credentials)
    if (millis() - lastWiFiReconnectCheck >= WIFI_RETRY_MS) {
      lastWiFiReconnectCheck = millis();
      if (isConfigured && savedSsid.length() > 0) {
        Serial.println("[WiFi Keep-Alive] Connection dropped. Auto-reconnecting...");
        WiFi.begin(savedSsid.c_str(), savedPass.c_str());
      }
    }
  }

  // 2. Read Capacitive Bezel Touch Sensor (Instant White LED toggle with solid debounce)
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

// ======================== SENSOR READING =============================
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
      Serial.println("[Hardware Detection] DHT11 sensor NOT detected or disconnected!");
    }
  }

  // Read MQ Gas Sensor (ESP32 ADC1 is 12-bit: 0-4095)
  int rawGas = analogRead(MQ_PIN);
  // An active MQ sensor produces baseline reading between 25 and 4085 counts
  if (rawGas > 25 && rawGas < 4085) {
    gasLevel = rawGas >> 2; // Map 12-bit (0-4095) to 0-1023 reference
    gasSensorExists = true;
    gasFailCount = 0;
  } else {
    gasFailCount++;
    if (gasFailCount >= 3) {
      gasSensorExists = false;
      Serial.println("[Hardware Detection] MQ Gas sensor NOT detected (pin floating or disconnected)!");
    }
  }
}

// ======================== DOOR WORKFLOW & SAFETY INTERLOCK ===========
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
        
        // Push immediate door-open event
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
        
        // Take fresh sensor readings
        Serial.println("[Sensors] Reading fresh DHT11 & MQ sensor values...");
        readSensors();
        
        // Resume normal climate control workflow
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

// ======================== AUTOMATIC CLIMATE LOGIC ====================
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

  // 2. Gas / Ripening Control (Ethylene Venting)
  if (gasSensorExists && gasLevel > gasThresholdPpm) {
    inletFanState = true;
    outletFanState = true;
    setRelay(RELAY_INLET_FAN, true);
    setRelay(RELAY_OUTLET_FAN, true);
    currentState = STATE_ALERT;
  } else {
    // Standard temperature cooling / circulation (Only if DHT sensor exists)
    if (dhtSensorExists && temperature > tempMaxThreshold) {
      inletFanState = true;
      outletFanState = true;
      setRelay(RELAY_INLET_FAN, true);
      setRelay(RELAY_OUTLET_FAN, true);
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
}

// ======================== TOUCH SENSOR LOCAL CONTROL =================
void handleTouchSensor() {
  int rawReading = digitalRead(TOUCH_PIN);

  if (rawReading != lastRawTouchState) {
    lastTouchDebounce = millis();
    lastRawTouchState = rawReading;
  }

  if ((millis() - lastTouchDebounce) > 50) {
    if (rawReading != debouncedTouchState) {
      debouncedTouchState = rawReading;
      // Trigger toggle on rising edge (tap pressed)
      if (debouncedTouchState == HIGH) {
        whiteLedState = !whiteLedState;
        setRelay(RELAY_WHITE_LED, whiteLedState);
        Serial.print("[Touch Sensor] Capacitive Bezel Tap: White LED is now ");
        Serial.println(whiteLedState ? "ON" : "OFF");
        uploadTelemetry();
      }
    }
  }
}

// ======================== TELEMETRY UPLOAD (REST API) ================
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

  // Create JSON payload matching Smart FreshGuard Web App specification
  FreshGuardJsonDoc doc;
  doc["device_id"]   = deviceId;
  doc["account_id"]  = accountId;
  doc["door_status"] = isDoorOpen ? "OPEN" : "CLOSED";
  doc["state"]       = (currentState == STATE_DOOR_OPEN) ? "DOOR_OPEN" :
                       (currentState == STATE_WAIT_5_SECONDS) ? "WAIT_5_SECONDS" :
                       (currentState == STATE_ALERT) ? "ALERT" : "NORMAL";

  // Hardware existence flags
  doc["dht_exists"]  = dhtSensorExists;
  doc["gas_exists"]  = gasSensorExists;
  doc["door_exists"] = doorSensorExists;

  // Real sensor readings or null if sensor does not exist
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
    Serial.printf("[HTTP POST] Code: %d, Data sent: %s\n", httpCode, requestBody.c_str());
  } else {
    Serial.printf("[HTTP POST] Upload error: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}

// ======================== LOCAL WEB SERVER API (WITH CORS) ============
void setupLocalHttpServer() {
  static bool serverConfigured = false;
  if (serverConfigured) {
    localServer.begin();
    return;
  }
  serverConfigured = true;

  // Global OPTIONS handler for CORS preflight
  localServer.onNotFound([]() {
    if (localServer.method() == HTTP_OPTIONS) {
      sendCORSHeaders();
      localServer.send(204, "text/plain", "");
      return;
    }
    sendCORSHeaders();
    localServer.send(404, "application/json", "{\"error\":\"Not Found\"}");
  });

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

    // Actuator states
    doc["inlet_fan"]   = inletFanState ? "ON" : "OFF";
    doc["outlet_fan"]  = outletFanState ? "ON" : "OFF";
    doc["humidifier"]  = humidifierState ? "ON" : "OFF";
    doc["blue_led"]    = blueLedState ? "ON" : "OFF";
    doc["white_led"]   = whiteLedState ? "ON" : "OFF";
    doc["dht_type"]    = "DHT11";
    doc["wifi_rssi"]   = WiFi.RSSI();
    doc["ip"]          = WiFi.localIP().toString();

    // Active thresholds (compatible with ArduinoJson 6 & 7)
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

  // POST /unpair: Delete stored WiFi/Account credentials and reset to BLE pairing mode
  localServer.on("/unpair", HTTP_OPTIONS, []() {
    sendCORSHeaders();
    localServer.send(204, "text/plain", "");
  });

  localServer.on("/unpair", HTTP_POST, []() {
    Serial.println("\n[HTTP Server] Received /unpair command from App!");
    sendCORSHeaders();
    localServer.send(200, "application/json", "{\"status\":\"ok\",\"action\":\"UNPAIR\",\"message\":\"Chamber credentials wiped. BLE pairing active.\"}");
    pendingUnpair = true; // Handled asynchronously in loop() so HTTP response finishes sending cleanly
  });

  localServer.begin();
  Serial.println("[HTTP Server] Local REST API started on port 80 with CORS support");
}
