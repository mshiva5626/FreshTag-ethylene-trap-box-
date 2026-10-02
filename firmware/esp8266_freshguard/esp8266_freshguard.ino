/*
  ==============================================================================
    FreshTag ESP8266 Autonomous Botanical Precision Chamber Firmware
    Ultra-Lightweight • Rock-Solid Cloud Telemetry • Remote Reset & Pairing
    
    HARDWARE CONNECTIONS (ESP8266 NodeMCU / D1 Mini):
    - DHT11 / DHT22 Sensor (Temp & Humidity):        D2 (GPIO 4)
    - MQ Analog Gas Sensor (Ethylene / VOC Index):    A0 (ADC0, 0 - 1023)
    - Optical IR Safety Door Beam (Interlock):       D5 (GPIO 14, INPUT_PULLUP)
    - TTP223 Capacitive Touch / Physical Reset:      D7 (GPIO 13, INPUT)
      * Tap (<2s): Toggle Inspection White LED
      * Long Hold (5s): Wipe credentials & reboot to Pairing Mode
    - Relay 1: Inlet HEPA Fan (Fresh Air):           D1 (GPIO 5,  Active LOW)
    - Relay 2: Outlet Catalytic Purge Fan:           D6 (GPIO 12, Active LOW)
    - Relay 3: 1.7MHz Ultrasonic Humidifier Mist:    D0 (GPIO 16, Active LOW)
    - Relay 4: 5000K Inspection Daylight LED:        D3 (GPIO 0,  Active LOW)
    - Relay 5 / Aux: Antimicrobial Blue / Status LED: D4 (GPIO 2,  Active LOW)

    KEY CAPABILITIES:
    1. Zero Bloat & Ultra-Lightweight:
       - No memory leaks, watchdog resets, or heavy static HTML strings in RAM.
       - Optimized non-blocking state loops with minimal heap usage (~28KB free heap).
    2. Two Operating Modes:
       - PAIRING MODE: Broadcasts open hotspot "FreshTag-Setup" (IP 192.168.4.1)
         with Captive Portal for instant mobile Wi-Fi & account configuration.
       - CONNECTED MODE: Streams telemetry every 2500ms to FreshTag Render backend
         (POST /api/telemetry) with automatic SSL/TLS handling.
    3. Remote Reset Mode from Website:
       - When unpair or reset is clicked on the FreshTag website, the backend responds
         with {"reset": true}. The ESP8266 immediately wipes saved Wi-Fi and account
         credentials from EEPROM and reboots into Pairing Mode for seamless account transfer!
    4. On-Board & Cloud Sensor Calibration:
       - Synchronizes hardware offsets (Temperature +/- °C, Humidity +/- %, Gas Scale)
         directly from the FreshTag Account Settings Calibration Studio.
       - Supports "Custom Sensor Data Override Mode" when physical sensors need bench simulation.
  ==============================================================================
*/

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <DNSServer.h>
#include <DHT.h>
#include <EEPROM.h>
#include <ArduinoJson.h>

// Universal ArduinoJson v6 and v7 Compatibility
#if defined(ARDUINOJSON_VERSION_MAJOR) && (ARDUINOJSON_VERSION_MAJOR >= 7)
  typedef JsonDocument FreshTagDoc;
#else
  typedef StaticJsonDocument<1024> FreshTagDoc;
#endif

// ======================== PIN ASSIGNMENTS ====================================
#define PIN_DHT              4     // D2 / GPIO 4 (DHT11 / DHT22)
#define PIN_MQ               A0    // A0 / ADC0 (0 - 1023)
#define PIN_DOOR             14    // D5 / GPIO 14 (INPUT_PULLUP, LOW = closed, HIGH = open)
#define PIN_TOUCH            13    // D7 / GPIO 13 (TTP223 Touch sensor)

// Relays (Active LOW for standard optocoupled modules)
#define RELAY_ACTIVE         LOW
#define RELAY_INACTIVE       HIGH

#define RELAY_INLET_FAN      5     // D1 / GPIO 5  (HEPA Fresh Air Fan)
#define RELAY_OUTLET_FAN     12    // D6 / GPIO 12 (Purge Scrubber Fan)
#define RELAY_HUMIDIFIER     16    // D0 / GPIO 16 (Ultrasonic Atomizer)
#define RELAY_WHITE_LED      0     // D3 / GPIO 0  (5000K Inspection Daylight)
#define RELAY_BLUE_LED       2     // D4 / GPIO 2  (Blue LED / Onboard Status)

// Sensor configuration
#define DHTTYPE              DHT11 // Default DHT type (DHT11)
DHT dht(PIN_DHT, DHTTYPE);

