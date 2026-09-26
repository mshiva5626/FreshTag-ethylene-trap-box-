/**
 * Smart FreshGuard - Main Application Controller
 */

import { CROP_PRESETS, getPresetById, classifyGasQuality, calculatePostHarvestMetrics } from "./presets.js";
import { FreshGuardStateMachine, ChamberState } from "./state-machine.js";
import { HardwareSimulator } from "./simulator.js";
import { TelemetryCharts } from "./charts.js";
import { HistoryLogger } from "./logger.js";
import { ApiClient } from "./api-client.js";

class FreshGuardApp {
  constructor() {
    this.fsm = new FreshGuardStateMachine({ recoveryDelayMs: 5000 });
    this.api = new ApiClient();
    this.currentPresetKey = "apples";
    this.customThresholds = { ...CROP_PRESETS.apples };

    // Presets Manager helper
    this.presetsManager = {
      getActivePreset: () => this.customThresholds,
      getAllPresets: () => CROP_PRESETS
    };

    this.simulator = new HardwareSimulator(this.fsm, this.presetsManager);
    this.charts = new TelemetryCharts("tempHumidityChart", "gasRipeningChart");
    this.logger = new HistoryLogger("historyTableBody");

    this.lastDoorStatus = "CLOSED";
    this.doorTimerDuration = 5.0;

    // Toast manager
    this.toastContainer = document.getElementById("toastContainer");
  }

  init() {
    console.log("Initializing Smart FreshGuard Web Application...");

    // Bind DOM events
    this.bindNavbar();
    this.bindPresets();
    this.bindThresholdControls();
    this.bindActuatorSwitches();
    this.bindChamberInteractions();
    this.bindSimulatorDrawer();
    this.bindModals();
    this.bindHistoryControls();

    // Subscribe to State Machine updates
    this.fsm.onUpdate((snapshot) => {
      this.renderStateUpdate(snapshot);
    });

    this.fsm.onStateChange(({ oldState, newState, reason }) => {
      this.handleStateTransitionAlert(oldState, newState, reason);
    });

    // Subscribe to simulator logs
    this.simulator.onLog((logMsg) => {
      this.appendSerialLog(logMsg);
    });

    // Start Hardware Simulator
    this.simulator.start();

    // Regular Telemetry Poll & Chart updates
    setInterval(() => {
      this.pollTelemetryLoop();
    }, 2000);

    // Initial render
    this.renderPresetsCarousel();
    this.syncFormWithThresholds();
    this.renderStateUpdate(this.fsm.getSnapshot());

    // API connectivity listener
    this.api.onConnectionStatusChange = (connected) => {
      const dot = document.getElementById("connectionDot");
      const text = document.getElementById("connectionStatusText");
      if (dot && text) {
        if (connected) {
          dot.className = "pulse-dot";
          text.textContent = "ESP32 REST API Online";
        } else {
          dot.className = "pulse-dot warning";
          text.textContent = "Chamber Sim / Local Mode";
        }
      }
    };
    this.api.checkServerHealth();

    this.showToast("Smart FreshGuard Ready", "Storage chamber safety systems initialized.", "toast-success");
  }

