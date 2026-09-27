import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useDeviceStore, TelemetryReading } from '../store/deviceStore';
import { useSettingsStore } from '../store/settingsStore';
import { FRUIT_PRESETS } from '../data/fruitPresets';

type DateRangeOption = '24h' | '7d' | '30d' | 'custom';

export default function AnalyticsPage() {
  const { token } = useAuthStore();
  const { devices, fetchDevices, history, fetchHistory, isLoading } = useDeviceStore();
  const { formatTemp } = useSettingsStore();

  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [rangeOption, setRangeOption] = useState<DateRangeOption>('24h');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [hoveredPoint, setHoveredPoint] = useState<TelemetryReading | null>(null);
  const [activeChartTab, setActiveChartTab] = useState<'all' | 'temp' | 'hum' | 'gas'>('all');

  useEffect(() => {
    if (token) {
      fetchDevices(token);
    }
  }, [token]);

  useEffect(() => {
    if (devices.length > 0 && !selectedDevice) {
      setSelectedDevice(devices[0].device_id);
    }
  }, [devices, selectedDevice]);

  // Load history when selected device or range changes
  useEffect(() => {
    if (!token || !selectedDevice) return;

    let limit = 60;
    let from: string | undefined;
    let to: string | undefined;

    const now = new Date();
    if (rangeOption === '24h') {
      limit = 100;
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    } else if (rangeOption === '7d') {
      limit = 250;
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (rangeOption === '30d') {
      limit = 500;
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (rangeOption === 'custom' && customFrom && customTo) {
      limit = 500;
      from = new Date(customFrom).toISOString();
      to = new Date(customTo).toISOString();
    }

    fetchHistory(selectedDevice, token, limit, from, to);
  }, [token, selectedDevice, rangeOption, customFrom, customTo]);

  const activeDevice = devices.find((d) => d.device_id === selectedDevice);
  const rawReadings = history[selectedDevice] || [];

  // Sort readings chronologically
  const readings = useMemo(() => {
    return [...rawReadings].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [rawReadings]);

  // Device thresholds with safe defaults
  const thresholds = activeDevice?.thresholds || {
    temp_min: 1.0,
    temp_max: 4.0,
    humidity_min: 90.0,
    humidity_max: 95.0,
    gas_threshold: 230,
  };

  // Find matching preset based on thresholds
  const matchedPreset = useMemo(() => {
    return FRUIT_PRESETS.find(
      (p) =>
        Math.abs(p.temp_min - thresholds.temp_min) < 1.5 &&
        Math.abs(p.temp_max - thresholds.temp_max) < 1.5
    ) || FRUIT_PRESETS[0];
  }, [thresholds]);

  // Analytics & Compliance Metrics
  const analytics = useMemo(() => {
    if (readings.length === 0) {
      return {
        totalReadings: 0,
        validTempCount: 0,
        validHumCount: 0,
        validGasCount: 0,
        tempCompliance: 100,
        humCompliance: 100,
        gasCompliance: 100,
        overallCompliance: 100,
        avgTemp: null,
        minTemp: null,
        maxTemp: null,
        avgHum: null,
        minHum: null,
        maxHum: null,
        avgGas: null,
        peakGas: null,
        shelfLifeDaysGained: 5.0,
        inletCycles: 0,
        outletCycles: 0,
        humidifierCycles: 0,
        doorOpenIncidents: 0,
      };
    }

    let tempSum = 0;
    let validTemp = 0;
    let tempInBounds = 0;
    let minTemp = Infinity;
    let maxTemp = -Infinity;

    let humSum = 0;
    let validHum = 0;
    let humInBounds = 0;
    let minHum = Infinity;
    let maxHum = -Infinity;

    let gasSum = 0;
    let validGas = 0;
    let gasInBounds = 0;
    let peakGas = 0;

    let inletCycles = 0;
    let outletCycles = 0;
    let humidifierCycles = 0;
    let doorOpenIncidents = 0;

    readings.forEach((r) => {
      // Temperature
      if (r.dht_exists && r.temperature !== null) {
        validTemp++;
        tempSum += r.temperature;
        if (r.temperature < minTemp) minTemp = r.temperature;
        if (r.temperature > maxTemp) maxTemp = r.temperature;
        if (r.temperature >= thresholds.temp_min && r.temperature <= thresholds.temp_max) {
          tempInBounds++;
        }
      }

      // Humidity
      if (r.dht_exists && r.humidity !== null) {
        validHum++;
        humSum += r.humidity;
        if (r.humidity < minHum) minHum = r.humidity;
        if (r.humidity > maxHum) maxHum = r.humidity;
        if (r.humidity >= thresholds.humidity_min && r.humidity <= thresholds.humidity_max) {
          humInBounds++;
        }
      }

      // Gas level (Ethylene relative index)
      if (r.gas_exists && r.gas_level !== null) {
        validGas++;
        gasSum += r.gas_level;
        if (r.gas_level > peakGas) peakGas = r.gas_level;
        if (r.gas_level <= thresholds.gas_threshold) {
          gasInBounds++;
        }
      }

      // Actuators
      if (r.inlet_fan === 'ON') inletCycles++;
      if (r.outlet_fan === 'ON') outletCycles++;
      if (r.humidifier === 'ON') humidifierCycles++;
      if (r.door_status === 'OPEN') doorOpenIncidents++;
    });

    const tempComp = validTemp > 0 ? (tempInBounds / validTemp) * 100 : 100;
    const humComp = validHum > 0 ? (humInBounds / validHum) * 100 : 100;
    const gasComp = validGas > 0 ? (gasInBounds / validGas) * 100 : 100;
    const overallComp = Math.round((tempComp * 0.4 + humComp * 0.3 + gasComp * 0.3) * 10) / 10;

    // Shelf life estimation:
    // Baseline potential is extracted from matching preset (e.g. +7 days)
    // Multiplied by the climate compliance fraction
    const baselineMax = parseInt(matchedPreset.shelf_life_gain.match(/\+(\d+)/)?.[1] || '7', 10);
    const estimatedDaysGained = Math.max(
      1.0,
      Math.round(((baselineMax * overallComp) / 100) * 10) / 10
    );

    return {
      totalReadings: readings.length,
      validTempCount: validTemp,
      validHumCount: validHum,
      validGasCount: validGas,
      tempCompliance: Math.round(tempComp * 10) / 10,
      humCompliance: Math.round(humComp * 10) / 10,
      gasCompliance: Math.round(gasComp * 10) / 10,
      overallCompliance: overallComp,
      avgTemp: validTemp > 0 ? Math.round((tempSum / validTemp) * 10) / 10 : null,
      minTemp: minTemp !== Infinity ? minTemp : null,
      maxTemp: maxTemp !== -Infinity ? maxTemp : null,
      avgHum: validHum > 0 ? Math.round((humSum / validHum) * 10) / 10 : null,
      minHum: minHum !== Infinity ? minHum : null,
      maxHum: maxHum !== -Infinity ? maxHum : null,
      avgGas: validGas > 0 ? Math.round(gasSum / validGas) : null,
      peakGas,
      shelfLifeDaysGained: estimatedDaysGained,
      inletCycles,
      outletCycles,
      humidifierCycles,
      doorOpenIncidents,
    };
  }, [readings, thresholds, matchedPreset]);

  // Export CSV
  const handleExportCSV = () => {
    if (readings.length === 0) return;
    const headers = [
      'Timestamp',
      'Device_ID',
      'Door_Status',
      'State',
      'DHT_Online',
      'Temperature_C',
      'Humidity_Pct',
      'Gas_Online',
      'Ethylene_VOC_Index',
      'System_Mode',
      'Inlet_Fan',
      'Outlet_Scrubber',
      'Humidifier',
    ];

    const rows = readings.map((r) => [
      `"${r.created_at}"`,
      `"${r.device_id}"`,
      `"${r.door_status}"`,
      `"${r.state}"`,
      r.dht_exists ? 'true' : 'false',
      r.temperature !== null ? r.temperature : 'OFFLINE',
      r.humidity !== null ? r.humidity : 'OFFLINE',
      r.gas_exists ? 'true' : 'false',
      r.gas_level !== null ? r.gas_level : 'OFFLINE',
      `"${r.system_mode}"`,
      `"${r.inlet_fan}"`,
      `"${r.outlet_fan}"`,
      `"${r.humidifier}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `freshguard_analytics_${selectedDevice}_${rangeOption}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to render responsive SVG line chart
  const renderChart = (
    data: (number | null)[],
    minY: number,
    maxY: number,
    color: string,
    unit: string,
    targetMin?: number,
    targetMax?: number,
    isWarningThreshold?: boolean
  ) => {
    const width = 640;
    const height = 180;
    const padding = { top: 20, right: 30, bottom: 25, left: 45 };

    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    if (data.length < 2) {
      return (
        <div className="h-[180px] flex items-center justify-center text-xs text-[var(--color-on-surface-variant)]">
          Collecting telemetry data points...
        </div>
      );
    }

    const scaleY = (val: number) => {
      const clamped = Math.max(minY, Math.min(maxY, val));
      return padding.top + chartH - ((clamped - minY) / (maxY - minY)) * chartH;
    };

    const scaleX = (idx: number) => {
      return padding.left + (idx / (data.length - 1)) * chartW;
    };

    // Build SVG path
    let pathD = '';
    const validPoints: { x: number; y: number; val: number; idx: number }[] = [];

    data.forEach((val, idx) => {
      if (val !== null) {
        const x = scaleX(idx);
        const y = scaleY(val);
        validPoints.push({ x, y, val, idx });
        if (!pathD) {
          pathD = `M ${x} ${y}`;
        } else {
          pathD += ` L ${x} ${y}`;
        }
      }
    });

    // Target shaded area
    let targetBandY1 = 0;
    let targetBandY2 = 0;
    if (targetMin !== undefined && targetMax !== undefined) {
      targetBandY1 = scaleY(targetMax);
      targetBandY2 = scaleY(targetMin);
    }

    const thresholdLineY = targetMax !== undefined && isWarningThreshold ? scaleY(targetMax) : null;

    return (
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={width - padding.right}
            y2={padding.top}
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeDasharray="4 4"
          />
          <line
            x1={padding.left}
            y1={padding.top + chartH / 2}
            x2={width - padding.right}
            y2={padding.top + chartH / 2}
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeDasharray="4 4"
          />
          <line
            x1={padding.left}
            y1={height - padding.bottom}
            x2={width - padding.right}
            y2={height - padding.bottom}
            stroke="currentColor"
            strokeOpacity="0.15"
          />

          {/* Target band (Optimal range) */}
          {targetMin !== undefined && targetMax !== undefined && !isWarningThreshold && (
            <rect
              x={padding.left}
              y={targetBandY1}
              width={chartW}
              height={Math.max(2, targetBandY2 - targetBandY1)}
              fill="currentColor"
              className="text-emerald-500/10 dark:text-emerald-400/10"
            />
          )}

          {/* Threshold alert line */}
          {thresholdLineY !== null && (
            <line
              x1={padding.left}
              y1={thresholdLineY}
              x2={width - padding.right}
              y2={thresholdLineY}
              stroke="#ef4444"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          )}

          {/* Area fill */}
          {pathD && validPoints.length > 1 && (
            <path
              d={`${pathD} L ${validPoints[validPoints.length - 1].x} ${height - padding.bottom} L ${
                validPoints[0].x
              } ${height - padding.bottom} Z`}
              fill={`url(#grad-${color})`}
            />
          )}

          {/* Line stroke */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive data dots */}
          {validPoints.map((pt) => {
            const isHovered = hoveredPoint === readings[pt.idx];
            return (
              <circle
                key={pt.idx}
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 5.5 : 2.5}
                fill={color}
                className="transition-all cursor-pointer"
                onMouseEnter={() => setHoveredPoint(readings[pt.idx])}
                onMouseLeave={() => setHoveredPoint(null)}
              />
            );
          })}

          {/* Y-Axis Labels */}
          <text
            x={padding.left - 6}
            y={padding.top + 4}
            textAnchor="end"
            className="text-[10px] font-mono fill-[var(--color-on-surface-variant)]"
          >
            {maxY}
            {unit}
          </text>
          <text
            x={padding.left - 6}
            y={height - padding.bottom}
            textAnchor="end"
            className="text-[10px] font-mono fill-[var(--color-on-surface-variant)]"
          >
            {minY}
            {unit}
          </text>
        </svg>

        {/* Legend notes */}
        <div className="flex items-center justify-between text-[10px] text-[var(--color-on-surface-variant)] mt-1 px-2">
          <span>
            {readings[0] ? new Date(readings[0].created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
          {targetMin !== undefined && targetMax !== undefined && !isWarningThreshold && (
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              Optimal Band: {targetMin}–{targetMax}
              {unit}
            </span>
          )}
          {isWarningThreshold && targetMax !== undefined && (
            <span className="text-red-500 font-semibold">
              Purge Threshold Limit: {targetMax}
            </span>
          )}
          <span>
            {readings[readings.length - 1]
              ? new Date(readings[readings.length - 1].created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : ''}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 py-8 max-w-5xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-on-surface)] flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--color-primary)]">analytics</span>
            Chamber History & Shelf-Life Analytics
          </h1>
          <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">
            Empirical post-harvest climate metrics, preservation stability index, and audit logs
          </p>
        </div>

        {/* Controls: Box Selector & Export CSV */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-[var(--color-surface-container)] px-3 py-1.5 rounded-2xl border border-[var(--color-outline-variant)]/40">
            <span className="text-[11px] font-semibold text-[var(--color-on-surface-variant)]">Chamber:</span>
            {devices.length === 0 ? (
              <span className="text-xs text-[var(--color-outline)]">No vaults paired</span>
            ) : (
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="bg-transparent text-xs font-bold text-[var(--color-on-surface)] focus:outline-none cursor-pointer"
              >
                {devices.map((d) => (
                  <option key={d.device_id} value={d.device_id} className="bg-[var(--color-surface)] text-[var(--color-on-surface)]">
                    {d.nickname} ({d.device_id})
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            onClick={handleExportCSV}
            disabled={readings.length === 0}
            className="btn-secondary py-1.5 px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Export CSV
          </button>
        </div>
      </div>

      {/* Date Range Selector Pill Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-outline-variant)]/30 pb-3">
        <div className="flex items-center gap-2">
          {(['24h', '7d', '30d', 'custom'] as DateRangeOption[]).map((opt) => (
            <button
              key={opt}
              onClick={() => setRangeOption(opt)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                rangeOption === opt
                  ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] shadow-sm'
                  : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]'
              }`}
            >
              {opt === '24h' ? 'Last 24 Hours' : opt === '7d' ? 'Last 7 Days' : opt === '30d' ? 'Last 30 Days' : 'Custom Range'}
            </button>
          ))}
        </div>

        {rangeOption === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="datetime-local"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="input-field text-xs py-1"
            />
            <span className="text-[var(--color-on-surface-variant)]">to</span>
            <input
              type="datetime-local"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="input-field text-xs py-1"
            />
          </div>
        )}
      </div>

      {/* ── HERO KPI: Estimated Shelf-Life Days Gained ── */}
      <div className="card p-6 border-2 border-[var(--color-primary-container)]/80 relative overflow-hidden bg-gradient-to-br from-[var(--color-surface-container-lowest)] to-[var(--color-surface-container)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">verified</span>
                Botanical Preservation Algorithm
              </span>
              <span className="text-xs text-[var(--color-on-surface-variant)]">
                Target Profile: <strong>{matchedPreset.name}</strong> ({matchedPreset.emoji})
              </span>
            </div>

            <div className="flex items-baseline gap-3">
              <h2 className="text-5xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                +{analytics.shelfLifeDaysGained} Days
              </h2>
              <span className="text-sm font-bold text-[var(--color-on-surface)]">
                Estimated Shelf-Life Gained
              </span>
            </div>

            <p className="text-xs text-[var(--color-on-surface-variant)] max-w-xl leading-relaxed">
              Based on <strong>{analytics.overallCompliance}% chamber stability</strong> maintaining temperature within {thresholds.temp_min}–{thresholds.temp_max}°C, continuous 1.7MHz ultrasonic vapor hydration, and automated catalytic scrubbing keeping VOC index under {thresholds.gas_threshold}.
            </p>
          </div>

          {/* Preservation Pillars Grid */}
          <div className="grid grid-cols-3 gap-3 flex-shrink-0">
            <div className="p-3.5 rounded-2xl bg-[var(--color-surface-container-high)] text-center space-y-1">
              <span className="material-symbols-outlined text-xl text-[var(--color-primary)]">thermostat</span>
              <span className="text-[10px] text-[var(--color-on-surface-variant)] block font-semibold">Thermal Latency</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                +{Math.round((analytics.shelfLifeDaysGained * 0.38) * 10) / 10}d
              </span>
              <span className="text-[9px] text-[var(--color-on-surface-variant)] block">{analytics.tempCompliance}% in-band</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[var(--color-surface-container-high)] text-center space-y-1">
              <span className="material-symbols-outlined text-xl text-cyan-600">water_drop</span>
              <span className="text-[10px] text-[var(--color-on-surface-variant)] block font-semibold">Turgor Vapor</span>
              <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400">
                +{Math.round((analytics.shelfLifeDaysGained * 0.32) * 10) / 10}d
              </span>
              <span className="text-[9px] text-[var(--color-on-surface-variant)] block">{analytics.humCompliance}% in-band</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[var(--color-surface-container-high)] text-center space-y-1">
              <span className="material-symbols-outlined text-xl text-amber-500">science</span>
              <span className="text-[10px] text-[var(--color-on-surface-variant)] block font-semibold">Ethylene Catalysis</span>
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                +{Math.round((analytics.shelfLifeDaysGained * 0.30) * 10) / 10}d
              </span>
              <span className="text-[9px] text-[var(--color-on-surface-variant)] block">{analytics.gasCompliance}% purged</span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Temp Card */}
        <div className="card p-4 space-y-1">
          <span className="text-[11px] font-semibold text-[var(--color-on-surface-variant)] flex items-center gap-1">
            <span className="material-symbols-outlined text-sm text-[var(--color-primary)]">thermostat</span>
            Average Temp
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-[var(--color-on-surface)] font-mono">
              {analytics.avgTemp !== null ? formatTemp(analytics.avgTemp) : 'Offline'}
            </span>
          </div>
          <span className="text-[10px] text-[var(--color-on-surface-variant)] block">
            Min: {analytics.minTemp !== null ? formatTemp(analytics.minTemp) : '—'} / Max: {analytics.maxTemp !== null ? formatTemp(analytics.maxTemp) : '—'}
          </span>
        </div>

        {/* Hum Card */}
        <div className="card p-4 space-y-1">
          <span className="text-[11px] font-semibold text-[var(--color-on-surface-variant)] flex items-center gap-1">
            <span className="material-symbols-outlined text-sm text-cyan-600">water_drop</span>
            Average Humidity
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-[var(--color-on-surface)] font-mono">
              {analytics.avgHum !== null ? `${analytics.avgHum}%` : 'Offline'}
            </span>
          </div>
          <span className="text-[10px] text-[var(--color-on-surface-variant)] block">
            Target: {thresholds.humidity_min}–{thresholds.humidity_max}%
          </span>
        </div>

        {/* Gas Index Card */}
        <div className="card p-4 space-y-1">
          <span className="text-[11px] font-semibold text-[var(--color-on-surface-variant)] flex items-center gap-1">
            <span className="material-symbols-outlined text-sm text-amber-500">science</span>
            Ethylene / VOC Index
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-[var(--color-on-surface)] font-mono">
              {analytics.avgGas !== null ? analytics.avgGas : 'Offline'}
            </span>
            <span className="text-[10px] text-[var(--color-on-surface-variant)]">/1023</span>
          </div>
          <span className="text-[10px] text-[var(--color-on-surface-variant)] block">
            Peak: {analytics.peakGas ?? '—'} (limit: {thresholds.gas_threshold})
          </span>
        </div>

        {/* Actuator Cycles */}
        <div className="card p-4 space-y-1">
          <span className="text-[11px] font-semibold text-[var(--color-on-surface-variant)] flex items-center gap-1">
            <span className="material-symbols-outlined text-sm text-purple-600">cyclone</span>
            Actuator Purges
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-[var(--color-on-surface)] font-mono">
              {analytics.outletCycles}
            </span>
            <span className="text-[10px] text-[var(--color-on-surface-variant)]">scrubber runs</span>
          </div>
          <span className="text-[10px] text-[var(--color-on-surface-variant)] block">
            Mist runs: {analytics.humidifierCycles} | Door opens: {analytics.doorOpenIncidents}
          </span>
        </div>
      </div>

      {/* ── Multi-Metric Trends Charts ── */}
      <div className="card p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-outline-variant)]/30 pb-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--color-on-surface)]">
              Chamber Climate & Gas Dynamics
            </h3>
            <p className="text-[11px] text-[var(--color-on-surface-variant)]">
              {readings.length} telemetry readings plotted across selected timeframe
            </p>
          </div>

          <div className="flex gap-1.5 text-xs">
            {(['all', 'temp', 'hum', 'gas'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveChartTab(tab)}
                className={`px-3 py-1 rounded-full font-semibold transition-all ${
                  activeChartTab === tab
                    ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] shadow-sm'
                    : 'text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)]'
                }`}
              >
                {tab === 'all' ? 'All Metrics' : tab === 'temp' ? 'Temperature' : tab === 'hum' ? 'Humidity' : 'VOC Index'}
              </button>
            ))}
          </div>
        </div>

        {/* Hover inspection toast */}
        {hoveredPoint && (
          <div className="p-3 rounded-2xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)]/50 text-xs flex flex-wrap items-center justify-between gap-4 animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-[var(--color-primary)]">schedule</span>
              <span className="font-semibold text-[var(--color-on-surface)]">
                {new Date(hoveredPoint.created_at).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span>
                Temp: <strong>{hoveredPoint.temperature !== null ? formatTemp(hoveredPoint.temperature) : 'Offline'}</strong>
              </span>
              <span>
                RH: <strong>{hoveredPoint.humidity !== null ? `${hoveredPoint.humidity}%` : 'Offline'}</strong>
              </span>
              <span>
                VOC Index: <strong>{hoveredPoint.gas_level !== null ? hoveredPoint.gas_level : 'Offline'}</strong>
              </span>
              <span className="font-sans px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-surface-container-high)]">
                {hoveredPoint.door_status}
              </span>
            </div>
          </div>
        )}

        {/* Chart 1: Temperature */}
        {(activeChartTab === 'all' || activeChartTab === 'temp') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-on-surface)] flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Temperature Trend (°C)
              </span>
              <span className="text-[11px] text-[var(--color-on-surface-variant)]">
                Compliance: <strong>{analytics.tempCompliance}%</strong>
              </span>
            </div>
            {renderChart(
              readings.map((r) => r.temperature),
              -2,
              25,
              '#10b981',
              '°C',
              thresholds.temp_min,
              thresholds.temp_max
            )}
          </div>
        )}

        {/* Chart 2: Humidity */}
        {(activeChartTab === 'all' || activeChartTab === 'hum') && (
          <div className="space-y-2 pt-4 border-t border-[var(--color-outline-variant)]/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-on-surface)] flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                Relative Humidity Trend (%)
              </span>
              <span className="text-[11px] text-[var(--color-on-surface-variant)]">
                Compliance: <strong>{analytics.humCompliance}%</strong>
              </span>
            </div>
            {renderChart(
              readings.map((r) => r.humidity),
              40,
              100,
              '#06b6d4',
              '%',
              thresholds.humidity_min,
              thresholds.humidity_max
            )}
          </div>
        )}

        {/* Chart 3: Ethylene / VOC Index */}
        {(activeChartTab === 'all' || activeChartTab === 'gas') && (
          <div className="space-y-2 pt-4 border-t border-[var(--color-outline-variant)]/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-on-surface)] flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Ethylene / VOC Index (Relative 0–1023)
              </span>
              <span className="text-[11px] text-[var(--color-on-surface-variant)]">
                Compliance: <strong>{analytics.gasCompliance}%</strong>
              </span>
            </div>
            {renderChart(
              readings.map((r) => r.gas_level),
              0,
              500,
              '#f59e0b',
              '',
              undefined,
              thresholds.gas_threshold,
              true
            )}
          </div>
        )}
      </div>

      {/* ── Telemetry Audit Log Table ── */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--color-on-surface)]">
              Historical Telemetry Audit Log
            </h3>
            <p className="text-[11px] text-[var(--color-on-surface-variant)]">
              Chronological ledger of raw readings ingested by FreshGuard cloud backend
            </p>
          </div>
          <span className="text-xs font-semibold text-[var(--color-on-surface-variant)]">
            Showing last {Math.min(readings.length, 50)} records
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-outline-variant)]/40 text-[var(--color-on-surface-variant)]">
                <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                <th className="py-2.5 px-3 font-semibold">Door</th>
                <th className="py-2.5 px-3 font-semibold">Temperature</th>
                <th className="py-2.5 px-3 font-semibold">Humidity</th>
                <th className="py-2.5 px-3 font-semibold">Ethylene / VOC Index</th>
                <th className="py-2.5 px-3 font-semibold">Mode</th>
                <th className="py-2.5 px-3 font-semibold">Actuators Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-outline-variant)]/20">
              {readings.slice(-50).reverse().map((r, i) => (
                <tr key={r.id || i} className="hover:bg-[var(--color-surface-container)]/50 transition-colors">
                  <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--color-on-surface-variant)]">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.door_status === 'OPEN'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}
                    >
                      {r.door_status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-bold font-mono">
                    {r.dht_exists && r.temperature !== null ? (
                      formatTemp(r.temperature)
                    ) : (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-sans font-semibold">
                        Sensor offline
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-bold font-mono">
                    {r.dht_exists && r.humidity !== null ? (
                      `${r.humidity}%`
                    ) : (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-sans font-semibold">
                        Sensor offline
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-bold font-mono">
                    {r.gas_exists && r.gas_level !== null ? (
                      r.gas_level
                    ) : (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-sans font-semibold">
                        Sensor offline
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]">
                      {r.system_mode || 'AUTO'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex gap-1">
                      {r.inlet_fan === 'ON' && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[9px] font-bold">
                          Inlet
                        </span>
                      )}
                      {r.outlet_fan === 'ON' && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[9px] font-bold">
                          Scrubber
                        </span>
                      )}
                      {r.humidifier === 'ON' && (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 text-[9px] font-bold">
                          Mist
                        </span>
                      )}
                      {r.inlet_fan !== 'ON' && r.outlet_fan !== 'ON' && r.humidifier !== 'ON' && (
                        <span className="text-[10px] text-[var(--color-on-surface-variant)]">Standby</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