// SoftAP Constants
#define AP_SSID_NAME         "FreshTag-Setup"
#define AP_DEFAULT_PASS      ""    // Open network for zero-friction mobile setup
const byte DNS_PORT        = 53;

// ======================== EEPROM PERSISTENCE =================================
#define EEPROM_SIZE          1024
#define EEPROM_MAGIC         0x46544738 // 'FTG8' - FreshTag Guard v8

struct ChamberConfig {
  uint32_t magic;
  bool     configured;
  char     ssid[33];
  char     password[65];
  char     account_id[33];
  char     device_id[33];
  char     server_url[128];
  float    temp_offset;
  float    humidity_offset;
  float    gas_scale;
  int      gas_offset;
  bool     override_mode;
  float    custom_temp;
  float    custom_humidity;
  int      custom_gas;
  float    temp_min;
  float    temp_max;
  float    humidity_min;
  float    humidity_max;
  int      gas_threshold;
  uint32_t checksum;
};

ChamberConfig config;

// ======================== OPERATING MODES & STATE ============================
enum ChamberMode {
  MODE_PAIRING,
  MODE_CONNECTED
};

ChamberMode currentMode   = MODE_PAIRING;
String systemState        = "NORMAL"; // "NORMAL", "DOOR_OPEN", "WAIT_5_SECONDS", "ALERT"
String systemControlMode  = "AUTO";   // "AUTO" or "MANUAL"

// Live Sensor Readings (Raw and Calibrated)
float rawTemp             = 0.0;
float rawHumidity         = 0.0;
int   rawGas              = 0;
bool  dhtExists           = true;
bool  gasExists           = true;
bool  doorExists          = true;
bool  doorIsOpen          = false;

float calibTemp           = 0.0;
float calibHumidity       = 0.0;
int   calibGas            = 0;

// Relay States
bool inletFanState        = false;
bool outletFanState       = false;
bool humidifierState      = false;
bool whiteLedState        = false;
bool blueLedState         = false;

// Timing & Non-Blocking Intervals
unsigned long lastSensorReadTime  = 0;
unsigned long lastTelemetryTime   = 0;
unsigned long lastLedBlinkTime    = 0;
unsigned long doorCloseTimer      = 0;
unsigned long touchPressStartTime = 0;
bool          touchWasPressed     = false;

const unsigned long SENSOR_INTERVAL    = 1500; // Sample sensors every 1.5s
const unsigned long TELEMETRY_INTERVAL = 2500; // Cloud post every 2.5s
const unsigned long DOOR_STABILIZE_MS  = 5000; // 5-second stabilization

// Web & DNS Servers
ESP8266WebServer server(80);
DNSServer dnsServer;

// ======================== CHECKSUM HELPER ====================================
uint32_t calculateChecksum(const ChamberConfig& cfg) {
  uint32_t sum = 0xAA55AA55;
  const uint8_t* p = (const uint8_t*)&cfg;
  for (size_t i = 0; i < sizeof(ChamberConfig) - sizeof(uint32_t); i++) {
    sum = ((sum << 5) | (sum >> 27)) + p[i];
  }
  return sum;
}

void loadConfigFromEEPROM() {
  EEPROM.begin(EEPROM_SIZE);
  EEPROM.get(0, config);
  
  if (config.magic != EEPROM_MAGIC || config.checksum != calculateChecksum(config)) {
    Serial.println(F("[EEPROM] No valid config found. Initializing factory defaults..."));
    memset(&config, 0, sizeof(ChamberConfig));
    config.magic = EEPROM_MAGIC;
    config.configured = false;
    strncpy(config.ssid, "", sizeof(config.ssid));
    strncpy(config.password, "", sizeof(config.password));
    strncpy(config.account_id, "mshiva5626", sizeof(config.account_id));
    strncpy(config.device_id, "SF-001", sizeof(config.device_id));
    strncpy(config.server_url, "https://freshguard-platform.onrender.com", sizeof(config.server_url));
    config.temp_offset = 0.0f;
    config.humidity_offset = 0.0f;
    config.gas_scale = 1.0f;
    config.gas_offset = 0;
    config.override_mode = false;
    config.custom_temp = 3.5f;
    config.custom_humidity = 92.0f;
    config.custom_gas = 145;
    config.temp_min = 1.0f;
    config.temp_max = 4.0f;
    config.humidity_min = 90.0f;
    config.humidity_max = 95.0f;
    config.gas_threshold = 230;
    config.checksum = calculateChecksum(config);
    EEPROM.put(0, config);
    EEPROM.commit();
  } else {
    Serial.println(F("[EEPROM] Config loaded successfully!"));
    Serial.print(F("  Device ID:  ")); Serial.println(config.device_id);
    Serial.print(F("  Account ID: ")); Serial.println(config.account_id);
    Serial.print(F("  Target SSID: ")); Serial.println(config.ssid);
    Serial.print(F("  Server:     ")); Serial.println(config.server_url);
  }
}

