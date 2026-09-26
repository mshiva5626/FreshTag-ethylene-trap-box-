/**
 * Smart FreshGuard - ESP32 & Hardware Chamber Simulator
 * Realistic environmental dynamics and physics engine for testing without hardware
 */

export class HardwareSimulator {
  constructor(stateMachine, presetsManager) {
    this.fsm = stateMachine;
    this.presetsManager = presetsManager;

    // Environmental parameters inside chamber
    this.temperature = 2.4;    // °C
    this.humidity = 92;        // % RH
    this.gasLevel = 215;       // ppm MQ sensor reading
    
    // Ambient outside room conditions
    this.ambientTemp = 24.5;
    this.ambientHumidity = 55;
    this.ambientGas = 120;

    // Internal simulation timer
    this.simInterval = null;
    this.logCallbacks = [];
  }

  onLog(cb) {
    this.logCallbacks.push(cb);
  }

  log(msg) {
    const timestamp = new Date().toLocaleTimeString();
    const logLine = `[ESP32 ${timestamp}] ${msg}`;
    this.logCallbacks.forEach(cb => cb(logLine));
  }

  start() {
    this.log("Firmware v2.4 initialized. Wi-Fi connected to SF-AP. IP: 192.168.1.105");
    this.log("DHT22 & MQ gas sensors calibrated. IR door interlock ACTIVE.");

    if (this.simInterval) clearInterval(this.simInterval);
    this.simInterval = setInterval(() => {
      this.tick();
    }, 1500);
  }

  stop() {
    if (this.simInterval) clearInterval(this.simInterval);
  }

  tick() {
    const snap = this.fsm.getSnapshot();
    const activePreset = this.presetsManager.getActivePreset();

    // 1. Environmental Physics Simulation
    if (snap.doorStatus === "OPEN") {
      // Influx of ambient room air
      this.temperature += (this.ambientTemp - this.temperature) * 0.08;
      this.humidity += (this.ambientHumidity - this.humidity) * 0.09;
      this.gasLevel += (this.ambientGas - this.gasLevel) * 0.07;
    } else {
      // Door is CLOSED: produce respiration and actuator effects
      // Natural ripening gas accumulation from produce
      this.gasLevel += 0.8 + (Math.random() * 1.2);

      // Fans effect (Purge gas & cool)
      if (snap.inletFan && snap.outletFan) {
        this.gasLevel = Math.max(130, this.gasLevel - 4.5);
        this.temperature = Math.max(activePreset.temp_min, this.temperature - 0.25);
      }

      // Humidifier effect
      if (snap.humidifier) {
        this.humidity = Math.min(99, this.humidity + 1.2);
      } else {
        // Natural gradual moisture loss
        this.humidity = Math.max(70, this.humidity - 0.15);
      }

      // Chamber cooling towards preset target
      if (this.temperature > activePreset.temp_target) {
        this.temperature -= 0.08;
      }
    }

    // Add tiny sensor noise (+/- 0.05°C, +/- 0.2% RH, +/- 1 ppm)
    const noisyTemp = parseFloat((this.temperature + (Math.random() * 0.1 - 0.05)).toFixed(1));
    const noisyHum = Math.round(Math.min(100, Math.max(10, this.humidity + (Math.random() * 0.6 - 0.3))));
    const noisyGas = Math.round(Math.max(50, this.gasLevel + (Math.random() * 2 - 1)));

    const telemetry = {
      device_id: "SF-001",
      door_status: snap.doorStatus,
      state: snap.state,
      temperature: noisyTemp,
      humidity: noisyHum,
      gas_level: noisyGas,
      system_mode: snap.systemMode,
      inlet_fan: snap.inletFan ? "ON" : "OFF",
      outlet_fan: snap.outletFan ? "ON" : "OFF",
      humidifier: snap.humidifier ? "ON" : "OFF",
      blue_led: snap.blueLed ? "ON" : "OFF",
      white_led: snap.whiteLed ? "ON" : "OFF",
      timestamp: new Date().toISOString()
    };

    // Auto-control logic
    this.fsm.evaluateAutoControl(telemetry, activePreset);

    return telemetry;
  }

  // User Interactive Actions
  simulateDoorOpen() {
    this.log(">>> IR Sensor Trigger: DOOR OPENED (GPIO14 = HIGH) <<<");
    this.log("SAFETY INTERLOCK: Relays D1 (Inlet Fan), D2 (Outlet Fan), D7 (Humidifier) -> OFF");
    this.fsm.setDoorStatus("OPEN");
  }

  simulateDoorClose() {
    this.log(">>> IR Sensor Trigger: DOOR CLOSED (GPIO14 = LOW) <<<");
    this.log("Stabilization: Starting 5000ms delay. Control loop holding...");
    this.fsm.setDoorStatus("CLOSED");
  }

  simulateGasSpike() {
    this.gasLevel += 130;
    this.log(`[MQ Sensor Spike] Ripening gas/Ethylene burst detected! Gas index jumped to ${Math.round(this.gasLevel)} ppm`);
  }

  simulateLowHumidity() {
    this.humidity = 68;
    this.log("[DHT22 Alert] Humidity dropped to 68%! Below minimum threshold.");
  }

  simulateTouchSensor() {
    this.log("[Touch Sensor TTP223] Capacitive pulse on GPIO12. Toggling White LED relay...");
    return this.fsm.triggerTouchSensor();
  }
}
