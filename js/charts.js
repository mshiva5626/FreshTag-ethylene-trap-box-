/**
 * Smart FreshGuard - Real-time Telemetry Canvas Charts
 * Hardware-accelerated, zero-dependency, ultra-smooth charting engine
 */

/**
 * Smart FreshGuard - Real-time Telemetry & Shelf-Life Canvas Charts
 * Hardware-accelerated, high-DPI, interactive charting engine with hover inspection
 */

export class TelemetryCharts {
  constructor(tempCanvasId, gasCanvasId) {
    this.tempCanvas = document.getElementById(tempCanvasId);
    this.gasCanvas = document.getElementById(gasCanvasId);

    this.tempCtx = this.tempCanvas ? this.tempCanvas.getContext("2d") : null;
    this.gasCtx = this.gasCanvas ? this.gasCanvas.getContext("2d") : null;

    this.dataPoints = [];
    this.maxPoints = 50;
    this.timeWindow = "live"; // "live", "15m", "1h"
    this.chartMode = "telemetry"; // "telemetry" or "projection"

    this.activeThresholds = {
      temp_min: 1.0,
      temp_max: 4.0,
      humidity_min: 90,
      humidity_max: 95,
      gas_threshold: 230
    };

    // Tooltip / Crosshair state
    this.hoverIndex = null;
    this.hoverCanvas = null;
    this.isHovering = false;

    // Handle high DPI retina screens
    this.initCanvasDpi(this.tempCanvas);
    this.initCanvasDpi(this.gasCanvas);

    this.bindInteractions();

    window.addEventListener("resize", () => {
      this.initCanvasDpi(this.tempCanvas);
      this.initCanvasDpi(this.gasCanvas);
      this.render();
    });
  }