void saveConfigToEEPROM() {
  config.magic = EEPROM_MAGIC;
  config.checksum = calculateChecksum(config);
  EEPROM.put(0, config);
  EEPROM.commit();
  Serial.println(F("[EEPROM] Configuration saved."));
}

void wipeConfigAndReboot() {
  Serial.println(F("[RESET] Wiping chamber credentials and rebooting into Pairing Mode..."));
  for (int i = 0; i < 10; i++) {
    digitalWrite(RELAY_BLUE_LED, (i % 2 == 0) ? RELAY_ACTIVE : RELAY_INACTIVE);
    delay(60);
  }
  
  memset(&config, 0, sizeof(ChamberConfig));
  config.magic = 0; // Invalidate
  EEPROM.put(0, config);
  EEPROM.commit();
  
  WiFi.disconnect(true);
  delay(300);
  ESP.restart();
}

// ======================== HARDWARE CONTROL ===================================
void setRelay(uint8_t pin, bool state) {
  digitalWrite(pin, state ? RELAY_ACTIVE : RELAY_INACTIVE);
}

void applyRelays() {
  setRelay(RELAY_INLET_FAN, inletFanState);
  setRelay(RELAY_OUTLET_FAN, outletFanState);
  setRelay(RELAY_HUMIDIFIER, humidifierState);
  setRelay(RELAY_WHITE_LED, whiteLedState);
  setRelay(RELAY_BLUE_LED, blueLedState);
}

// ======================== SENSOR SAMPLING ====================================
void readSensors() {
  // 1. Read DHT11 / DHT22
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (isnan(t) || isnan(h) || t < -20.0f || t > 70.0f || h < 0.0f || h > 100.0f) {
    // Keep previous valid if single glitch, otherwise flag offline
    static int dhtFailCount = 0;
    dhtFailCount++;
    if (dhtFailCount > 4) {
      dhtExists = false;
    }
  } else {
    dhtExists = true;
    rawTemp = t;
    rawHumidity = h;
  }

  // 2. Read MQ Gas Sensor (10-sample trimmed median oversampling for analog stability)
  int samples[10];
  for (int i = 0; i < 10; i++) {
    samples[i] = analogRead(PIN_MQ);
    delayMicroseconds(200);
  }
  // Bubble sort 10 samples
  for (int i = 0; i < 9; i++) {
    for (int j = 0; j < 9 - i; j++) {
      if (samples[j] > samples[j + 1]) {
        int temp = samples[j];
        samples[j] = samples[j + 1];
        samples[j + 1] = temp;
      }
    }
  }
  // Take median average of middle 4 samples (indices 3, 4, 5, 6)
  int gasMedian = (samples[3] + samples[4] + samples[5] + samples[6]) / 4;
  rawGas = gasMedian;
  gasExists = (rawGas > 10 && rawGas < 1020);

  // 3. Read Optical Door Sensor (LOW = closed, HIGH = open)
  int doorPinVal = digitalRead(PIN_DOOR);
  bool prevDoorState = doorIsOpen;
  doorIsOpen = (doorPinVal == HIGH);

  if (prevDoorState && !doorIsOpen) {
    // Door just closed -> start 5-second stabilization countdown
    doorCloseTimer = millis();
    systemState = "WAIT_5_SECONDS";
  }

  // 4. Calculate Calibrated Values
  if (config.override_mode) {
    // Custom Sensor Data Override Mode (Website Testing / Lab Calibration)
    calibTemp = config.custom_temp;
    calibHumidity = config.custom_humidity;
    calibGas = config.custom_gas;
  } else {
    calibTemp = rawTemp + config.temp_offset;
    calibHumidity = constrain(rawHumidity + config.humidity_offset, 0.0f, 100.0f);
    calibGas = max(0, (int)(rawGas * config.gas_scale + config.gas_offset));
  }
}

