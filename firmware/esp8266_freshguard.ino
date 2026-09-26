/*
 ==============================================================================
   Smart FreshGuard - ESP8266 Firmware
   IoT Intelligent Storage Chamber for Fruits and Vegetables
   
   Hardware Components:
   - ESP8266 (NodeMCU v2/v3 or WeMos D1 Mini)
   - DHT22 (Temperature & Relative Humidity Sensor)
   - MQ Gas Sensor (Ethylene / VOC / Ripening gas indicator)
   - IR Obstacle/Door Sensor (Active LOW / HIGH)
   - Capacitive Touch Sensor (TTP223 - Local White LED Toggle)
   - 4 or 8-Channel Relay Module (Inlet Fan, Outlet Fan, Humidifier, Blue LED, White LED)
   
   Safety Workflow:
   - Door OPEN: Immediately stops Inlet Fan, Outlet Fan, Humidifier. System PAUSED.
   - Door CLOSED: Starts 5000ms stabilization countdown.
   - If door re-opens during countdown: Timer aborted, remains PAUSED.
   - If door remains closed 5s: Fans restart, sensors read, control logic resumes,
     and updated data is transmitted to the Web App.
 ==============================================================================
*/

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <WiFiClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ======================== WI-FI CONFIGURATION ========================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Server API Endpoint (IP address of the machine hosting the FreshGuard Web App)
const char* SERVER_HOST   = "http://192.168.1.100:8080/api/telemetry";
const char* DEVICE_ID     = "SF-001";

// ======================== PIN ASSIGNMENTS ============================
// DHT22 Pin
#define DHTPIN               D4     // GPIO2
#define DHTTYPE              DHT22

// MQ Gas Sensor Pin (Analog)
#define MQ_PIN               A0     // ADC0 (0-1023)

// IR Door Sensor Pin (Obstacle sensor detecting door frame)
#define IR_DOOR_PIN          D5     // GPIO14 (INPUT_PULLUP)
#define DOOR_IS_OPEN_LEVEL   HIGH   // Set HIGH or LOW depending on your IR sensor output when door is open

// Capacitive Touch Sensor (Local White LED control)
#define TOUCH_PIN            D6     // GPIO12

// Relay Outputs (Active LOW for standard Arduino Relay Modules, change to HIGH if Active HIGH)
#define RELAY_ACTIVE_LEVEL   LOW
#define RELAY_INACTIVE_LEVEL HIGH

#define RELAY_INLET_FAN      D1     // GPIO5
#define RELAY_OUTLET_FAN     D2     // GPIO4
#define RELAY_HUMIDIFIER     D7     // GPIO13
#define RELAY_BLUE_LED       D8     // GPIO15
#define RELAY_WHITE_LED      D3     // GPIO0

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

// Sensor Readings
float temperature            = 22.5;
float humidity               = 70.0;
int gasLevel                 = 210;
bool isDoorOpen              = false;

// Actuator States
bool inletFanState           = false;
bool outletFanState          = false;
bool humidifierState         = false;
bool blueLedState            = false;
bool whiteLedState           = false;

// Configurable Thresholds (Can be updated via API from Web App)
float tempMinThreshold       = 1.0;
float tempMaxThreshold       = 4.0;
float humidityMinThreshold   = 90.0;
float humidityMaxThreshold   = 95.0;
int   gasThresholdPpm        = 230;

// Timing variables
unsigned long doorClosedTimestamp   = 0;
const unsigned long RECOVERY_DELAY_MS = 5000; // 5-second stabilization
unsigned long lastTelemetryUpload    = 0;
const unsigned long TELEMETRY_INTERVAL = 3000; // Upload every 3s

// Touch sensor debounce
bool lastTouchState                 = LOW;
unsigned long lastTouchDebounce      = 0;

// Objects
DHT dht(DHTPIN, DHTTYPE);
ESP8266WebServer localServer(80);

// ======================== RELAY CONTROL HELPER =======================
void setRelay(uint8_t pin, bool state) {
  digitalWrite(pin, state ? RELAY_ACTIVE_LEVEL : RELAY_INACTIVE_LEVEL);
}

// ======================== SETUP ======================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n\n==========================================");
  Serial.println("  Smart FreshGuard - Chamber Initializing ");
  Serial.println("==========================================");

  // Initialize Sensors
  pinMode(IR_DOOR_PIN, INPUT_PULLUP);
  pinMode(TOUCH_PIN, INPUT);
  dht.begin();

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

  // Connect to Wi-Fi
  Serial.print("Connecting to Wi-Fi SSID: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[Wi-Fi] Connected!");
    Serial.print("[Wi-Fi] IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[Wi-Fi] Connection timeout. Operating in Standalone/Offline mode.");
  }

  // Setup Local HTTP API Server for direct local commands
  setupLocalHttpServer();

  // Initial sensor check
  checkDoorStatus();
  if (isDoorOpen) {
    currentState = STATE_DOOR_OPEN;
    Serial.println("[State] Initial State: DOOR OPEN (PAUSED)");
  } else {
    currentState = STATE_NORMAL;
    Serial.println("[State] Initial State: NORMAL (DOOR CLOSED)");
  }
}

// ======================== MAIN LOOP ==================================
void loop() {
  localServer.handleClient();

  // 1. Read Local Touch Sensor (Instant White LED toggle)
  handleTouchSensor();

  // 2. Read IR Door Sensor and run Door Workflow State Machine
  handleDoorWorkflow();

  // 3. Sensor Sampling and Auto-Control Logic
  if (currentState == STATE_NORMAL && systemMode == "AUTO") {
    executeAutoClimateControl();
  }

  // 4. Send Periodic Telemetry to Web App
  if (millis() - lastTelemetryUpload >= TELEMETRY_INTERVAL) {
    lastTelemetryUpload = millis();
    readSensors();
    uploadTelemetry();
  }
}

