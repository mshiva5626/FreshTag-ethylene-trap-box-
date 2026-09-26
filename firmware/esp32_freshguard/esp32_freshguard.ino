/*
 ==============================================================================
   Smart FreshGuard - ESP32 Firmware with Bluetooth (BLE) Provisioning
   Botanical Precision IoT Storage Chamber for Fruits and Vegetables
   
   Hardware Components:
   - ESP32 (ESP32-WROOM-32 / NodeMCU-32S / ESP32-DevKitC)
   - DHT11 (Temperature & Relative Humidity Sensor on GPIO 4)
   - MQ Gas Sensor (Ethylene / C2H4 / VOC indicator on Analog GPIO 34)
   - IR Obstacle/Door Sensor (Safety optical beam on GPIO 14)
   - Capacitive Touch Sensor (TTP223 bezel tap on GPIO 13)
   - 5-Channel Relay Module (Active LOW / Optical Isolation):
       * Relay 1: Inlet HEPA Fan (GPIO 16)
       * Relay 2: Outlet Purge / Catalytic Scrubber Fan (GPIO 17)
       * Relay 3: 1.7MHz Ultrasonic Humidifier Mist (GPIO 5)
       * Relay 4: 5000K Inspection White LED (GPIO 19)
       * Relay 5: 450nm Antimicrobial Blue Light (GPIO 18)
   
   Bluetooth (BLE) Provisioning & Auto-Reconnect Workflow:
   1. On initial boot (or power loss recovery), ESP32 starts BLE advertising:
      Device Name: "FreshGuard-Vault-ESP32"
   2. Stored WiFi credentials (SSID & Password) and Web App URL are loaded
      from ESP32 NVS flash memory using Preferences.
   3. Auto-reconnect: If power was lost, ESP32 automatically reads saved credentials
      and reconnects to WiFi and the FreshGuard web application account.
   4. If not configured or connection fails, the user connects via Bluetooth
      (Web Bluetooth API on Laptop/Mobile browser), enters the WiFi credentials,
      and the ESP32 saves them to NVS, connects to WiFi, and reports "CONNECTED".
   5. If WiFi drops during operation, background auto-reconnect handles recovery
      without disrupting the local climate control or safety interlocks.
   
   Safety Workflow (5-Second Interlock):
   - Door OPEN: Instantly halts fans & mist to prevent laboratory cold loss.
   - Door CLOSED: Enforces 5000ms stabilization countdown before restarting.
   - If door re-opens during countdown: Timer resets; actuators remain stopped.
 ==============================================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <WiFiClient.h>
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
  typedef StaticJsonDocument<768> FreshGuardJsonDoc;
#endif

// ======================== PIN ASSIGNMENTS ============================
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

// Sensor Readings & Hardware Presence Flags
float temperature            = 22.0;
float humidity               = 65.0;
int gasLevel                 = 210;
bool isDoorOpen              = false;

// Hardware Detection (True if sensor is physically attached and giving valid signals)
bool dhtSensorExists         = false;
bool gasSensorExists         = false;
bool doorSensorExists        = true;

// Actuator States
bool inletFanState           = false;
bool outletFanState          = false;
bool humidifierState         = false;
bool blueLedState            = false;
bool whiteLedState           = false;

// Pairing Mode Visual Indicator (Flashing Blue LED on GPIO 18)
bool isPairingMode                  = true;
unsigned long lastPairingBlink      = 0;
const unsigned long PAIRING_BLINK_MS = 350; // 350ms rhythmic flash during pairing mode

// Configurable Thresholds
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

// Touch sensor debounce
bool lastTouchState                 = LOW;
unsigned long lastTouchDebounce      = 0;

// BLE globals
BLEServer* pServer                  = nullptr;
BLECharacteristic* pStatusChar      = nullptr;
BLECharacteristic* pConfigChar      = nullptr;
bool bleClientConnected             = false;

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

// ======================== BLE CALLBACKS ==============================
class FreshGuardBLEServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    bleClientConnected = true;
    Serial.println("\n[BLE] >>> Client Connected to FreshGuard Bluetooth! <<<");
    if (WiFi.status() == WL_CONNECTED) {
      sendStatusBLE("STATUS:WIFI_ONLINE:" + WiFi.localIP().toString() + ":ACCOUNT:" + accountId);
    } else {
      sendStatusBLE("STATUS:AWAITING_WIFI_CONFIG:ACCOUNT:" + accountId);
    }
  }

  void onDisconnect(BLEServer* pServer) {
    bleClientConnected = false;
    Serial.println("[BLE] Client disconnected. Restarting BLE advertising in pairing mode.");
    delay(50);
    pServer->getAdvertising()->start();
  }
};

class FreshGuardConfigCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) {
    String value = pCharacteristic->getValue().c_str();
    if (value.length() > 0) {
      Serial.print("[BLE] Received configuration packet: ");
      Serial.println(value);
      processWiFiConfig(value);
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
  BLEDevice::init(BLE_DEVICE_NAME);

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

  // WiFi Configuration characteristic (Write)
  pConfigChar = pService->createCharacteristic(
    CHAR_WIFI_CONFIG_UUID,
    BLECharacteristic::PROPERTY_WRITE
  );
  pConfigChar->setCallbacks(new FreshGuardConfigCallbacks());

  pService->start();

  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06); // 7.5ms iPhone compatibility
  pAdvertising->setMinPreferred(0x12); // 22.5ms
  BLEDevice::startAdvertising();

  Serial.println("[BLE] Advertising started. Discoverable as: " BLE_DEVICE_NAME);
}

// ======================== FACTORY UNPAIR & BLE RESET =================
void unpairAndResetToBLE() {
  Serial.println("\n[UNPAIR] >>> Deleting WiFi and Account credentials from Flash NVS! <<<");
  
  // Wipe all stored data from Preferences
  preferences.begin("freshguard", false);
  preferences.clear();
  preferences.putBool("configured", false);
  preferences.end();

  // Reset in-memory account
  accountId = "unpaired";
  systemMode = "AUTO";

  // Safely turn off active actuators
  inletFanState = false;
  outletFanState = false;
  humidifierState = false;
  blueLedState = false;
  whiteLedState = false;
  setRelay(RELAY_INLET_FAN, false);
  setRelay(RELAY_OUTLET_FAN, false);
  setRelay(RELAY_HUMIDIFIER, false);
  setRelay(RELAY_BLUE_LED, false);
  setRelay(RELAY_WHITE_LED, false);

  // Fully disconnect WiFi and wipe radio memory
  Serial.println("[WiFi] Disconnecting WiFi radio and clearing stored network...");
  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_OFF);
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

// ======================== NVS CONFIG PROCESSING ======================
void processWiFiConfig(String jsonPayload) {
  FreshGuardJsonDoc doc;
  DeserializationError err = deserializeJson(doc, jsonPayload);
  if (err) {
    Serial.println("[BLE] JSON Parse Error in WiFi config!");
    sendStatusBLE("ERROR:JSON_PARSE");
    return;
  }

  // Check for Unpair / Delete from Connected command
  if ((doc.containsKey("action") && (doc["action"] == "UNPAIR" || doc["action"] == "DELETE" || doc["action"] == "RESET")) ||
      (doc.containsKey("unpair") && doc["unpair"] == true)) {
    unpairAndResetToBLE();
    return;
  }

  String newSsid    = doc["ssid"] | "";
  String newPass    = doc["password"] | "";
  String newServer  = doc["server"] | "";
  String newId      = doc["device_id"] | "";
  String newAccount = doc["account_id"] | doc["account"] | "";

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

  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
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

    // Setup or re-setup Local REST Server
    setupLocalHttpServer();
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

  // ESP32 ADC: Full 0 - 3.3V attenuation (11dB) for 12-bit analog gas sensor on GPIO 34
  analogSetAttenuation(ADC_11db);

  // Initialize Sensors
  pinMode(IR_DOOR_PIN, INPUT_PULLUP);
  pinMode(TOUCH_PIN, INPUT);
  dht.begin();
  Serial.println("[Sensors] DHT11 & MQ Ethylene Analog initialized.");

  // Initialize Relays to Safe Inactive State
  pinMode(RELAY_INLET_FAN, OUTPUT);
  pinMode(RELAY_OUTLET_FAN, OUTPUT);
  pinMode(RELAY_HUMIDIFIER, OUTPUT);
  pinMode(RELAY_BLUE_LED, OUTPUT);
  pinMode(RELAY_WHITE_LED, OUTPUT);

  setRelay(RELAY_INLET_FAN, false);
  setRelay(RELAY_OUTLET_FAN, false);
  setRelay(RELAY_HUMIDIFIER, false);
  setRelay(RELAY_BLUE_LED, false);
  setRelay(RELAY_WHITE_LED, false);

  // Initialize BLE Provisioning Subsystem
  initBLE();

  // Load Stored WiFi Credentials and Account from Flash (Preferences NVS)
  preferences.begin("freshguard", true); // read-only mode
  bool isConfigured   = preferences.getBool("configured", false);
  String savedSsid    = preferences.getString("ssid", "");
  String savedPass    = preferences.getString("password", "");
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
      sendStatusBLE("STATUS:AUTO_RECONNECTED:" + WiFi.localIP().toString() + ":ACCOUNT:" + accountId);
    } else {
      isPairingMode = true; // Flashes blue LED while offline / awaiting pairing
      lastPairingBlink = millis();
      sendStatusBLE("STATUS:SAVED_WIFI_UNAVAILABLE:ACCOUNT:" + accountId);
    }
  } else {
    isPairingMode = true; // Flashes blue LED while in BLE pairing mode
    lastPairingBlink = millis();
    Serial.printf("\n[Provisioning] No WiFi configured. Blue LED flashing for Bluetooth pairing (Account '%s')...\n", accountId.c_str());
    sendStatusBLE("STATUS:WAITING_BLE_PROVISION:ACCOUNT:" + accountId);
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
  // 0. Blue LED Pairing Mode Flashing (GPIO 18 visual indicator)
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
    // Background WiFi Auto-Reconnect if connection was lost after boot
    if (millis() - lastWiFiReconnectCheck >= WIFI_RETRY_MS) {
      lastWiFiReconnectCheck = millis();
      preferences.begin("freshguard", true);
      bool isCfg = preferences.getBool("configured", false);
      String sSsid = preferences.getString("ssid", "");
      String sPass = preferences.getString("password", "");
      preferences.end();

      if (isCfg && sSsid.length() > 0) {
        Serial.println("[WiFi Keep-Alive] Connection dropped. Auto-reconnecting...");
        WiFi.begin(sSsid.c_str(), sPass.c_str());
      }
    }
  }

  // 2. Read Capacitive Bezel Touch Sensor (Instant White LED toggle)
  handleTouchSensor();

  // 3. Read IR Safety Door Sensor and run 5s Stabilization State Machine
  handleDoorWorkflow();

  // 4. Autonomous Climate Control Algorithm
  if (currentState == STATE_NORMAL && systemMode == "AUTO") {
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

  // Retry once after brief delay if transient reading error
  if (isnan(h) || isnan(t)) {
    delay(50);
    h = dht.readHumidity();
    t = dht.readTemperature();
  }

  if (!isnan(h) && !isnan(t) && h >= 1.0 && h <= 100.0) {
    humidity = h;
    temperature = t;
    dhtSensorExists = true;
  } else {
    dhtSensorExists = false;
    Serial.println("[Hardware Detection] DHT11 sensor NOT detected or disconnected!");
  }

  // Read MQ Gas Sensor (ESP32 ADC1 is 12-bit: 0-4095)
  int rawGas = analogRead(MQ_PIN);
  // An active MQ sensor has an internal load divider producing baseline > 30 ADC counts (~25mV)
  if (rawGas > 30 && rawGas < 4085) {
    gasLevel = rawGas >> 2; // Map 12-bit to 0-1023 reference
    gasSensorExists = true;
  } else {
    gasSensorExists = false;
    Serial.println("[Hardware Detection] MQ Gas sensor NOT detected (pin floating or disconnected)!");
  }
}

// ======================== DOOR WORKFLOW & SAFETY INTERLOCK ===========
bool checkDoorStatus() {
  int sensorVal = digitalRead(IR_DOOR_PIN);
  isDoorOpen = (sensorVal == DOOR_IS_OPEN_LEVEL);
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
        
        // Immediately halt active devices to prevent cold chamber air escape
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
        currentState = STATE_RESTART;
        
        // Take fresh sensor readings
        Serial.println("[Sensors] Reading fresh DHT11 & MQ sensor values...");
        readSensors();
        
        // Resume climate control
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
      if (currentState == STATE_ALERT) currentState = STATE_NORMAL;
    }
  }
}

// ======================== TOUCH SENSOR LOCAL CONTROL =================
void handleTouchSensor() {
  int reading = digitalRead(TOUCH_PIN);
  if (reading != lastTouchState) {
    lastTouchDebounce = millis();
  }

  if ((millis() - lastTouchDebounce) > 50) {
    if (reading == HIGH && lastTouchState == LOW) {
      // Toggle White LED
      whiteLedState = !whiteLedState;
      setRelay(RELAY_WHITE_LED, whiteLedState);
      Serial.print("[Touch Sensor] Capacitive Bezel Tap: White LED is now ");
      Serial.println(whiteLedState ? "ON" : "OFF");
      uploadTelemetry();
    }
  }
  lastTouchState = reading;
}

// ======================== TELEMETRY UPLOAD (REST API) ================
void uploadTelemetry() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClient client;
  HTTPClient http;

  http.begin(client, serverHost);
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
    doc["temperature"] = serialized(String(temperature, 1));
    doc["humidity"]    = (int)round(humidity);
  } else {
    doc["temperature"] = (char*)NULL;
    doc["humidity"]    = (char*)NULL;
  }

  if (gasSensorExists) {
    doc["gas_level"]   = gasLevel;
  } else {
    doc["gas_level"]   = (char*)NULL;
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

// ======================== LOCAL WEB SERVER API =======================
void setupLocalHttpServer() {
  // GET /status: Returns current telemetry, account info, and hardware flags
  localServer.on("/status", HTTP_GET, []() {
    FreshGuardJsonDoc doc;
    doc["device_id"]   = deviceId;
    doc["account_id"]  = accountId;
    doc["door_status"] = isDoorOpen ? "OPEN" : "CLOSED";
    doc["dht_exists"]  = dhtSensorExists;
    doc["gas_exists"]  = gasSensorExists;
    doc["door_exists"] = doorSensorExists;

    if (dhtSensorExists) {
      doc["temperature"] = temperature;
      doc["humidity"]    = humidity;
    } else {
      doc["temperature"] = (char*)NULL;
      doc["humidity"]    = (char*)NULL;
    }

    if (gasSensorExists) {
      doc["gas_level"]   = gasLevel;
    } else {
      doc["gas_level"]   = (char*)NULL;
    }

    doc["inlet_fan"]   = inletFanState;
    doc["outlet_fan"]  = outletFanState;
    doc["humidifier"]  = humidifierState;
    doc["blue_led"]    = blueLedState;
    doc["white_led"]   = whiteLedState;
    doc["dht_type"]    = "DHT11";
    String res;
    serializeJson(doc, res);
    localServer.send(200, "application/json", res);
  });

  // POST /control: Manual control of relays from Web App
  localServer.on("/control", HTTP_POST, []() {
    if (localServer.hasArg("plain")) {
      FreshGuardJsonDoc doc;
      deserializeJson(doc, localServer.arg("plain"));
      
      if (doc.containsKey("mode")) {
        systemMode = doc["mode"].as<String>();
      }
      if (systemMode == "MANUAL" && !isDoorOpen) {
        if (doc.containsKey("inlet_fan")) {
          inletFanState = (doc["inlet_fan"] == "ON" || doc["inlet_fan"] == true);
          setRelay(RELAY_INLET_FAN, inletFanState);
        }
        if (doc.containsKey("outlet_fan")) {
          outletFanState = (doc["outlet_fan"] == "ON" || doc["outlet_fan"] == true);
          setRelay(RELAY_OUTLET_FAN, outletFanState);
        }
        if (doc.containsKey("humidifier")) {
          humidifierState = (doc["humidifier"] == "ON" || doc["humidifier"] == true);
          setRelay(RELAY_HUMIDIFIER, humidifierState);
        }
      }
      if (doc.containsKey("white_led")) {
        whiteLedState = (doc["white_led"] == "ON" || doc["white_led"] == true);
        setRelay(RELAY_WHITE_LED, whiteLedState);
      }
      if (doc.containsKey("blue_led")) {
        isPairingMode = false;
        blueLedState = (doc["blue_led"] == "ON" || doc["blue_led"] == true);
        setRelay(RELAY_BLUE_LED, blueLedState);
      }
      localServer.send(200, "application/json", "{\"status\":\"ok\"}");
    } else {
      localServer.send(400, "text/plain", "Missing request body");
    }
  });

  // POST /unpair: Delete stored WiFi/Account credentials and reset to BLE pairing mode
  localServer.on("/unpair", HTTP_POST, []() {
    Serial.println("\n[HTTP Server] Received /unpair command from App!");
    localServer.send(200, "application/json", "{\"status\":\"ok\",\"action\":\"UNPAIR\",\"message\":\"Chamber credentials wiped. BLE pairing active.\"}");
    delay(150);
    unpairAndResetToBLE();
  });

  localServer.begin();
  Serial.println("[HTTP Server] Local REST API started on port 80");
}