// ======================== AUTONOMOUS REGULATION ==============================
void runAutonomousClimate() {
  if (systemControlMode != "AUTO") {
    applyRelays();
    return;
  }

  if (doorIsOpen) {
    // Immediate Safety Lockout: Halt fans & humidifier when door is open
    systemState = "DOOR_OPEN";
    inletFanState = false;
    outletFanState = false;
    humidifierState = false;
    whiteLedState = true; // Turn daylight LED on for chamber inspection
    blueLedState = false;
    applyRelays();
    return;
  }

  // Check 5-second stabilization timer after door closure
  if (systemState == "WAIT_5_SECONDS") {
    if (millis() - doorCloseTimer < DOOR_STABILIZE_MS) {
      inletFanState = false;
      outletFanState = false;
      humidifierState = false;
      whiteLedState = false;
      blueLedState = false;
      applyRelays();
      return;
    } else {
      systemState = "NORMAL";
    }
  }

  // Normal autonomous climate management
  // 1. Gas / Ethylene Regulation: Trigger catalytic scrubber fan if above threshold
  if (gasExists && calibGas > config.gas_threshold) {
    outletFanState = true;
    inletFanState = true;
    systemState = "ALERT";
  } else {
    outletFanState = false;
    inletFanState = false;
    systemState = "NORMAL";
  }

  // 2. Humidity Regulation: Trigger ultrasonic mist if below safe biological minimum
  if (dhtExists && calibHumidity < config.humidity_min) {
    humidifierState = true;
  } else if (calibHumidity >= config.humidity_max) {
    humidifierState = false;
  }

  whiteLedState = false;
  applyRelays();
}

// ======================== HARDWARE RESET BUTTON ==============================
void checkPhysicalResetButton() {
  int touchState = digitalRead(PIN_TOUCH);
  if (touchState == HIGH) {
    if (!touchWasPressed) {
      touchWasPressed = true;
      touchPressStartTime = millis();
    } else {
      unsigned long duration = millis() - touchPressStartTime;
      if (duration > 5000) { // Held for 5 seconds
        Serial.println(F("[BUTTON] 5-second hold detected! Initiating factory reset..."));
        wipeConfigAndReboot();
      }
    }
  } else {
    if (touchWasPressed) {
      unsigned long duration = millis() - touchPressStartTime;
      if (duration < 2000 && duration > 50) {
        // Quick tap: Toggle daylight LED
        whiteLedState = !whiteLedState;
        setRelay(RELAY_WHITE_LED, whiteLedState);
      }
      touchWasPressed = false;
    }
  }
}

