/**
 * Smart FreshGuard - Core Safety State Machine
 * Implements the 5-second Door Recovery & Safety Interlock Workflow
 */

export const ChamberState = {
  NORMAL: "NORMAL",
  DOOR_OPEN: "DOOR_OPEN",
  WAIT_5_SECONDS: "WAIT_5_SECONDS",
  RESTART: "RESTART",
  ALERT: "ALERT"
};

export class FreshGuardStateMachine {
  constructor(options = {}) {
    this.currentState = ChamberState.NORMAL;
    this.doorStatus = "CLOSED"; // "OPEN" or "CLOSED"
    this.systemMode = "AUTO";   // "AUTO" or "MANUAL"
    
    // Actuators
    this.inletFan = false;
    this.outletFan = false;
    this.humidifier = false;
    this.whiteLed = true;
    this.blueLed = false;

    // Cumulative IoT & Agronomic metrics
    this.startTime = Date.now();
    this.doorOpenCount = 0;
    this.cumulativeGasSeconds = 0; // for ppm*h calculation
    this.purgeCycleCount = 0;
    this.lastGasLevel = 215;

    // Countdown details
    this.recoveryDelayMs = options.recoveryDelayMs || 5000;
    this.countdownTimerId = null;
    this.countdownStartTime = null;
    this.remainingMs = 0;

    // Listeners
    this.listeners = [];
    this.stateChangeListeners = [];
  }

  onUpdate(callback) {
    this.listeners.push(callback);
  }

  onStateChange(callback) {
    this.stateChangeListeners.push(callback);
  }

  notifyUpdate(eventMeta = {}) {
    const payload = this.getSnapshot(eventMeta);
    this.listeners.forEach(cb => cb(payload));
  }

  notifyStateChange(oldState, newState, reason = "") {
    this.stateChangeListeners.forEach(cb => cb({ oldState, newState, reason, timestamp: new Date() }));
  }

  getSnapshot(extra = {}) {
    const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
    const cumulativePpmHours = parseFloat(((this.cumulativeGasSeconds) / 3600).toFixed(2));

    return {
      state: this.currentState,
      doorStatus: this.doorStatus,
      systemMode: this.systemMode,
      inletFan: this.inletFan,
      outletFan: this.outletFan,
      humidifier: this.humidifier,
      whiteLed: this.whiteLed,
      blueLed: this.blueLed,
      remainingSeconds: (this.remainingMs / 1000).toFixed(1),
      countdownPercent: this.currentState === ChamberState.WAIT_5_SECONDS 
        ? Math.min(100, Math.max(0, ((this.recoveryDelayMs - this.remainingMs) / this.recoveryDelayMs) * 100))
        : (this.currentState === ChamberState.NORMAL ? 100 : 0),
      doorOpenCount: this.doorOpenCount,
      cumulativePpmHours: cumulativePpmHours,
      purgeCycleCount: this.purgeCycleCount,
      uptimeSeconds: uptimeSec,
      timestamp: new Date().toISOString(),
      ...extra
    };
  }

  /**
   * Door Event Handler: Handles IR sensor detecting OPEN or CLOSED
   */
  setDoorStatus(newStatus) {
    const prevDoor = this.doorStatus;
    const oldState = this.currentState;

    if (newStatus === "OPEN") {
      this.doorStatus = "OPEN";
      this.doorOpenCount++;
      
      // If timer was running, cancel immediately!
      if (this.countdownTimerId) {
        clearInterval(this.countdownTimerId);
        this.countdownTimerId = null;
        this.remainingMs = 0;
      }

      // 🔴 Door OPEN — Safety / Pause Mode:
      // 1. Immediately stop inlet fan
      // 2. Immediately stop outlet fan
      // 3. Immediately stop humidifier
      // 4. Automatic control is paused
      this.inletFan = false;
      this.outletFan = false;
      this.humidifier = false;
      this.currentState = ChamberState.DOOR_OPEN;

      this.notifyStateChange(oldState, this.currentState, "Door opened: Safety Interlock stopped fans & humidifier");
      this.notifyUpdate({ event: "DOOR_OPENED" });
      return;
    }

    if (newStatus === "CLOSED") {
      this.doorStatus = "CLOSED";

      // If already closed and running, do nothing
      if (prevDoor === "CLOSED" && this.currentState === ChamberState.NORMAL) {
        return;
      }

      // 🟢 Door CLOSED — Start 5-second countdown recovery workflow
      // DO NOT immediately restart the fans!
      this.currentState = ChamberState.WAIT_5_SECONDS;
      this.countdownStartTime = Date.now();
      this.remainingMs = this.recoveryDelayMs;

      this.notifyStateChange(oldState, this.currentState, "Door closed: Starting 5-second chamber stabilization countdown");
      this.notifyUpdate({ event: "COUNTDOWN_STARTED" });

      if (this.countdownTimerId) {
        clearInterval(this.countdownTimerId);
      }

      this.countdownTimerId = setInterval(() => {
        // Double check: if door was opened, abort!
        if (this.doorStatus === "OPEN") {
          clearInterval(this.countdownTimerId);
          this.countdownTimerId = null;
          this.currentState = ChamberState.DOOR_OPEN;
          this.remainingMs = 0;
          this.notifyUpdate({ event: "COUNTDOWN_ABORTED" });
          return;
        }

        const elapsed = Date.now() - this.countdownStartTime;
        this.remainingMs = Math.max(0, this.recoveryDelayMs - elapsed);

        if (this.remainingMs <= 0) {
          // 5 seconds completed without interruption!
          clearInterval(this.countdownTimerId);
          this.countdownTimerId = null;
          this.remainingMs = 0;

          // Transition to RESTART then NORMAL
          const prior = this.currentState;
          this.currentState = ChamberState.RESTART;
          this.notifyStateChange(prior, ChamberState.RESTART, "5s elapsed: Chamber stabilized, restarting fans and sensors");
          this.notifyUpdate({ event: "RESTART_TRIGGERED" });

          // Resume normal climate control workflow
          setTimeout(() => {
            this.currentState = ChamberState.NORMAL;
            this.notifyStateChange(ChamberState.RESTART, ChamberState.NORMAL, "System active: climate monitoring resumed");
            this.notifyUpdate({ event: "NORMAL_RESUMED" });
          }, 300);
        } else {
          this.notifyUpdate({ event: "COUNTDOWN_TICK" });
        }
      }, 100);
    }
  }