  showToast(title, desc, type = "toast-info") {
    if (!this.toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-desc">${desc}</div>
      </div>
      <button class="toast-close" title="Dismiss">&times;</button>
    `;

    toast.querySelector(".toast-close").addEventListener("click", () => {
      toast.classList.add("hiding");
      setTimeout(() => toast.remove(), 300);
    });

    this.toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add("hiding");
        setTimeout(() => toast.remove(), 300);
      }
    }, 4500);
  }

  handleStateTransitionAlert(oldState, newState, reason) {
    if (newState === ChamberState.DOOR_OPEN) {
      this.showToast(
        "⚠ DOOR OPEN — SAFETY PAUSE",
        "IR Sensor detected open door. Fans and humidifier stopped immediately to isolate chamber.",
        "toast-danger"
      );
    } else if (newState === ChamberState.WAIT_5_SECONDS) {
      this.showToast(
        "✓ DOOR CLOSED — COUNTDOWN STARTED",
        "IR Sensor detected closed door. Stabilizing chamber atmosphere for 5.0 seconds...",
        "toast-warning"
      );
    } else if (newState === ChamberState.RESTART) {
      this.showToast(
        "✓ CHAMBER STABILIZED — RESTARTS ACTIVE",
        "5-second delay complete. Fresh sensor readings acquired and automatic control workflow resumed.",
        "toast-success"
      );
    } else if (newState === ChamberState.ALERT) {
      this.showToast(
        "🚨 RIPENING GAS / ETHYLENE SPIKE",
        "MQ Gas sensor exceeded threshold! Emergency ventilation purge activated.",
        "toast-danger"
      );
    }
  }

  /**
   * Main Telemetry Loop (Runs every 2s)
   */
  async pollTelemetryLoop() {
    let telemetry = null;

    // Check if real backend is available
    if (this.api.isConnected) {
      telemetry = await this.api.getLatestTelemetry();
    }

    // Fallback to local simulator
    if (!telemetry) {
      telemetry = this.simulator.tick();
    }

    if (!telemetry) return;

    // Update Telemetry metric UI
    this.renderTelemetryMetrics(telemetry);

    // Post-Harvest Intelligence Panel
    this.renderIntelligencePanel(telemetry);

    // Add to real-time charts & history table
    this.charts.addPoint(telemetry);
    this.logger.addRecord(telemetry);

    // Sync to backend if we're running as master client
    if (this.api.isConnected) {
      this.api.postTelemetry(telemetry);
    }
  }

  /**
   * Render Live Telemetry Metric Cards
   */
  renderTelemetryMetrics(data) {
    // 1. Temperature
    const tempVal = document.getElementById("metricTempValue");
    const tempRange = document.getElementById("tempSafeRangeText");
    const tempFill = document.getElementById("tempRangeFill");
    if (tempVal) tempVal.textContent = data.temperature.toFixed(1);
    if (tempRange) tempRange.textContent = `${this.customThresholds.temp_min} - ${this.customThresholds.temp_max} °C`;
    if (tempFill) {
      const pct = Math.min(100, Math.max(0, ((data.temperature - this.customThresholds.temp_min) / (this.customThresholds.temp_max - this.customThresholds.temp_min)) * 100));
      tempFill.style.width = `${pct}%`;
    }

    // 2. Humidity
    const humVal = document.getElementById("metricHumValue");
    const humRange = document.getElementById("humSafeRangeText");
    const humFill = document.getElementById("humRangeFill");
    if (humVal) humVal.textContent = `${data.humidity}`;
    if (humRange) humRange.textContent = `${this.customThresholds.humidity_min} - ${this.customThresholds.humidity_max} %`;
    if (humFill) {
      const pct = Math.min(100, Math.max(0, ((data.humidity - 50) / 50) * 100));
      humFill.style.width = `${pct}%`;
    }

    // 3. Gas / Air Quality
    const gasVal = document.getElementById("metricGasValue");
    const gasTag = document.getElementById("metricGasTag");
    if (gasVal) gasVal.textContent = `${data.gas_level}`;
    if (gasTag) {
      const quality = classifyGasQuality(data.gas_level, this.customThresholds.gas_threshold);
      gasTag.textContent = quality.text;
      gasTag.style.color = quality.color;
      gasTag.style.backgroundColor = `${quality.color}22`;
    }

    // 4. Door Status Card
    const doorPill = document.getElementById("metricDoorPill");
    const doorIcon = document.getElementById("doorMetricIconWrap");
    if (doorPill) {
      if (data.door_status === "OPEN") {
        doorPill.className = "door-status-pill door-open-pill";
        doorPill.innerHTML = `<span>⚠️</span> OPEN`;
        if (doorIcon) doorIcon.className = "metric-icon-wrap icon-door open";
      } else {
        doorPill.className = "door-status-pill door-closed-pill";
        doorPill.innerHTML = `<span>✓</span> CLOSED`;
        if (doorIcon) doorIcon.className = "metric-icon-wrap icon-door";
      }
    }

    // Update chamber cutaway sensor tags
    const probeTemp = document.getElementById("probeTempText");
    const probeHum = document.getElementById("probeHumText");
    const probeGas = document.getElementById("probeGasText");
    if (probeTemp) probeTemp.textContent = `${data.temperature.toFixed(1)}°C`;
    if (probeHum) probeHum.textContent = `${data.humidity}%`;
    if (probeGas) probeGas.textContent = `${data.gas_level} ppm`;

    // Synchronize 3D Hero Section & Stats Card
    const heroTemp = document.getElementById("heroTemp");
    const heroHum = document.getElementById("heroHum");
    const heroGas = document.getElementById("heroGas");
    const heroDoor = document.getElementById("heroDoor");
    const statCardTemp = document.getElementById("statCardTemp");
    const statCardHum = document.getElementById("statCardHum");
    const statCardGas = document.getElementById("statCardGas");
    const statCardDoor = document.getElementById("statCardDoor");
    const statBarTemp = document.getElementById("statBarTemp");
    const statBarHum = document.getElementById("statBarHum");
    const statBarGas = document.getElementById("statBarGas");
    const tickTemp = document.getElementById("tickTemp");
    const tickHum = document.getElementById("tickHum");
    const tickGas = document.getElementById("tickGas");

    const tDisplay = `${data.temperature.toFixed(1)}°C`;
    const hDisplay = `${data.humidity}%`;
    const gDisplay = `${data.gas_level} ppm`;
    const isClosed = data.door_status === "CLOSED";

    if (heroTemp) heroTemp.textContent = tDisplay;
    if (heroHum) heroHum.textContent = hDisplay;
    if (heroGas) heroGas.textContent = gDisplay;
    if (heroDoor) {
      heroDoor.textContent = isClosed ? "SECURED" : "OPEN";
      heroDoor.style.color = isClosed ? "#34D399" : "#EF4444";
    }

    if (statCardTemp) statCardTemp.textContent = tDisplay;
    if (statCardHum) statCardHum.textContent = hDisplay;
    if (statCardGas) statCardGas.textContent = gDisplay;
    if (statCardDoor) {
      statCardDoor.textContent = isClosed ? "CLOSED" : "OPEN";
      statCardDoor.style.color = isClosed ? "#34D399" : "#EF4444";
    }

    if (tickTemp) tickTemp.textContent = tDisplay;
    if (tickHum) tickHum.textContent = hDisplay;
    if (tickGas) tickGas.textContent = gDisplay;

    if (statBarTemp) {
      const pct = Math.min(100, Math.max(0, ((data.temperature - this.customThresholds.temp_min) / (this.customThresholds.temp_max - this.customThresholds.temp_min)) * 100));
      statBarTemp.style.width = `${pct}%`;
    }
    if (statBarHum) {
      const pct = Math.min(100, Math.max(0, ((data.humidity - 50) / 50) * 100));
      statBarHum.style.width = `${pct}%`;
    }
    if (statBarGas) {
      const pct = Math.min(100, Math.max(0, (data.gas_level / (this.customThresholds.gas_threshold * 1.5)) * 100));
      statBarGas.style.width = `${pct}%`;
    }
  }

  /**
   * Render Post-Harvest Intelligence Panel
   * Updates freshness gauge, shelf-life, VPD, dew point, ethylene display
   */
  renderIntelligencePanel(telemetry) {
    const preset = this.customThresholds;
    const metrics = calculatePostHarvestMetrics(telemetry, preset);

    // ── Freshness Score Gauge ──
    const scoreEl = document.getElementById("freshnessScoreNumber");
    const arcEl = document.getElementById("freshnessArcPath");
    const stageEl = document.getElementById("freshnessStageText");
    const stageDot = document.getElementById("freshnessStageDot");
    const stageBadge = document.getElementById("freshnessStage");

    if (scoreEl) scoreEl.textContent = metrics.freshnessScore;
    if (scoreEl) scoreEl.style.color = metrics.stageColor;

    // SVG arc: total arc length for semicircle radius=80 is π*80 ≈ 251.2
    if (arcEl) {
      const ARC_LENGTH = 251.2;
      const pct = metrics.freshnessScore / 100;
      arcEl.style.strokeDashoffset = ARC_LENGTH - pct * ARC_LENGTH;
      arcEl.style.stroke = metrics.stageColor;
      arcEl.style.filter = `drop-shadow(0 0 6px ${metrics.stageColor}88)`;
    }

    if (stageEl) stageEl.textContent = metrics.stage;
    if (stageDot) stageDot.style.background = metrics.stageColor;
    if (stageBadge) {
      stageBadge.style.borderColor = `${metrics.stageColor}44`;
      stageBadge.style.background = `${metrics.stageColor}18`;
      stageBadge.style.color = metrics.stageColor;
    }

    // Freshness breakdown rows
    const t = telemetry.temperature;
    const rh = telemetry.humidity;
    const gas = telemetry.gas_level;

    const fbTemp = document.getElementById("fbTempStatus");
    const fbHum  = document.getElementById("fbHumStatus");
    const fbGas  = document.getElementById("fbGasStatus");

    if (fbTemp) {
      if (metrics.isChillingRisk) {
        fbTemp.textContent = `⚠ Chilling Risk (${t.toFixed(1)}°C)`;
        fbTemp.style.color = "#F87171";
      } else if (t < preset.temp_min || t > preset.temp_max) {
        fbTemp.textContent = `Out of Range (${t.toFixed(1)}°C)`;
        fbTemp.style.color = "#FBBF24";
      } else {
        fbTemp.textContent = `✓ Optimal (${t.toFixed(1)}°C)`;
        fbTemp.style.color = "#34D399";
      }
    }

    if (fbHum) {
      if (rh < preset.humidity_min) {
        fbHum.textContent = `Low (${rh}%)`;
        fbHum.style.color = "#FBBF24";
      } else if (rh > preset.humidity_max && metrics.condensationRisk) {
        fbHum.textContent = `Condensation Risk (${rh}%)`;
        fbHum.style.color = "#F87171";
      } else {
        fbHum.textContent = `✓ Optimal (${rh}%)`;
        fbHum.style.color = "#34D399";
      }
    }

    if (fbGas) {
      if (gas > preset.gas_critical) {
        fbGas.textContent = `Critical (${gas} ppm)`;
        fbGas.style.color = "#F87171";
      } else if (gas > preset.gas_threshold) {
        fbGas.textContent = `Elevated (${gas} ppm)`;
        fbGas.style.color = "#FBBF24";
      } else {
        fbGas.textContent = `✓ Normal (${gas} ppm)`;
        fbGas.style.color = "#34D399";
      }
    }

    // ── Shelf-Life Panel ──
    const daysEl      = document.getElementById("shelfLifeDaysValue");
    const ambientEl   = document.getElementById("shelfAmbientDays");
    const chamberEl   = document.getElementById("shelfChamberDays");
    const gainTextEl  = document.getElementById("shelfGainText");
    const gainBadge   = document.getElementById("shelfGainBadge");

    if (daysEl)    daysEl.textContent = metrics.remainingDays;
    if (ambientEl) ambientEl.textContent = `${metrics.ambientDays} days`;
    if (chamberEl) chamberEl.textContent = `${metrics.remainingDays} days`;
    if (gainTextEl) {
      gainTextEl.textContent = `+${metrics.daysGained} days extended storage (+${metrics.percentGain}%)`;
    }
    if (gainBadge) {
      gainBadge.style.borderColor = metrics.percentGain > 100 ? "rgba(6,182,212,0.4)" : "rgba(16,185,129,0.3)";
    }

    // VPD / Dew Point / Decay
    const vpdEl      = document.getElementById("vpdValue");
    const dewEl      = document.getElementById("dewPointValue");
    const decayEl    = document.getElementById("decayRateValue");
    const condEl     = document.getElementById("condensationWarningItem");

    if (vpdEl)   vpdEl.textContent = `${metrics.vpdKPa} kPa`;
    if (dewEl)   dewEl.textContent = `${metrics.dewPointC} °C`;
    if (decayEl) decayEl.textContent = `${metrics.totalDecayRate}×`;
    if (condEl)  condEl.style.display = metrics.condensationRisk ? "flex" : "none";

    // ── Ethylene & Farmer Tip Panel ──
    const ethPpmEl  = document.getElementById("ethPpmDisplay");
    const ethMgEl   = document.getElementById("ethMgM3Display");
    const sensEl    = document.getElementById("ethSensitivityBadge");
    const tipText   = document.getElementById("farmerTipText");
    const cropSub   = document.getElementById("activeCropSubtitle");
    const blueRec   = document.getElementById("blueLightRec");
    const blueText  = document.getElementById("blueLightRecText");
    const chillingBadge = document.getElementById("chillingBadge");

    if (ethPpmEl)  ethPpmEl.textContent  = metrics.ethylenePpm;
    if (ethMgEl)   ethMgEl.textContent   = metrics.ethyleneMgM3;
    if (sensEl)    sensEl.textContent    = preset.ethylene_sensitivity || "—";
    if (tipText)   tipText.textContent   = preset.farmer_tip || preset.description || "No tip available.";
    if (cropSub)   cropSub.textContent   = preset.name || "Active Crop";

    if (chillingBadge) {
      chillingBadge.style.display = metrics.isChillingRisk ? "inline-flex" : "none";
    }

    if (blueRec && blueText) {
      if (preset.blue_light_recommended) {
        blueRec.style.display = "flex";
        blueText.textContent = `Blue LED (450nm) recommended — ${preset.blue_light_duration_mins}min/day for this crop`;
      } else {
        blueRec.style.display = "none";
      }
    }

    // Color the ethylene value based on severity
    const ethColor = gas > (preset.gas_critical || 350) ? "#F87171" :
                     gas > preset.gas_threshold ? "#FBBF24" : "#10B981";
    if (ethPpmEl) ethPpmEl.style.color = ethColor;
    if (ethMgEl)  ethMgEl.style.color = ethColor;
  }

  /**
   * Render Door Safety State Banner & Countdown
   */
  renderStateUpdate(snap) {
    const banner = document.getElementById("stateBanner");
    const iconBubble = document.getElementById("stateIconBubble");
    const badge = document.getElementById("stateBadge");
    const title = document.getElementById("stateMainTitle");
    const desc = document.getElementById("stateDescription");

    const countdownWidget = document.getElementById("countdownWidget");
    const countdownNum = document.getElementById("countdownNumber");
    const timerCircle = document.getElementById("timerProgressCircle");

    if (!banner) return;

    // Reset base classes
    banner.className = "state-banner";

    switch (snap.state) {
      case ChamberState.NORMAL:
        if (badge) { badge.className = "banner-badge"; badge.textContent = "LIVE / NORMAL"; }
        if (title) title.textContent = "Chamber Secured — Automatic Climate Control Active";
        if (desc) desc.textContent = "Door is CLOSED. IR safety beam engaged. Environmental monitoring and relay control running smoothly.";
        if (countdownWidget) countdownWidget.classList.remove("visible");
        break;

      case ChamberState.DOOR_OPEN:
        banner.classList.add("door-open");
        if (badge) { badge.className = "banner-badge"; badge.textContent = "DOOR OPEN / PAUSED"; badge.style.background="rgba(239,68,68,0.2)"; badge.style.color="#FCA5A5"; }
        if (title) title.textContent = "DOOR OPEN — SAFETY INTERLOCK ENGAGED";
        if (desc) desc.textContent = "Inlet Fan, Outlet Fan, and Humidifier are STOPPED to prevent reacting to outside room air. Control is PAUSED.";
        if (countdownWidget) countdownWidget.classList.remove("visible");
        break;

      case ChamberState.WAIT_5_SECONDS:
        banner.classList.add("waiting");
        if (badge) { badge.className = "banner-badge"; badge.textContent = "STABILIZING (5s)"; badge.style.background="rgba(245,158,11,0.2)"; badge.style.color="#FDE68A"; }
        if (title) title.textContent = "DOOR CLOSED — SYSTEM RESTARTING IN 5 SECONDS";
        if (desc) desc.textContent = "Chamber atmosphere stabilizing. If door opens again during this countdown, timer will abort and remain paused.";
        if (countdownWidget) {
          countdownWidget.classList.add("visible");
          if (countdownNum) countdownNum.textContent = snap.remainingSeconds;
          if (timerCircle) {
            const total = 125.6;
            const offset = total - (total * (snap.countdownPercent / 100));
            timerCircle.style.strokeDashoffset = offset;
          }
        }
        break;

      case ChamberState.RESTART:
        banner.classList.add("state-restart");
        if (iconBubble) iconBubble.innerHTML = "⚡";
        if (badge) { badge.className = "state-badge badge-info"; badge.textContent = "RESTARTING"; }
        if (title) title.textContent = "✓ 5 SECONDS COMPLETED — RESUMING SENSORS & FANS";
        if (desc) desc.textContent = "Acquiring fresh DHT22 and MQ sensor readings, processing control algorithms, and resuming fans...";
        if (countdownWidget) countdownWidget.classList.remove("active");
        break;

      case ChamberState.ALERT:
        banner.classList.add("state-alert");
        if (iconBubble) iconBubble.innerHTML = "🚨";
        if (badge) { badge.className = "state-badge badge-danger"; badge.textContent = "ALERT: GAS PURGE"; }
        if (title) title.textContent = "🚨 RIPENING GAS LEVEL ELEVATED — PURGE VENTILATION ACTIVE";
        if (desc) desc.textContent = "Ethylene/air-quality threshold exceeded. Inlet and Outlet fans running at maximum flow to purge gas.";
        if (countdownWidget) countdownWidget.classList.remove("active");
        break;
    }

    // Render Actuators Status Cards
    this.renderActuatorCard("inletFanCard", "inletFanStatusText", snap.inletFan, snap.doorStatus === "OPEN");
    this.renderActuatorCard("outletFanCard", "outletFanStatusText", snap.outletFan, snap.doorStatus === "OPEN");
    this.renderActuatorCard("humidifierCard", "humidifierStatusText", snap.humidifier, snap.doorStatus === "OPEN");
    this.renderActuatorCard("whiteLedCard", "whiteLedStatusText", snap.whiteLed, false);
    this.renderActuatorCard("blueLedCard", "blueLedStatusText", snap.blueLed, false);

    // Render Cutaway Chamber Visuals
    this.renderChamberCutaway(snap);

    // Sync switches state and disabled attribute based on mode
    this.syncSwitches(snap);
  }

  renderActuatorCard(cardId, textId, isActive, isInterlocked) {
    const card = document.getElementById(cardId);
    const text = document.getElementById(textId);
    if (!card || !text) return;

    if (isActive) {
      card.classList.add("active");
      text.textContent = "ON";
    } else {
      card.classList.remove("active");
      text.textContent = "OFF";
    }

    if (isInterlocked) {
      card.classList.add("door-interlock-active");
    } else {
      card.classList.remove("door-interlock-active");
    }
  }

  /**
   * Render Interactive 3D Cutaway Chamber Graphics
   */
  renderChamberCutaway(snap) {
    const doorPanel = document.getElementById("chamberDoorPanel");
    const irBeam = document.getElementById("irBeamLine");
    const irEmitter = document.getElementById("irEmitterDot");
    const inletFanSpinner = document.getElementById("inletFanSpinner");
    const outletFanSpinner = document.getElementById("outletFanSpinner");
    const airflowInlet = document.getElementById("airflowInletStream");
    const airflowOutlet = document.getElementById("airflowOutletStream");
    const mistCloud = document.getElementById("mistCloudContainer");
    const whiteLightOverlay = document.getElementById("whiteLightOverlay");
    const blueLightOverlay = document.getElementById("blueLightOverlay");
    const whiteBulb = document.getElementById("whiteLightBulb");
    const blueBulb = document.getElementById("blueLightBulb");
    const touchPlate = document.getElementById("touchPlate");

    // Door Panel 3D Swing
    if (doorPanel) {
      if (snap.doorStatus === "OPEN") {
        doorPanel.classList.add("open");
        if (irBeam) irBeam.classList.add("broken");
        if (irEmitter) irEmitter.classList.add("active");
      } else {
        doorPanel.classList.remove("open");
        if (irBeam) irBeam.classList.remove("broken");
        if (irEmitter) irEmitter.classList.remove("active");
      }
    }

    // Inlet Fan & Airflow
    if (inletFanSpinner) {
      if (snap.inletFan) {
        inletFanSpinner.classList.add("spinning");
        if (airflowInlet) airflowInlet.classList.add("active");
      } else {
        inletFanSpinner.classList.remove("spinning");
        if (airflowInlet) airflowInlet.classList.remove("active");
      }
    }

    // Outlet Fan & Airflow
    if (outletFanSpinner) {
      if (snap.outletFan) {
        outletFanSpinner.classList.add("spinning");
        if (airflowOutlet) airflowOutlet.classList.add("active");
      } else {
        outletFanSpinner.classList.remove("spinning");
        if (airflowOutlet) airflowOutlet.classList.remove("active");
      }
    }

    // Ultrasonic Mist Humidifier
    if (mistCloud) {
      if (snap.humidifier) {
        mistCloud.classList.add("active");
      } else {
        mistCloud.classList.remove("active");
      }
    }

    // White Ceiling Light
    if (whiteLightOverlay && whiteBulb) {
      if (snap.whiteLed) {
        whiteLightOverlay.classList.add("active");
        whiteBulb.classList.add("on");
      } else {
        whiteLightOverlay.classList.remove("active");
        whiteBulb.classList.remove("on");
      }
    }

    // Blue Antimicrobial Light
    if (blueLightOverlay && blueBulb) {
      if (snap.blueLed) {
        blueLightOverlay.classList.add("active");
        blueBulb.classList.add("on");
      } else {
        blueLightOverlay.classList.remove("active");
        blueBulb.classList.remove("on");
      }
    }

    // Touch Plate Pulse
    if (touchPlate && snap.whiteLed) {
      touchPlate.classList.add("touched");
    } else if (touchPlate) {
      touchPlate.classList.remove("touched");
    }
  }

  syncSwitches(snap) {
    const isManual = (snap.systemMode === "MANUAL");
    const isDoorOpen = (snap.doorStatus === "OPEN");

    const inletSwitch = document.getElementById("inletFanSwitch");
    const outletSwitch = document.getElementById("outletFanSwitch");
    const humSwitch = document.getElementById("humidifierSwitch");
    const whiteSwitch = document.getElementById("whiteLedSwitch");
    const blueSwitch = document.getElementById("blueLedSwitch");

    if (inletSwitch) {
      inletSwitch.checked = snap.inletFan;
      inletSwitch.disabled = !isManual || isDoorOpen;
    }
    if (outletSwitch) {
      outletSwitch.checked = snap.outletFan;
      outletSwitch.disabled = !isManual || isDoorOpen;
    }
    if (humSwitch) {
      humSwitch.checked = snap.humidifier;
      humSwitch.disabled = !isManual || isDoorOpen;
    }
    if (whiteSwitch) {
      whiteSwitch.checked = snap.whiteLed;
    }
    if (blueSwitch) {
      blueSwitch.checked = snap.blueLed;
      blueSwitch.disabled = !isManual;
    }
  }

  /**
   * Bind Navbar & Mode Switchers
   */
  bindNavbar() {
    const autoBtn = document.getElementById("modeAutoBtn");
    const manualBtn = document.getElementById("modeManualBtn");

    if (autoBtn && manualBtn) {
      autoBtn.addEventListener("click", () => {
        this.fsm.setSystemMode("AUTO");
        autoBtn.className = "mode-pill-btn active";
        manualBtn.className = "mode-pill-btn";
        this.showToast("Mode Changed: AUTO", "Environmental control logic active.", "toast-success");
      });

      manualBtn.addEventListener("click", () => {
        this.fsm.setSystemMode("MANUAL");
        manualBtn.className = "mode-pill-btn active manual";
        autoBtn.className = "mode-pill-btn";
        this.showToast("Mode Changed: MANUAL", "Relays are now manually controllable.", "toast-warning");
      });
    }

    // Touch sensor button in navbar or simulator
    const touchBtn = document.getElementById("navTouchSensorBtn");
    if (touchBtn) {
      touchBtn.addEventListener("click", () => {
        this.simulator.simulateTouchSensor();
      });
    }
  }

  bindPresets() {
    // Presets chips are rendered and bound in renderPresetsCarousel()
  }

  /**
   * Render Crop Presets Carousel
   */
  renderPresetsCarousel() {
    const container = document.getElementById("presetsCarousel");
    if (!container) return;

    container.innerHTML = Object.keys(CROP_PRESETS).map(key => {
      const preset = CROP_PRESETS[key];
      const isActive = (key === this.currentPresetKey);
      const sensColors = {
        "Extreme": "#F87171", "High": "#FBBF24", "High (Yellowing)": "#FBBF24",
        "Moderate": "#34D399", "Moderate (Sprout trigger)": "#34D399",
        "Low": "#6EE7B7", "Configurable": "#93C5FD"
      };
      const sensColor = sensColors[preset.ethylene_sensitivity] || "#94A3B8";

      return `
        <div class="preset-chip ${isActive ? 'active' : ''}" data-preset-key="${key}" title="${preset.description}">
          <span class="preset-icon">${preset.icon}</span>
          <div class="preset-info">
            <span class="preset-name">${preset.name.split(" ")[0]}</span>
            <div class="preset-meta-row">
              <span class="preset-meta-tag">${preset.temp_target}°C</span>
              <span class="preset-meta-tag" style="color: ${sensColor};">${preset.ethylene_sensitivity?.split(" ")[0] || "—"}</span>
              <span class="preset-meta-tag">${preset.base_shelf_life_days}d</span>
            </div>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".preset-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const key = chip.getAttribute("data-preset-key");
        this.selectPreset(key);
      });
    });
  }


  selectPreset(key) {
    this.currentPresetKey = key;
    this.customThresholds = { ...getPresetById(key) };
    this.renderPresetsCarousel();
    this.syncFormWithThresholds();

    // Update chamber produce crate graphic
    const produceCrate = document.getElementById("chamberProduceCrate");
    const presetNameBadge = document.getElementById("chamberPresetBadge");
    if (produceCrate) produceCrate.textContent = this.customThresholds.icon;
    if (presetNameBadge) presetNameBadge.textContent = `${this.customThresholds.icon} ${this.customThresholds.name}`;

    // Refresh Intelligence Panel static fields immediately on preset change
    const tipText = document.getElementById("farmerTipText");
    const cropSub = document.getElementById("activeCropSubtitle");
    const sensEl  = document.getElementById("ethSensitivityBadge");
    const blueRec = document.getElementById("blueLightRec");
    const blueText = document.getElementById("blueLightRecText");
    if (tipText) tipText.textContent = this.customThresholds.farmer_tip || this.customThresholds.description || "";
    if (cropSub) cropSub.textContent = this.customThresholds.name;
    if (sensEl)  sensEl.textContent  = this.customThresholds.ethylene_sensitivity || "—";
    if (blueRec && blueText) {
      if (this.customThresholds.blue_light_recommended) {
        blueRec.style.display = "flex";
        blueText.textContent = `Blue LED (450nm) recommended — ${this.customThresholds.blue_light_duration_mins}min/day`;
      } else {
        blueRec.style.display = "none";
      }
    }

    this.showToast(
      `Preset Applied: ${this.customThresholds.name}`,
      `Target: ${this.customThresholds.temp_target}°C, Humidity: ${this.customThresholds.humidity_min}-${this.customThresholds.humidity_max}%`,
      "toast-success"
    );
  }

  syncFormWithThresholds() {
    const minT = document.getElementById("thresholdTempMin");
    const maxT = document.getElementById("thresholdTempMax");
    const minH = document.getElementById("thresholdHumMin");
    const maxH = document.getElementById("thresholdHumMax");
    const gasT = document.getElementById("thresholdGas");

    const minTVal = document.getElementById("dispTempMin");
    const maxTVal = document.getElementById("dispTempMax");
    const minHVal = document.getElementById("dispHumMin");
    const maxHVal = document.getElementById("dispHumMax");
    const gasTVal = document.getElementById("dispGasThresh");

    if (minT) minT.value = this.customThresholds.temp_min;
    if (maxT) maxT.value = this.customThresholds.temp_max;
    if (minH) minH.value = this.customThresholds.humidity_min;
    if (maxH) maxH.value = this.customThresholds.humidity_max;
    if (gasT) gasT.value = this.customThresholds.gas_threshold;

    if (minTVal) minTVal.textContent = `${this.customThresholds.temp_min}°C`;
    if (maxTVal) maxTVal.textContent = `${this.customThresholds.temp_max}°C`;
    if (minHVal) minHVal.textContent = `${this.customThresholds.humidity_min}%`;
    if (maxHVal) maxHVal.textContent = `${this.customThresholds.humidity_max}%`;
    if (gasTVal) gasTVal.textContent = `${this.customThresholds.gas_threshold} ppm`;
  }

  bindThresholdControls() {
    const bindSlider = (sliderId, dispId, unit, prop) => {
      const slider = document.getElementById(sliderId);
      const disp = document.getElementById(dispId);
      if (slider && disp) {
        slider.addEventListener("input", (e) => {
          const val = parseFloat(e.target.value);
          disp.textContent = `${val}${unit}`;
          this.customThresholds[prop] = val;
        });
      }
    };

    bindSlider("thresholdTempMin", "dispTempMin", "°C", "temp_min");
    bindSlider("thresholdTempMax", "dispTempMax", "°C", "temp_max");
    bindSlider("thresholdHumMin", "dispHumMin", "%", "humidity_min");
    bindSlider("thresholdHumMax", "dispHumMax", "%", "humidity_max");
    bindSlider("thresholdGas", "dispGasThresh", " ppm", "gas_threshold");

    const saveBtn = document.getElementById("saveThresholdsBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        this.api.saveConfig({
          active_preset: this.currentPresetKey,
          thresholds: this.customThresholds
        });
        this.showToast("Thresholds Synchronized", "Updated setpoints deployed to control engine.", "toast-success");
      });
    }
  }

  bindActuatorSwitches() {
    const bindToggle = (id, actuatorName) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", (e) => {
          const res = this.fsm.setManualActuator(actuatorName, e.target.checked);
          if (!res.success) {
            e.target.checked = !e.target.checked; // revert
            this.showToast("Command Blocked", res.reason, "toast-warning");
          } else {
            // Also notify API if connected
            this.api.sendControl({ [actuatorName]: e.target.checked });
          }
        });
      }
    };

    bindToggle("inletFanSwitch", "inletFan");
    bindToggle("outletFanSwitch", "outletFan");
    bindToggle("humidifierSwitch", "humidifier");
    bindToggle("whiteLedSwitch", "whiteLed");
    bindToggle("blueLedSwitch", "blueLed");
  }

  bindChamberInteractions() {
    // 3D Parallax Reactive Tilt on Chamber Scene
    const scene = document.querySelector(".hero-chamber-scene");
    const card = document.querySelector(".hero-chamber-img-wrap");
    if (scene && card) {
      scene.addEventListener("mousemove", (e) => {
        const rect = scene.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        const rotY = (x / (rect.width / 2)) * 10;
        const rotX = -(y / (rect.height / 2)) * 8;
        card.style.transform = `perspective(1000px) rotateY(${rotY}deg) rotateX(${rotX}deg) scale3d(1.02, 1.02, 1.02)`;
      });
      scene.addEventListener("mouseleave", () => {
        card.style.transform = `perspective(1000px) rotateY(-8deg) rotateX(4deg) scale3d(1, 1, 1)`;
      });
    }

    // Door Panel Click: Swings open/closed in 3D & toggles simulation
    const doorTriggers = [
      document.getElementById("chamberDoorPanel"),
      document.getElementById("heroChamberImgWrap"),
      document.getElementById("heroDoorTrigger")
    ];
    doorTriggers.forEach(el => {
      if (el) {
        el.addEventListener("click", () => {
          if (this.fsm.doorStatus === "CLOSED") {
            this.simulator.simulateDoorOpen();
          } else {
            this.simulator.simulateDoorClose();
          }
        });
      }
    });

    // Touch Plate on exterior chamber wall
    const touchPlate = document.getElementById("touchPlate");
    if (touchPlate) {
      touchPlate.addEventListener("click", () => {
        this.simulator.simulateTouchSensor();
      });
    }
  }

  bindSimulatorDrawer() {
    const drawer = document.getElementById("simulatorDrawer") || document.getElementById("simulatorDrawerModal");
    const openBtns = document.querySelectorAll(".open-simulator-btn, #openSimulatorBtn, #openSimulatorBtn2, #openSimBtn2, #openSimulatorBtnHero, #openSimulatorBtnTop, #mobNavLab");
    const closeBtns = document.querySelectorAll(".close-simulator-btn, #closeSimulatorBtn");

    openBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        if (drawer) drawer.classList.add("open");
      });
    });

    closeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        if (drawer) drawer.classList.remove("open");
      });
    });

    if (drawer) {
      drawer.addEventListener("click", (e) => {
        if (e.target === drawer) drawer.classList.remove("open");
      });
    }

    // Simulator Interactive Buttons
    const simOpenDoor = document.getElementById("simDoorOpenBtn");
    const simCloseDoor = document.getElementById("simDoorCloseBtn");
    const simTouch = document.getElementById("simTouchSensorBtn");
    const simGas = document.getElementById("simGasSpikeBtn");
    const simHum = document.getElementById("simLowHumBtn") || document.getElementById("simHumDropBtn");
    const simTemp = document.getElementById("simTempSpikeBtn");
    const simNormal = document.getElementById("simNormalBtn");

    if (simOpenDoor) simOpenDoor.addEventListener("click", () => this.simulator.simulateDoorOpen());
    if (simCloseDoor) simCloseDoor.addEventListener("click", () => this.simulator.simulateDoorClose());
    if (simTouch) simTouch.addEventListener("click", () => this.simulator.simulateTouchSensor());
    if (simGas) simGas.addEventListener("click", () => this.simulator.simulateGasSpike());
    if (simHum) simHum.addEventListener("click", () => this.simulator.simulateLowHumidity());
    if (simTemp) simTemp.addEventListener("click", () => {
      this.simulator.temperature = 8.5;
      this.simulator.log("[Alert] Temperature spike: 8.5°C injected!");
    });
    if (simNormal) simNormal.addEventListener("click", () => {
      this.simulator.temperature = 2.4;
      this.simulator.humidity = 92;
      this.simulator.gasLevel = 210;
      this.simulator.log("[System] Atmosphere normalized to baseline.");
    });
  }

  bindModals() {
    const backdrop = document.getElementById("modalBackdrop");
    const codeModal = document.getElementById("codeViewerModal") || document.getElementById("firmwareModal");
    const openCodeBtns = document.querySelectorAll(".open-firmware-btn, #openFirmwareModalBtn, #openFirmwareModalBtn2, #openFwBtn2, #openFirmwareModalBtnHero");
    const closeCodeBtns = document.querySelectorAll(".close-firmware-btn, #closeCodeModalBtn, #closeFirmwareModalBtn");

    openCodeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        if (codeModal) codeModal.classList.add("open");
        if (backdrop) backdrop.classList.add("open");
      });
    });

    const closeModal = () => {
      if (codeModal) codeModal.classList.remove("open");
      if (backdrop) backdrop.classList.remove("open");
    };

    closeCodeBtns.forEach(btn => btn.addEventListener("click", closeModal));
    if (backdrop) backdrop.addEventListener("click", closeModal);
    if (codeModal) {
      codeModal.addEventListener("click", (e) => {
        if (e.target === codeModal) closeModal();
      });
    }

    // Keyboard ESC to close any modal
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeModal();
        const drawer = document.getElementById("simulatorDrawer") || document.getElementById("simulatorDrawerModal");
        if (drawer) drawer.classList.remove("open");
        const sidebar = document.getElementById("sidebar");
        const overlay = document.getElementById("sidebarOverlay");
        if (sidebar) sidebar.classList.remove("open");
        if (overlay) overlay.classList.remove("open");
      }
    });
  }

  bindHistoryControls() {
    const searchInput = document.getElementById("tableSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.logger.setSearch(e.target.value);
      });
    }

    const csvBtn = document.getElementById("exportCsvBtn");
    const jsonBtn = document.getElementById("exportJsonBtn");

    if (csvBtn) csvBtn.addEventListener("click", () => this.logger.exportCSV());
    if (jsonBtn) jsonBtn.addEventListener("click", () => this.logger.exportJSON());
  }

  appendSerialLog(line) {
    const logBox = document.getElementById("simSerialOutput");
    if (!logBox) return;
    logBox.textContent += line + "\n";
    logBox.scrollTop = logBox.scrollHeight;
  }
}

// Bootstrap application on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  const app = new FreshGuardApp();
  app.init();
  window.FreshGuard = app; // Expose globally for browser test inspection
});