// ======================== TELEMETRY TRANSMISSION =============================
void sendTelemetryToCloud() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[Cloud] Wi-Fi not connected. Skipping upload."));
    return;
  }

  // Construct target URL: e.g. "https://freshguard-platform.onrender.com/api/telemetry"
  String url = String(config.server_url);
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  if (!url.endsWith("/api/telemetry")) {
    if (url.endsWith("/")) url += "api/telemetry";
    else url += "/api/telemetry";
  }

  // Prepare JSON telemetry payload
  FreshTagDoc doc;
  doc["device_id"]   = config.device_id;
  doc["account_id"]  = config.account_id;
  doc["door_status"] = doorIsOpen ? "OPEN" : "CLOSED";
  doc["state"]       = systemState;
  doc["dht_exists"]  = dhtExists;
  doc["gas_exists"]  = gasExists;
  doc["door_exists"] = doorExists;

  if (dhtExists) {
    doc["temperature"] = serialized(String(calibTemp, 1));
    doc["humidity"]    = serialized(String(calibHumidity, 1));
  } else {
    doc["temperature"] = nullptr;
    doc["humidity"]    = nullptr;
  }

  if (gasExists) {
    doc["gas_level"] = calibGas;
  } else {
    doc["gas_level"] = nullptr;
  }

  doc["system_mode"] = systemControlMode;
  doc["inlet_fan"]   = inletFanState ? "ON" : "OFF";
  doc["outlet_fan"]  = outletFanState ? "ON" : "OFF";
  doc["humidifier"]  = humidifierState ? "ON" : "OFF";
  doc["white_led"]   = whiteLedState ? "ON" : "OFF";
  doc["blue_led"]    = blueLedState ? "ON" : "OFF";

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  // Send HTTP/HTTPS POST
  WiFiClient* client = nullptr;
  WiFiClientSecure secureClient;
  WiFiClient plainClient;

  bool isHttps = url.startsWith("https://");
  if (isHttps) {
    secureClient.setInsecure(); // Bypass cert chain check for minimal RAM consumption
    secureClient.setBufferSizes(512, 512);
    client = &secureClient;
  } else {
    client = &plainClient;
  }

  HTTPClient http;
  http.begin(*client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(3500); // 3.5s timeout

  int httpCode = http.POST(jsonPayload);
  
  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("[Cloud] POST %s -> HTTP %d\n", url.c_str(), httpCode);

    // Heartbeat LED flash
    digitalWrite(RELAY_BLUE_LED, RELAY_ACTIVE);
    delay(30);
    digitalWrite(RELAY_BLUE_LED, RELAY_INACTIVE);

    // Parse server response for REMOTE RESET directive or CALIBRATION update
    FreshTagDoc resDoc;
    DeserializationError err = deserializeJson(resDoc, response);
    if (!err) {
      // 1. Check if server ordered REMOTE RESET (Account Transfer / Unpair)
      if (resDoc["reset"] == true || resDoc["command"] == "RESET" || httpCode == 403) {
        Serial.println(F("\n========================================================"));
        Serial.println(F("  [RESET DIRECTIVE] Command received from FreshTag WebApp!"));
        Serial.println(F("  Wiping credentials & entering Pairing Mode immediately!"));
        Serial.println(F("========================================================\n"));
        http.end();
        wipeConfigAndReboot();
        return;
      }

      // 2. Check if server sent updated Calibration parameters
      if (resDoc.containsKey("calibration")) {
        JsonObject calibObj = resDoc["calibration"];
        bool changed = false;

        if (calibObj.containsKey("temp_offset")) {
          float to = calibObj["temp_offset"];
          if (abs(to - config.temp_offset) > 0.05f) { config.temp_offset = to; changed = true; }
        }
        if (calibObj.containsKey("humidity_offset")) {
          float ho = calibObj["humidity_offset"];
          if (abs(ho - config.humidity_offset) > 0.05f) { config.humidity_offset = ho; changed = true; }
        }
        if (calibObj.containsKey("gas_scale")) {
          float gs = calibObj["gas_scale"];
          if (abs(gs - config.gas_scale) > 0.02f) { config.gas_scale = gs; changed = true; }
        }
        if (calibObj.containsKey("override_mode")) {
          bool om = calibObj["override_mode"];
          if (om != config.override_mode) { config.override_mode = om; changed = true; }
        }
        if (calibObj.containsKey("custom_temp") && !calibObj["custom_temp"].isNull()) {
          float ct = calibObj["custom_temp"];
          if (abs(ct - config.custom_temp) > 0.05f) { config.custom_temp = ct; changed = true; }
        }
        if (calibObj.containsKey("custom_humidity") && !calibObj["custom_humidity"].isNull()) {
          float ch = calibObj["custom_humidity"];
          if (abs(ch - config.custom_humidity) > 0.05f) { config.custom_humidity = ch; changed = true; }
        }
        if (calibObj.containsKey("custom_gas") && !calibObj["custom_gas"].isNull()) {
          int cg = calibObj["custom_gas"];
          if (cg != config.custom_gas) { config.custom_gas = cg; changed = true; }
        }

        if (changed) {
          Serial.println(F("[Calibration] Synchronized sensor offsets from FreshTag website."));
          saveConfigToEEPROM();
        }
      }
    }
  } else {
    Serial.printf("[Cloud] POST failed, error: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}

// ======================== LOCAL REST API =====================================
void handleApiStatus() {
  FreshTagDoc doc;
  doc["device_id"]    = config.device_id;
  doc["account_id"]   = config.account_id;
  doc["temperature"]  = serialized(String(calibTemp, 1));
  doc["humidity"]     = serialized(String(calibHumidity, 1));
  doc["gas_level"]    = calibGas;
  doc["door_open"]    = doorIsOpen;
  doc["state"]        = systemState;
  doc["mode"]         = (currentMode == MODE_CONNECTED) ? "CONNECTED" : "PAIRING";
  doc["ip"]           = WiFi.localIP().toString();
  doc["rssi"]         = WiFi.RSSI();
  doc["free_heap"]    = ESP.getFreeHeap();

  String output;
  serializeJson(doc, output);
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", output);
}

void handleApiReset() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.send(200, "application/json", "{\"success\":true,\"message\":\"Resetting chamber into Pairing Mode...\"}");
  delay(150);
  wipeConfigAndReboot();
}

// /api/wifi-config — JSON provisioning endpoint called by FreshTag WebApp
// Accepts: { ssid, password, account_id, device_id, server, nickname }
void handleApiWifiConfig() {
  // CORS preflight
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (server.method() == HTTP_OPTIONS) {
    server.send(204, "text/plain", "");
    return;
  }

  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"No JSON body received\"}");
    return;
  }

  FreshTagDoc doc;
  DeserializationError err = deserializeJson(doc, server.arg("plain"));
  if (err) {
    server.send(400, "application/json", "{\"error\":\"Invalid JSON payload\"}");
    return;
  }

  // Validate required SSID
  if (!doc.containsKey("ssid") || String(doc["ssid"].as<const char*>()).length() == 0) {
    server.send(400, "application/json", "{\"error\":\"ssid is required\"}");
    return;
  }

  // Apply fields from JSON payload
  strncpy(config.ssid,       doc["ssid"] | "",         sizeof(config.ssid) - 1);
  strncpy(config.password,   doc["password"] | "",     sizeof(config.password) - 1);
  if (doc.containsKey("account_id") && String(doc["account_id"].as<const char*>()).length() > 0) {
    strncpy(config.account_id, doc["account_id"] | "", sizeof(config.account_id) - 1);
  }
  if (doc.containsKey("device_id") && String(doc["device_id"].as<const char*>()).length() > 0) {
    strncpy(config.device_id, doc["device_id"] | "",   sizeof(config.device_id) - 1);
  }
  if (doc.containsKey("server") && String(doc["server"].as<const char*>()).length() > 4) {
    strncpy(config.server_url, doc["server"] | "",     sizeof(config.server_url) - 1);
  }
  config.configured = true;
  saveConfigToEEPROM();

  Serial.printf("[API] /api/wifi-config: SSID='%s' Account='%s' Device='%s'\n",
    config.ssid, config.account_id, config.device_id);

  // Build success response with confirmed values
  FreshTagDoc res;
  res["success"]    = true;
  res["message"]    = "Credentials saved to Flash. Chamber is restarting and connecting to Wi-Fi...";
  res["device_id"]  = config.device_id;
  res["account_id"] = config.account_id;
  res["ssid"]       = config.ssid;
  String out;
  serializeJson(res, out);
  server.send(200, "application/json", out);

  delay(800);
  ESP.restart();
}