  /**
   * Set Operating Mode (AUTO vs MANUAL)
   */
  setSystemMode(mode) {
    this.systemMode = mode;
    this.notifyUpdate({ event: "MODE_CHANGED", mode });
  }

  /**
   * Manual Actuator Control (Only allowed if NOT blocked by door interlock)
   */
  setManualActuator(actuator, state) {
    if (this.systemMode !== "MANUAL") {
      return { success: false, reason: "Switch to MANUAL mode to toggle devices manually" };
    }

    // Safety Interlock Check
    if (this.doorStatus === "OPEN" && (actuator === "inletFan" || actuator === "outletFan" || actuator === "humidifier")) {
      return { success: false, reason: "Safety Interlock: Cannot operate fans or humidifier while door is OPEN" };
    }

    if (this.currentState === ChamberState.WAIT_5_SECONDS && (actuator === "inletFan" || actuator === "outletFan" || actuator === "humidifier")) {
      return { success: false, reason: "Stabilizing: Wait for 5-second countdown to complete" };
    }

    this[actuator] = !!state;
    this.notifyUpdate({ event: "ACTUATOR_MANUAL_TOGGLE", actuator, state: this[actuator] });
    return { success: true };
  }

  /**
   * Touch Sensor local trigger for White LED
   */
  triggerTouchSensor() {
    this.whiteLed = !this.whiteLed;
    this.notifyUpdate({ event: "TOUCH_SENSOR_TRIGGERED", whiteLed: this.whiteLed });
    return this.whiteLed;
  }

  /**
   * Apply Automatic Climate Evaluation based on current sensor readings and crop thresholds
   */
  evaluateAutoControl(telemetry, thresholds) {
    // If door is OPEN or WAITING 5s, DO NOT RUN ACTUATORS!
    if (this.doorStatus === "OPEN" || this.currentState === ChamberState.WAIT_5_SECONDS) {
      this.inletFan = false;
      this.outletFan = false;
      this.humidifier = false;
      return;
    }

    if (this.systemMode !== "AUTO") return;

    let hasAlert = false;

    // 1. Humidity Control
    if (telemetry.humidity < thresholds.humidity_min) {
      this.humidifier = true;
    } else if (telemetry.humidity >= thresholds.humidity_max) {
      this.humidifier = false;
    }

    // Track cumulative gas exposure
    if (telemetry.gas_level) {
      this.cumulativeGasSeconds += (telemetry.gas_level * 1.5);
    }

    // 2. Gas / Ripening Control (Ethylene purge)
    if (telemetry.gas_level > thresholds.gas_threshold) {
      if (!this.inletFan || !this.outletFan) {
        this.purgeCycleCount++;
      }
      this.inletFan = true;
      this.outletFan = true;
      hasAlert = true;
    } else {
      // Temperature Cooling or gentle fresh air
      if (telemetry.temperature > thresholds.temp_max) {
        this.inletFan = true;
        this.outletFan = true;
      } else {
        this.inletFan = false;
        this.outletFan = false;
      }
    }

    // Update state alert if threshold breached
    if (hasAlert) {
      if (this.currentState !== ChamberState.ALERT) {
        this.currentState = ChamberState.ALERT;
        this.notifyStateChange(ChamberState.NORMAL, ChamberState.ALERT, "Gas/Ethylene threshold breached: Venting chamber");
      }
    } else if (this.currentState === ChamberState.ALERT) {
      this.currentState = ChamberState.NORMAL;
      this.notifyStateChange(ChamberState.ALERT, ChamberState.NORMAL, "Gas levels normalized");
    }

    this.notifyUpdate({ event: "AUTO_EVALUATED" });
  }
}