// ======================== SENSOR READING =============================
void readSensors() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (!isnan(h) && !isnan(t)) {
    humidity = h;
    temperature = t;
  } else {
    Serial.println("[DHT22] Warning: Failed to read DHT sensor!");
  }

  // Read MQ Gas Sensor (ADC 0-1023)
  int rawGas = analogRead(MQ_PIN);
  gasLevel = rawGas; // Mapped or raw calibrated value
}

// ======================== DOOR WORKFLOW LOGIC ========================
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
        Serial.println("\n[SAFETY INTERLOCK] >>> DOOR OPEN DETECTED! <<<");
        currentState = STATE_DOOR_OPEN;
        
        // Immediately stop active devices
        inletFanState = false;
        outletFanState = false;
        humidifierState = false;
        setRelay(RELAY_INLET_FAN, false);
        setRelay(RELAY_OUTLET_FAN, false);
        setRelay(RELAY_HUMIDIFIER, false);
        
        Serial.println("[Actuators] Inlet Fan: OFF, Outlet Fan: OFF, Humidifier: OFF");
        Serial.println("[State] System PAUSED. Awaiting door closure.");
        
        // Immediate upload of door-open event
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
      // Critical check: Did the door re-open during the 5-second countdown?
      if (currentDoorState == true) {
        Serial.println("\n[SAFETY] >>> DOOR RE-OPENED DURING COUNTDOWN! CANCELLING TIMER <<<");
        currentState = STATE_DOOR_OPEN;
        // Keep actuators stopped
        inletFanState = false;
        outletFanState = false;
        humidifierState = false;
        setRelay(RELAY_INLET_FAN, false);
        setRelay(RELAY_OUTLET_FAN, false);
        setRelay(RELAY_HUMIDIFIER, false);
        return;
      }

      // Check if 5-second delay has completed
      if (millis() - doorClosedTimestamp >= RECOVERY_DELAY_MS) {
        Serial.println("\n[RECOVERY] >>> 5 SECONDS ELAPSED! CHAMBER STABILIZED <<<");
        currentState = STATE_RESTART;
        
        // Resume sensor workflow
        Serial.println("[Sensors] Reading fresh DHT22 & MQ sensor values...");
        readSensors();
        
        // Resume automatic control
        currentState = STATE_NORMAL;
        Serial.println("[State] Resuming Normal Climate Control Workflow.");
        
        if (systemMode == "AUTO") {
          executeAutoClimateControl();
        }
        
        // Upload fresh state
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

  // 1. Humidity Control
  if (humidity < humidityMinThreshold) {
    humidifierState = true;
    setRelay(RELAY_HUMIDIFIER, true);
  } else if (humidity >= humidityMaxThreshold) {
    humidifierState = false;
    setRelay(RELAY_HUMIDIFIER, false);
  }

  // 2. Gas / Ripening Control (Ethylene venting)
  if (gasLevel > gasThresholdPpm) {
    inletFanState = true;
    outletFanState = true;
    setRelay(RELAY_INLET_FAN, true);
    setRelay(RELAY_OUTLET_FAN, true);
    currentState = STATE_ALERT;
  } else {
    // Standard temperature cooling or gentle circulation
    if (temperature > tempMaxThreshold) {
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
      Serial.print("[Touch Sensor] Local Toggle: White LED is now ");
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

  http.begin(client, SERVER_HOST);
  http.addHeader("Content-Type", "application/json");

  // Create JSON payload matching Smart FreshGuard spec
  StaticJsonDocument<384> doc;
  doc["device_id"]   = DEVICE_ID;
  doc["door_status"] = isDoorOpen ? "OPEN" : "CLOSED";
  doc["state"]       = (currentState == STATE_DOOR_OPEN) ? "DOOR_OPEN" :
                       (currentState == STATE_WAIT_5_SECONDS) ? "WAIT_5_SECONDS" :
                       (currentState == STATE_ALERT) ? "ALERT" : "NORMAL";
  doc["temperature"] = serialized(String(temperature, 1));
  doc["humidity"]    = (int)humidity;
  doc["gas_level"]   = gasLevel;
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
    Serial.printf("[HTTP POST] Failed, error: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}

// ======================== LOCAL WEB SERVER API =======================
void setupLocalHttpServer() {
  localServer.on("/status", HTTP_GET, []() {
    StaticJsonDocument<384> doc;
    doc["device_id"]   = DEVICE_ID;
    doc["door_status"] = isDoorOpen ? "OPEN" : "CLOSED";
    doc["temperature"] = temperature;
    doc["humidity"]    = humidity;
    doc["gas_level"]   = gasLevel;
    doc["inlet_fan"]   = inletFanState;
    doc["outlet_fan"]  = outletFanState;
    doc["humidifier"]  = humidifierState;
    doc["blue_led"]    = blueLedState;
    doc["white_led"]   = whiteLedState;
    String res;
    serializeJson(doc, res);
    localServer.send(200, "application/json", res);
  });

  localServer.on("/control", HTTP_POST, []() {
    if (localServer.hasArg("plain")) {
      StaticJsonDocument<256> doc;
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
        blueLedState = (doc["blue_led"] == "ON" || doc["blue_led"] == true);
        setRelay(RELAY_BLUE_LED, blueLedState);
      }
      localServer.send(200, "application/json", "{\"status\":\"ok\"}");
    } else {
      localServer.send(400, "text/plain", "Missing body");
    }
  });

  localServer.begin();
  Serial.println("[HTTP Server] Local REST endpoints started on port 80");
}