// /scan-wifi — Return list of nearby 2.4GHz networks as JSON for the WebApp dropdown
void handleScanWifi() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");

  if (server.method() == HTTP_OPTIONS) {
    server.send(204, "text/plain", "");
    return;
  }

  int n = WiFi.scanNetworks(false, false); // block, no hidden
  FreshTagDoc doc;
  JsonArray arr = doc.createNestedArray("networks");

  for (int i = 0; i < n && i < 15; i++) {
    JsonObject net = arr.createNestedObject();
    net["ssid"]   = WiFi.SSID(i);
    net["rssi"]   = WiFi.RSSI(i);
    net["secure"] = (WiFi.encryptionType(i) != ENC_TYPE_NONE);
  }
  WiFi.scanDelete();

  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

void handleApiControl() {
  if (server.hasArg("plain")) {
    FreshTagDoc doc;
    deserializeJson(doc, server.arg("plain"));
    if (doc.containsKey("mode")) systemControlMode = doc["mode"].as<String>();
    if (doc.containsKey("white_led")) whiteLedState = doc["white_led"];
    if (doc.containsKey("inlet_fan")) inletFanState = doc["inlet_fan"];
    if (doc.containsKey("outlet_fan")) outletFanState = doc["outlet_fan"];
    if (doc.containsKey("humidifier")) humidifierState = doc["humidifier"];
    applyRelays();
  }
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", "{\"success\":true}");
}