  initCanvasDpi(canvas) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
    ctx.scale(dpr, dpr);
  }

  setThresholds(thresholds) {
    if (thresholds) {
      this.activeThresholds = { ...this.activeThresholds, ...thresholds };
      this.render();
    }
  }

  setTimeWindow(window) {
    this.timeWindow = window;
    this.render();
  }

  setChartMode(mode) {
    this.chartMode = mode;
    this.render();
  }

  setData(historyArray) {
    this.dataPoints = (historyArray || []).slice(-this.maxPoints);
    this.render();
  }

  addPoint(point) {
    this.dataPoints.push({
      ...point,
      receivedAt: Date.now()
    });
    if (this.dataPoints.length > this.maxPoints) {
      this.dataPoints.shift();
    }
    this.render();
  }

  bindInteractions() {
    const bindCanvasHover = (canvas) => {
      if (!canvas) return;

      const handleMove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const padLeft = 50;
        const padRight = 50;
        const plotW = rect.width - padLeft - padRight;
        const n = this.dataPoints.length;

        if (n < 2 || mouseX < padLeft || mouseX > rect.width - padRight) {
          this.hoverIndex = null;
          this.isHovering = false;
          this.render();
          return;
        }

        const ratio = (mouseX - padLeft) / plotW;
        this.hoverIndex = Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
        this.hoverCanvas = canvas;
        this.isHovering = true;
        this.render();
      };

      const handleLeave = () => {
        this.hoverIndex = null;
        this.isHovering = false;
        this.render();
      };

      canvas.addEventListener("mousemove", handleMove);
      canvas.addEventListener("mouseleave", handleLeave);
      canvas.addEventListener("touchmove", (e) => {
        if (e.touches && e.touches[0]) {
          handleMove(e.touches[0]);
        }
      }, { passive: true });
      canvas.addEventListener("touchend", handleLeave);
    };

    bindCanvasHover(this.tempCanvas);
    bindCanvasHover(this.gasCanvas);
  }

  render() {
    this.renderTempHumidityChart();
    this.renderGasChart();
  }

  // Draw smooth spline through points
  drawSpline(ctx, points, tension = 0.3) {
    if (points.length < 2) return;
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? i : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

      const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
      const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
      const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
      const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  renderTempHumidityChart() {
    if (!this.tempCtx || !this.tempCanvas) return;
    const ctx = this.tempCtx;
    const rect = this.tempCanvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    if (this.dataPoints.length < 2) {
      ctx.fillStyle = "#64748B";
      ctx.font = "12px 'Plus Jakarta Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Gathering live telemetry data...", width / 2, height / 2);
      return;
    }

    const padLeft = 45;
    const padRight = 45;
    const padTop = 30;
    const padBottom = 32;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const temps = this.dataPoints.map(d => d.temperature);
    const hums = this.dataPoints.map(d => d.humidity);

    const minT = Math.floor(Math.min(...temps, this.activeThresholds.temp_min - 2));
    const maxT = Math.ceil(Math.max(...temps, this.activeThresholds.temp_max + 2));
    const minH = 50;
    const maxH = 100;

    const n = this.dataPoints.length;
    const getX = (idx) => padLeft + (plotW / (n - 1)) * idx;
    const getYTemp = (val) => padTop + plotH * (1 - (val - minT) / Math.max(1, (maxT - minT)));
    const getYHum = (val) => padTop + plotH * (1 - (val - minH) / (maxH - minH));

    // 1. Shaded Safe Target Zones
    // Temperature target band
    const yTempMin = getYTemp(this.activeThresholds.temp_min);
    const yTempMax = getYTemp(this.activeThresholds.temp_max);
    ctx.fillStyle = "rgba(16, 185, 129, 0.08)";
    ctx.fillRect(padLeft, Math.min(yTempMin, yTempMax), plotW, Math.abs(yTempMin - yTempMax));

    // 2. Grid lines & Axis labels
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#94A3B8";
    ctx.font = "10px 'JetBrains Mono', monospace";

    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const y = padTop + (plotH / steps) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();

      // Left axis: Temp
      const tVal = (maxT - ((maxT - minT) / steps) * i).toFixed(1);
      ctx.textAlign = "right";
      ctx.fillStyle = "#34D399";
      ctx.fillText(`${tVal}°`, padLeft - 6, y + 3);

      // Right axis: Humidity
      const hVal = Math.round(maxH - ((maxH - minH) / steps) * i);
      ctx.textAlign = "left";
      ctx.fillStyle = "#38BDF8";
      ctx.fillText(`${hVal}%`, width - padRight + 6, y + 3);
    }

    // 3. Humidity Area & Curve (Atmospheric Cyan)
    const humPoints = this.dataPoints.map((d, i) => ({ x: getX(i), y: getYHum(d.humidity) }));
    ctx.beginPath();
    this.drawSpline(ctx, humPoints);
    ctx.strokeStyle = "#06B6D4";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Humidity Gradient Fill
    ctx.lineTo(getX(n - 1), height - padBottom);
    ctx.lineTo(getX(0), height - padBottom);
    ctx.closePath();
    const humGrad = ctx.createLinearGradient(0, padTop, 0, height - padBottom);
    humGrad.addColorStop(0, "rgba(6, 182, 212, 0.22)");
    humGrad.addColorStop(1, "rgba(6, 182, 212, 0.0)");
    ctx.fillStyle = humGrad;
    ctx.fill();

    // 4. Temperature Curve (Emerald Leaf)
    const tempPoints = this.dataPoints.map((d, i) => ({ x: getX(i), y: getYTemp(d.temperature) }));
    ctx.beginPath();
    this.drawSpline(ctx, tempPoints);
    ctx.strokeStyle = "#10B981";
    ctx.lineWidth = 2.8;
    ctx.shadowColor = "rgba(16, 185, 129, 0.5)";
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0; // reset

    // 5. Door Open Safety Event Markers
    for (let i = 0; i < n; i++) {
      if (this.dataPoints[i].door_status === "OPEN") {
        const x = getX(i);
        ctx.strokeStyle = "rgba(239, 68, 68, 0.5)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, height - padBottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 6. Interactive Hover Crosshair & Glass Tooltip
    if (this.isHovering && this.hoverIndex !== null && this.hoverIndex < n) {
      const idx = this.hoverIndex;
      const pt = this.dataPoints[idx];
      const hx = getX(idx);
      const hyTemp = getYTemp(pt.temperature);
      const hyHum = getYHum(pt.humidity);

      // Vertical guide
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hx, padTop);
      ctx.lineTo(hx, height - padBottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Point highlights
      ctx.fillStyle = "#10B981";
      ctx.beginPath();
      ctx.arc(hx, hyTemp, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#06B6D4";
      ctx.beginPath();
      ctx.arc(hx, hyHum, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Tooltip Card
      this.drawTooltip(ctx, hx, Math.min(hyTemp, hyHum), [
        { label: "Time", val: pt.timestamp ? (pt.timestamp.includes("T") ? pt.timestamp.split("T")[1].slice(0, 8) : pt.timestamp) : "--", color: "#F1F5F9" },
        { label: "Temp", val: `${pt.temperature.toFixed(1)}°C`, color: "#34D399" },
        { label: "Humidity", val: `${pt.humidity}% RH`, color: "#38BDF8" },
        { label: "Door", val: pt.door_status || "CLOSED", color: pt.door_status === "OPEN" ? "#F87171" : "#A7F3D0" }
      ], width, height);
    }
  }

  renderGasChart() {
    if (!this.gasCtx || !this.gasCanvas) return;
    const ctx = this.gasCtx;
    const rect = this.gasCanvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    if (this.dataPoints.length < 2) return;

    const padLeft = 45;
    const padRight = 30;
    const padTop = 25;
    const padBottom = 30;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const gases = this.dataPoints.map(d => d.gas_level);
    const minG = 100;
    const maxG = Math.max(...gases, this.activeThresholds.gas_threshold + 80, 350);

    const n = this.dataPoints.length;
    const getX = (idx) => padLeft + (plotW / (n - 1)) * idx;
    const getY = (val) => padTop + plotH * (1 - (val - minG) / Math.max(1, (maxG - minG)));

    // Grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#94A3B8";
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";

    const steps = 3;
    for (let i = 0; i <= steps; i++) {
      const y = padTop + (plotH / steps) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();

      const gVal = Math.round(maxG - ((maxG - minG) / steps) * i);
      ctx.fillText(`${gVal}`, padLeft - 6, y + 3);
    }

    // Gas Curve & Gradient (Amber to Rose when high)
    const gasPoints = this.dataPoints.map((d, i) => ({ x: getX(i), y: getY(d.gas_level) }));
    ctx.beginPath();
    this.drawSpline(ctx, gasPoints);
    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 2.8;
    ctx.shadowColor = "rgba(245, 158, 11, 0.4)";
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Gradient fill
    ctx.lineTo(getX(n - 1), height - padBottom);
    ctx.lineTo(getX(0), height - padBottom);
    ctx.closePath();
    const gasGrad = ctx.createLinearGradient(0, padTop, 0, height - padBottom);
    gasGrad.addColorStop(0, "rgba(245, 158, 11, 0.35)");
    gasGrad.addColorStop(1, "rgba(245, 158, 11, 0.0)");
    ctx.fillStyle = gasGrad;
    ctx.fill();

    // Ripening Vent Threshold line
    const threshY = getY(this.activeThresholds.gas_threshold);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.75)";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, threshY);
    ctx.lineTo(width - padRight, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#F87171";
    ctx.font = "10px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Vent Purge Threshold: ${this.activeThresholds.gas_threshold} ppm`, padLeft + 6, threshY - 6);

    // Hover crosshair & tooltip for Gas Chart
    if (this.isHovering && this.hoverIndex !== null && this.hoverIndex < n) {
      const idx = this.hoverIndex;
      const pt = this.dataPoints[idx];
      const hx = getX(idx);
      const hy = getY(pt.gas_level);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hx, padTop);
      ctx.lineTo(hx, height - padBottom);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#F59E0B";
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.stroke();

      const mgM3 = (pt.gas_level * 1.15).toFixed(1);
      this.drawTooltip(ctx, hx, hy, [
        { label: "Time", val: pt.timestamp ? (pt.timestamp.includes("T") ? pt.timestamp.split("T")[1].slice(0, 8) : pt.timestamp) : "--", color: "#F1F5F9" },
        { label: "Ethylene", val: `${pt.gas_level} ppm`, color: "#FBBF24" },
        { label: "Density", val: `${mgM3} mg/m³`, color: "#FCD34D" },
        { label: "Status", val: pt.gas_level > this.activeThresholds.gas_threshold ? "PURGE ACTIVE" : "OPTIMAL", color: pt.gas_level > this.activeThresholds.gas_threshold ? "#F87171" : "#34D399" }
      ], width, height);
    }
  }

  drawTooltip(ctx, x, y, rows, canvasWidth, canvasHeight) {
    const boxW = 160;
    const rowH = 18;
    const boxH = rows.length * rowH + 16;
    let boxX = x + 12;
    let boxY = y - boxH / 2;

    if (boxX + boxW > canvasWidth - 10) boxX = x - boxW - 12;
    if (boxY < 10) boxY = 10;
    if (boxY + boxH > canvasHeight - 10) boxY = canvasHeight - boxH - 10;

    // Glass backdrop
    ctx.fillStyle = "rgba(10, 18, 28, 0.92)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();

    // Render rows
    let curY = boxY + 16;
    rows.forEach(r => {
      ctx.font = "10px 'Plus Jakarta Sans', sans-serif";
      ctx.fillStyle = "#94A3B8";
      ctx.textAlign = "left";
      ctx.fillText(r.label, boxX + 10, curY);

      ctx.font = "bold 10px 'JetBrains Mono', monospace";
      ctx.fillStyle = r.color;
      ctx.textAlign = "right";
      ctx.fillText(r.val, boxX + boxW - 10, curY);
      curY += rowH;
    });
  }
}