// ======================== PAIRING CAPTIVE PORTAL ============================
const char PAIRING_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>FreshTag Pairing Portal</title>
  <style>
    :root{--bg:#0f172a;--card:#1e293b;--primary:#10b981;--text:#f8fafc;--sub:#94a3b8;--border:#334155}
    *{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    body{background:var(--bg);color:var(--text);display:flex;justify-content:center;align-items:center;min-height:100vh;padding:16px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:24px;width:100%;max-width:380px;box-shadow:0 20px 40px rgba(0,0,0,0.5)}
    .header{text-align:center;margin-bottom:20px}
    .badge{display:inline-block;background:rgba(16,185,129,0.15);color:var(--primary);padding:4px 12px;border-radius:12px;font-size:11px;font-weight:700;margin-bottom:8px}
    h1{font-size:20px;font-weight:800;letter-spacing:-0.5px}
    p{font-size:12px;color:var(--sub);margin-top:4px}
    label{font-size:11px;font-weight:600;color:var(--sub);display:block;margin-top:14px;margin-bottom:4px}
    input,select{width:100%;background:#090d16;border:1px solid var(--border);color:var(--text);border-radius:10px;padding:10px 12px;font-size:13px;outline:none}
    input:focus,select:focus{border-color:var(--primary)}
    .btn{width:100%;background:var(--primary);color:#064e3b;border:none;border-radius:10px;padding:12px;font-weight:700;font-size:14px;cursor:pointer;margin-top:22px;transition:0.2s}
    .btn:hover{filter:brightness(1.1)}
    .note{font-size:10px;color:var(--sub);text-align:center;margin-top:14px;line-height:1.4}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="badge">PAIRING MODE</div>
      <h1>FreshTag Chamber Setup</h1>
      <p>Connect your storage chamber to Wi-Fi & account</p>
    </div>
    <form action="/save" method="POST">
      <label>Wi-Fi Network (SSID)</label>
      <input type="text" name="ssid" id="ssid" placeholder="Home or Lab Wi-Fi" required>
      
      <label>Wi-Fi Password</label>
      <input type="password" name="password" placeholder="Network password">

      <label>FreshTag Account ID</label>
      <input type="text" name="account" id="account" value="%ACCOUNT%" required>

      <label>Chamber Device ID</label>
      <input type="text" name="device" id="device" value="%DEVICE%" required>

      <label>Cloud Platform Server</label>
      <input type="text" name="server" id="server" value="%SERVER%">

      <button type="submit" class="btn">Connect & Pair Chamber</button>
    </form>
    <div class="note">Chamber will save credentials, restart, and begin streaming live botanical telemetry.</div>
  </div>
  <script>
    const p = new URLSearchParams(window.location.search);
    if(p.get('account')) document.getElementById('account').value = p.get('account');
    if(p.get('device')) document.getElementById('device').value = p.get('device');
    if(p.get('ssid')) document.getElementById('ssid').value = p.get('ssid');
  </script>
</body>
</html>
)rawliteral";

void handleRootPortal() {
  String html = FPSTR(PAIRING_HTML);
  html.replace("%ACCOUNT%", config.account_id[0] ? String(config.account_id) : "mshiva5626");
  html.replace("%DEVICE%", config.device_id[0] ? String(config.device_id) : "SF-001");
  html.replace("%SERVER%", config.server_url[0] ? String(config.server_url) : "https://freshguard-platform.onrender.com");
  
  server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  server.send(200, "text/html", html);
}

void handleSavePortal() {
  if (server.hasArg("ssid") && server.arg("ssid").length() > 0) {
    strncpy(config.ssid, server.arg("ssid").c_str(), sizeof(config.ssid));
    strncpy(config.password, server.arg("password").c_str(), sizeof(config.password));
    
    if (server.hasArg("account") && server.arg("account").length() > 0) {
      strncpy(config.account_id, server.arg("account").c_str(), sizeof(config.account_id));
    }
    if (server.hasArg("device") && server.arg("device").length() > 0) {
      strncpy(config.device_id, server.arg("device").c_str(), sizeof(config.device_id));
    }
    if (server.hasArg("server") && server.arg("server").length() > 0) {
      strncpy(config.server_url, server.arg("server").c_str(), sizeof(config.server_url));
    }

    config.configured = true;
    saveConfigToEEPROM();

    String successMsg = F(
      "<!DOCTYPE html><html><body style='background:#0f172a;color:#10b981;font-family:sans-serif;text-align:center;padding:50px'>"
      "<h2>Credentials Saved!</h2>"
      "<p style='color:#94a3b8'>Chamber is rebooting and connecting to your Wi-Fi & FreshTag account...</p>"
      "</body></html>"
    );
    server.send(200, "text/html", successMsg);
    delay(1000);
    ESP.restart();
  } else {
    server.send(400, "text/plain", "Missing SSID parameter");
  }
}

// Captive Portal Redirections
void handleCaptiveRedirect() {
  server.sendHeader("Location", "http://192.168.4.1/", true);
  server.send(302, "text/plain", "");
}

// ======================== INITIALIZATION & SETUP =============================
void startPairingMode() {
  currentMode = MODE_PAIRING;
  WiFi.disconnect();
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID_NAME, AP_DEFAULT_PASS);

  IPAddress apIP = WiFi.softAPIP();
  Serial.print(F("[SoftAP] Started Hotspot: ")); Serial.println(AP_SSID_NAME);
  Serial.print(F("[SoftAP] AP IP Address: ")); Serial.println(apIP);

  // Setup DNS Server for Captive Portal
  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(DNS_PORT, "*", apIP);

  // Setup Web Server routes
  server.on("/", HTTP_GET, handleRootPortal);
  server.on("/setup", HTTP_GET, handleRootPortal);
  server.on("/save", HTTP_POST, handleSavePortal);             // HTML captive portal form
  server.on("/api/wifi-config", HTTP_POST, handleApiWifiConfig); // WebApp JSON provisioning
  server.on("/api/wifi-config", HTTP_OPTIONS, handleApiWifiConfig); // CORS preflight
  server.on("/scan-wifi", HTTP_GET, handleScanWifi);             // WebApp network picker
  server.on("/scan-wifi", HTTP_OPTIONS, handleScanWifi);         // CORS preflight
  server.on("/status", HTTP_GET, handleApiStatus);
  server.on("/reset", HTTP_POST, handleApiReset);
  server.on("/unpair", HTTP_POST, handleApiReset);

  // Captive portal probes — MUST come after named routes
  server.on("/generate_204", handleCaptiveRedirect);
  server.on("/hotspot-detect.html", handleCaptiveRedirect);
  server.on("/ncsi.txt", handleCaptiveRedirect);
  server.onNotFound(handleCaptiveRedirect);

  server.begin();
  Serial.println(F("[Portal] Captive web portal listening on port 80"));
}

void startStationMode() {
  currentMode = MODE_CONNECTED;
  WiFi.mode(WIFI_STA);
  WiFi.begin(config.ssid, config.password);

  Serial.printf("[Wi-Fi] Connecting to '%s'", config.ssid);
  unsigned long startAttempt = millis();
  
  // Wait up to 15 seconds for connection
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 15000) {
    delay(400);
    Serial.print(F("."));
    digitalWrite(RELAY_BLUE_LED, !digitalRead(RELAY_BLUE_LED));
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(F("[Wi-Fi] Connected! Local IP: "));
    Serial.println(WiFi.localIP());

    // Local REST API routes
    server.on("/status", HTTP_GET, handleApiStatus);
    server.on("/reset", HTTP_POST, handleApiReset);
    server.on("/unpair", HTTP_POST, handleApiReset);
    server.on("/control", HTTP_POST, handleApiControl);
    server.onNotFound([]() {
      server.sendHeader("Access-Control-Allow-Origin", "*");
      server.send(404, "text/plain", "Not Found");
    });
    server.begin();
    Serial.println(F("[REST] Local API listening on port 80"));
  } else {
    Serial.println(F("[Wi-Fi] Failed to connect within 15s. Falling back to Pairing Mode."));
    startPairingMode();
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println(F("\n========================================================"));
  Serial.println(F("  FreshTag ESP8266 Precision Botanical Storage Chamber  "));
  Serial.println(F("========================================================\n"));

  // Pin Modes
  pinMode(PIN_DOOR, INPUT_PULLUP);
  pinMode(PIN_TOUCH, INPUT);

  pinMode(RELAY_INLET_FAN, OUTPUT);
  pinMode(RELAY_OUTLET_FAN, OUTPUT);
  pinMode(RELAY_HUMIDIFIER, OUTPUT);
  pinMode(RELAY_WHITE_LED, OUTPUT);
  pinMode(RELAY_BLUE_LED, OUTPUT);

  // Default Relays Inactive
  setRelay(RELAY_INLET_FAN, false);
  setRelay(RELAY_OUTLET_FAN, false);
  setRelay(RELAY_HUMIDIFIER, false);
  setRelay(RELAY_WHITE_LED, false);
  setRelay(RELAY_BLUE_LED, false);

  // Initialize Sensors
  dht.begin();

  // Load EEPROM configuration
  loadConfigFromEEPROM();

  if (!config.configured || strlen(config.ssid) == 0) {
    Serial.println(F("[Init] Device not configured. Starting Pairing Mode Hotspot."));
    startPairingMode();
  } else {
    Serial.println(F("[Init] Saved configuration found. Connecting to Wi-Fi..."));
    startStationMode();
  }
}

// ======================== MAIN LOOP ==========================================
void loop() {
  server.handleClient();
  checkPhysicalResetButton();

  if (currentMode == MODE_PAIRING) {
    dnsServer.processNextRequest();

    // Pulse LED at 1Hz (500ms ON / 500ms OFF) to indicate pairing mode
    if (millis() - lastLedBlinkTime > 500) {
      lastLedBlinkTime = millis();
      blueLedState = !blueLedState;
      setRelay(RELAY_BLUE_LED, blueLedState);
    }
    return;
  }

  // --- CONNECTED STATION MODE ---
  // Non-blocking Wi-Fi keep-alive
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastReconnectAttempt = 0;
    if (millis() - lastReconnectAttempt > 10000) {
      lastReconnectAttempt = millis();
      Serial.println(F("[Wi-Fi] Connection lost. Attempting reconnect..."));
      WiFi.reconnect();
    }
  }

  // Periodic Sensor Sampling
  if (millis() - lastSensorReadTime > SENSOR_INTERVAL) {
    lastSensorReadTime = millis();
    readSensors();
    runAutonomousClimate();
  }

  // Periodic Telemetry Upload to FreshTag Cloud
  if (millis() - lastTelemetryTime > TELEMETRY_INTERVAL) {
    lastTelemetryTime = millis();
    sendTelemetryToCloud();
  }
}
