import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useDeviceStore, TelemetryReading } from '../store/deviceStore';
import { useSettingsStore } from '../store/settingsStore';
import { initSocket } from '../utils/socket';

export default function BoxDetailPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const { formatTemp } = useSettingsStore();
  const {
    devices,
    latestReadings,
    history,
    localIps,
    localReachability,
    fetchDevices,
    fetchLatest,
    fetchHistory,
    handleTelemetryUpdate,
    setLocalIp,
    checkLocalReachability,
    sendLocalControl,
    updateThresholds,
  } = useDeviceStore();

  const currentDevice = devices.find((d) => d.device_id === deviceId);
  const currentReading: TelemetryReading | undefined = deviceId ? latestReadings[deviceId] : undefined;
  const currentHistory: TelemetryReading[] = (deviceId ? history[deviceId] : []) || [];
  const localIp = (deviceId ? localIps[deviceId] : '') || '';
  const isReachable = deviceId ? !!localReachability[deviceId] : false;

  const [activeTab, setActiveTab] = useState<'overview' | 'controls' | 'thresholds'>('overview');
  const [ipInput, setIpInput] = useState(localIp || '192.168.1.100');
  const [controlLoading, setControlLoading] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // Threshold form state
  const [tempMin, setTempMin] = useState(currentDevice?.thresholds?.temp_min ?? 1.0);
  const [tempMax, setTempMax] = useState(currentDevice?.thresholds?.temp_max ?? 4.0);
  const [humMin, setHumMin] = useState(currentDevice?.thresholds?.humidity_min ?? 90.0);
  const [humMax, setHumMax] = useState(currentDevice?.thresholds?.humidity_max ?? 95.0);
  const [gasThreshold, setGasThreshold] = useState(currentDevice?.thresholds?.gas_threshold ?? 230);
  const [nicknameInput, setNicknameInput] = useState(currentDevice?.nickname ?? 'FreshGuard Vault');
  const [thresholdSaving, setThresholdSaving] = useState(false);

  // Load device data on mount
  useEffect(() => {
    if (!token || !deviceId) return;
    fetchDevices(token);
    fetchLatest(deviceId, token);
    fetchHistory(deviceId, token, 100);

    // Initialize socket for live streaming
    if (user?.account_id) {
      initSocket(user.account_id, token, (data) => {
        if (data.device_id === deviceId) {
          handleTelemetryUpdate(data);
        }
      });
    }

    // Ping local reachability
    checkLocalReachability(deviceId);
    const interval = setInterval(() => {
      checkLocalReachability(deviceId);
    }, 15000);

    return () => clearInterval(interval);
  }, [token, deviceId, user?.account_id]);

  useEffect(() => {
    if (currentDevice) {
      setTempMin(currentDevice.thresholds.temp_min);
      setTempMax(currentDevice.thresholds.temp_max);
      setHumMin(currentDevice.thresholds.humidity_min);
      setHumMax(currentDevice.thresholds.humidity_max);
      setGasThreshold(currentDevice.thresholds.gas_threshold);
      setNicknameInput(currentDevice.nickname);
    }
  }, [currentDevice]);

  // Telemetry status variables
  const isDoorOpen = currentReading?.door_status === 'OPEN';
  const chamberState = currentReading?.state || 'NORMAL';
  const isLockoutActive = isDoorOpen || chamberState === 'DOOR_OPEN' || chamberState === 'WAIT_5_SECONDS';
  const isManualMode = currentReading?.system_mode === 'MANUAL';

  // Toggle Mode (AUTO vs MANUAL)
  const handleToggleMode = async () => {
    if (!deviceId) return;
    const newMode = isManualMode ? 'AUTO' : 'MANUAL';
    setControlLoading(true);
    setStatusFeedback(null);

    const res = await sendLocalControl(deviceId, { mode: newMode });
    setControlLoading(false);

    if (res.success) {
      setStatusFeedback(`Mode switched to ${newMode}`);
      if (currentReading) {
        handleTelemetryUpdate({ ...currentReading, system_mode: newMode });
      }
    } else {
      setStatusFeedback(res.error || "Away — monitoring only, reconnect to box's Wi-Fi to control.");
    }
  };

  // Toggle Relay (Inlet, Outlet, Mist, White LED, Blue LED)
  const handleToggleRelay = async (relayKey: 'inlet_fan' | 'outlet_fan' | 'humidifier' | 'white_led' | 'blue_led') => {
    if (!deviceId || !currentReading) return;

    // Check Safety Lockout for climate relays
    if (['inlet_fan', 'outlet_fan', 'humidifier'].includes(relayKey)) {
      if (isLockoutActive) {
        setStatusFeedback('Safety Interlock Active: Door is open or stabilizing. Climate actuators cannot be activated.');
        return;
      }
      if (!isManualMode) {
        setStatusFeedback('Chamber is in AUTO mode. Switch to MANUAL mode to override climate relays.');
        return;
      }
    }

    const currentState = currentReading[relayKey] === 'ON';
    const nextState = !currentState;
    setControlLoading(true);
    setStatusFeedback(null);

    const res = await sendLocalControl(deviceId, { [relayKey]: nextState });
    setControlLoading(false);

    if (res.success) {
      setStatusFeedback(`${relayKey.replace('_', ' ')} turned ${nextState ? 'ON' : 'OFF'}`);
      handleTelemetryUpdate({
        ...currentReading,
        [relayKey]: nextState ? 'ON' : 'OFF',
      });
    } else {
      setStatusFeedback(res.error || "Away — monitoring only, reconnect to box's Wi-Fi to control.");
    }
  };

  // Save Thresholds to Backend
  const handleSaveThresholds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !deviceId) return;
    setThresholdSaving(true);
    try {
      await updateThresholds(token, deviceId, {
        temp_min: tempMin,
        temp_max: tempMax,
        humidity_min: humMin,
        humidity_max: humMax,
        gas_threshold: gasThreshold,
        nickname: nicknameInput,
      });
      setStatusFeedback('Thresholds updated successfully');
      setActiveTab('overview');
    } catch (err: any) {
      setStatusFeedback(`Failed to update thresholds: ${err.message}`);
    } finally {
      setThresholdSaving(false);
    }
  };

  // SVG Chart Computations for 24-hour Telemetry
  const chartData = useMemo(() => {
    if (!currentHistory || currentHistory.length === 0) return [];
    return currentHistory.map((item) => ({
      time: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      temp: item.temperature ?? null,
      humidity: item.humidity ?? null,
      gas: item.gas_level ?? null,
    }));
  }, [currentHistory]);

  const vocPercent = currentReading?.gas_level != null ? Math.round((currentReading.gas_level / 1023) * 100) : null;

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/app/dashboard')}
            className="p-2 rounded-full hover:bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] transition-colors"
            aria-label="Back to Dashboard"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-on-surface)]">
                {currentDevice?.nickname || 'FreshGuard Chamber'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]">
                {deviceId}
              </span>
            </div>
            <p className="text-xs text-[var(--color-on-surface-variant)]">
              Last updated: {currentReading ? new Date(currentReading.created_at).toLocaleTimeString() : 'Awaiting data'}
            </p>
          </div>
        </div>

        {/* State Badges */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
              isDoorOpen
                ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 animate-pulse'
                : chamberState === 'WAIT_5_SECONDS'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {isDoorOpen ? 'DOOR OPEN (SAFETY HALT)' : chamberState === 'WAIT_5_SECONDS' ? 'STABILIZING (5s)' : 'NORMAL'}
          </span>

          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]">
            MODE: {currentReading?.system_mode || 'AUTO'}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* PERSISTENT CONNECTIVITY & REACHABILITY BANNER                 */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-2xl text-xs ${
          isReachable
            ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
            : 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-base">
            {isReachable ? 'wifi' : 'wifi_off'}
          </span>
          <span className="font-medium">
            {isReachable
              ? `Connected to Chamber on Local LAN (${localIp}) — Full real-time relay control enabled.`
              : "Away — monitoring only, reconnect to box's Wi-Fi network to control actuators."}
          </span>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <input
            type="text"
            value={ipInput}
            onChange={(e) => setIpInput(e.target.value)}
            placeholder="Chamber IP"
            className="px-2.5 py-1 rounded-lg border border-[var(--color-outline-variant)] bg-[var(--color-surface)] text-[11px] font-mono text-[var(--color-on-surface)] w-28"
          />
          <button
            onClick={() => {
              if (deviceId) {
                setLocalIp(deviceId, ipInput);
                checkLocalReachability(deviceId);
              }
            }}
            className="px-2.5 py-1 rounded-lg bg-[var(--color-surface-container-high)] hover:bg-[var(--color-surface-container-highest)] font-semibold text-[11px]"
          >
            Update IP
          </button>
        </div>
      </div>

      {/* Safety Alert Notification */}
      {isLockoutActive && (
        <div className="card p-4 border-l-4 border-red-500 bg-red-50/50 dark:bg-red-950/20 text-xs text-red-700 dark:text-red-300 flex items-start gap-3">
          <span className="material-symbols-outlined text-xl flex-shrink-0 text-red-600">gpp_maybe</span>
          <div>
            <p className="font-bold">Safety Interlock Engaged</p>
            <p className="mt-0.5">
              The optical beam sensor detected an open door or chamber stabilization is active. In accordance with laboratory safety protocol, all fans and ultrasonic mist atomizers are halted.
            </p>
          </div>
        </div>
      )}

      {statusFeedback && (
        <div className="p-3 rounded-xl bg-[var(--color-surface-container)] text-xs text-[var(--color-on-surface)] flex items-center justify-between">
          <span>{statusFeedback}</span>
          <button onClick={() => setStatusFeedback(null)} className="text-[var(--color-outline)] hover:text-current">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-[var(--color-outline-variant)]/40 gap-4 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-2.5 flex items-center gap-1.5 transition-colors border-b-2 ${
            activeTab === 'overview'
              ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
              : 'border-transparent text-[var(--color-on-surface-variant)]'
          }`}
        >
          <span className="material-symbols-outlined text-base">monitoring</span>
          24h Telemetry & Live Status
        </button>

        <button
          onClick={() => setActiveTab('controls')}
          className={`pb-2.5 flex items-center gap-1.5 transition-colors border-b-2 ${
            activeTab === 'controls'
              ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
              : 'border-transparent text-[var(--color-on-surface-variant)]'
          }`}
        >
          <span className="material-symbols-outlined text-base">toggle_on</span>
          Relay & Mode Controls
        </button>

        <button
          onClick={() => setActiveTab('thresholds')}
          className={`pb-2.5 flex items-center gap-1.5 transition-colors border-b-2 ${
            activeTab === 'thresholds'
              ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
              : 'border-transparent text-[var(--color-on-surface-variant)]'
          }`}
        >
          <span className="material-symbols-outlined text-base">tune</span>
          Climate Thresholds
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: 24-HOUR TELEMETRY CHART & LIVE SENSOR STATUS           */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Sensor Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Temperature */}
            <div className="card p-4">
              <span className="text-[11px] font-semibold text-[var(--color-on-surface-variant)] flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-[var(--color-primary)]">thermostat</span>
                Temperature
              </span>
              <p className="text-xl font-bold text-[var(--color-on-surface)] mt-2">
                {currentReading?.dht_exists === false
                  ? 'Sensor offline'
                  : currentReading?.temperature != null
                  ? formatTemp(currentReading.temperature)
                  : '--'}
              </p>
              <span className="text-[10px] text-[var(--color-on-surface-variant)] mt-1 block">
                Target: {formatTemp(currentDevice?.thresholds.temp_min)} – {formatTemp(currentDevice?.thresholds.temp_max)}
              </span>
            </div>

            {/* Humidity */}
            <div className="card p-4">
              <span className="text-[11px] font-semibold text-[var(--color-on-surface-variant)] flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-[var(--color-primary)]">water_drop</span>
                Humidity
              </span>
              <p className="text-xl font-bold text-[var(--color-on-surface)] mt-2">
                {currentReading?.dht_exists === false
                  ? 'Sensor offline'
                  : currentReading?.humidity != null
                  ? `${Math.round(currentReading.humidity)}%`
                  : '--'}
              </p>
              <span className="text-[10px] text-[var(--color-on-surface-variant)] mt-1 block">
                Target: {currentDevice?.thresholds.humidity_min}% – {currentDevice?.thresholds.humidity_max}%
              </span>
            </div>

            {/* Ethylene / VOC Index */}
            <div className="card p-4">
              <span className="text-[11px] font-semibold text-[var(--color-on-surface-variant)] flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-amber-500">science</span>
                Ethylene / VOC
              </span>
              <p className="text-xl font-bold text-[var(--color-on-surface)] mt-2">
                {currentReading?.gas_exists === false
                  ? 'Sensor offline'
                  : currentReading?.gas_level != null
                  ? `${currentReading.gas_level} / 1023`
                  : '--'}
              </p>
              <span className="text-[10px] text-[var(--color-on-surface-variant)] mt-1 block">
                Index (Relative scale, not ppm)
              </span>
            </div>

            {/* Door Status */}
            <div className="card p-4">
              <span className="text-[11px] font-semibold text-[var(--color-on-surface-variant)] flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-indigo-500">sensor_door</span>
                Safety Interlock
              </span>
              <p className="text-xl font-bold text-[var(--color-on-surface)] mt-2">
                {currentReading?.door_status || 'CLOSED'}
              </p>
              <span className="text-[10px] text-[var(--color-on-surface-variant)] mt-1 block">
                IR Beam Sensor (GPIO 14)
              </span>
            </div>
          </div>

          {/* 24-Hour Telemetry Historical Chart */}
          <div className="card p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-[var(--color-on-surface)]">
                  24-Hour Chamber Climate Trends
                </h3>
                <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                  Live readings updated continuously from Socket.io & REST history
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-[var(--color-primary)] font-medium">
                  <span className="w-2.5 h-0.5 bg-[var(--color-primary)] rounded" /> Temp (°C)
                </span>
                <span className="flex items-center gap-1 text-cyan-600 font-medium">
                  <span className="w-2.5 h-0.5 bg-cyan-600 rounded" /> Humidity (%)
                </span>
                <span className="flex items-center gap-1 text-amber-600 font-medium">
                  <span className="w-2.5 h-0.5 bg-amber-600 rounded" /> VOC Index
                </span>
              </div>
            </div>

            {chartData.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-[var(--color-on-surface-variant)] text-xs gap-2">
                <span className="material-symbols-outlined text-3xl">show_chart</span>
                <p>Collecting initial 24h chamber data points...</p>
              </div>
            ) : (
              <div className="w-full h-56 relative flex items-end pt-4 pb-2 border-b border-[var(--color-outline-variant)]/30">
                {/* SVG Visualizer */}
                <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines */}
                  <line x1="0" y1="30" x2="500" y2="30" stroke="currentColor" strokeOpacity="0.08" />
                  <line x1="0" y1="75" x2="500" y2="75" stroke="currentColor" strokeOpacity="0.08" />
                  <line x1="0" y1="120" x2="500" y2="120" stroke="currentColor" strokeOpacity="0.08" />

                  {/* Temperature Polyline */}
                  <polyline
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={chartData
                      .map((d, i) => {
                        const x = (i / Math.max(chartData.length - 1, 1)) * 500;
                        const tempVal = d.temp ?? 20;
                        const y = 150 - Math.min(Math.max((tempVal / 40) * 150, 10), 140);
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />

                  {/* Humidity Polyline */}
                  <polyline
                    fill="none"
                    stroke="#0891b2"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                    strokeLinecap="round"
                    points={chartData
                      .map((d, i) => {
                        const x = (i / Math.max(chartData.length - 1, 1)) * 500;
                        const humVal = d.humidity ?? 50;
                        const y = 150 - Math.min(Math.max((humVal / 100) * 150, 10), 140);
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />

                  {/* VOC Gas Polyline */}
                  <polyline
                    fill="none"
                    stroke="#d97706"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    points={chartData
                      .map((d, i) => {
                        const x = (i / Math.max(chartData.length - 1, 1)) * 500;
                        const gasVal = d.gas ?? 200;
                        const y = 150 - Math.min(Math.max((gasVal / 1023) * 150, 10), 140);
                        return `${x},${y}`;
                      })
                      .join(' ')}
                  />
                </svg>
              </div>
            )}

            <div className="flex justify-between items-center text-[10px] font-mono text-[var(--color-on-surface-variant)] pt-2">
              <span>{chartData[0]?.time || 'Past'}</span>
              <span>24h Timeline Progression</span>
              <span>{chartData[chartData.length - 1]?.time || 'Now'}</span>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: RELAY CONTROLS & AUTO/MANUAL TOGGLE                    */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'controls' && (
        <div className="space-y-6">
          {/* Mode Selector Card */}
          <div className="card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-[var(--color-on-surface)] flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-[var(--color-primary)]">tune</span>
                Chamber Operational Mode: {currentReading?.system_mode || 'AUTO'}
              </h3>
              <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">
                {isManualMode
                  ? 'MANUAL mode: Automated PID loops paused. You can directly control each relay.'
                  : 'AUTO mode: ESP32 autonomous climate controller manages fans & ultrasonic atomizer according to preset botanical thresholds.'}
              </p>
            </div>

            <button
              onClick={handleToggleMode}
              disabled={controlLoading || !isReachable}
              className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${
                isManualMode
                  ? 'bg-amber-600 text-white shadow-sm hover:bg-amber-700'
                  : 'btn-primary'
              } disabled:opacity-50`}
            >
              <span className="material-symbols-outlined text-sm">
                {isManualMode ? 'auto_mode' : 'handyman'}
              </span>
              Switch to {isManualMode ? 'AUTO Mode' : 'MANUAL Mode'}
            </button>
          </div>

          {/* Actuator Relay Controls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Relay 1: Inlet Fan */}
            <div className={`card p-5 flex items-center justify-between gap-4 ${!isManualMode || isLockoutActive ? 'opacity-70' : ''}`}>
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${currentReading?.inlet_fan === 'ON' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-[var(--color-surface-container)] text-[var(--color-outline)]'}`}>
                  <span className={`material-symbols-outlined text-2xl ${currentReading?.inlet_fan === 'ON' ? 'animate-spin' : ''}`}>
                    mode_fan
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--color-on-surface)]">Inlet HEPA Fan</h4>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)]">Relay 1 (GPIO 16) — Air Intake</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold ${currentReading?.inlet_fan === 'ON' ? 'text-emerald-600' : 'text-[var(--color-outline)]'}`}>
                  {currentReading?.inlet_fan === 'ON' ? 'RUNNING' : 'STOPPED'}
                </span>
                <button
                  onClick={() => handleToggleRelay('inlet_fan')}
                  disabled={!isManualMode || isLockoutActive || controlLoading || !isReachable}
                  className={`w-12 h-6 rounded-full transition-colors relative ${currentReading?.inlet_fan === 'ON' ? 'bg-emerald-600' : 'bg-[var(--color-outline-variant)]'} disabled:cursor-not-allowed`}
                >
                  <span className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${currentReading?.inlet_fan === 'ON' ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>
            </div>

            {/* Relay 2: Outlet Scrubber Fan */}
            <div className={`card p-5 flex items-center justify-between gap-4 ${!isManualMode || isLockoutActive ? 'opacity-70' : ''}`}>
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${currentReading?.outlet_fan === 'ON' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-[var(--color-surface-container)] text-[var(--color-outline)]'}`}>
                  <span className={`material-symbols-outlined text-2xl ${currentReading?.outlet_fan === 'ON' ? 'animate-spin' : ''}`}>
                    air
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--color-on-surface)]">Outlet Scrubber Fan</h4>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)]">Relay 2 (GPIO 17) — Ethylene Purge</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold ${currentReading?.outlet_fan === 'ON' ? 'text-emerald-600' : 'text-[var(--color-outline)]'}`}>
                  {currentReading?.outlet_fan === 'ON' ? 'RUNNING' : 'STOPPED'}
                </span>
                <button
                  onClick={() => handleToggleRelay('outlet_fan')}
                  disabled={!isManualMode || isLockoutActive || controlLoading || !isReachable}
                  className={`w-12 h-6 rounded-full transition-colors relative ${currentReading?.outlet_fan === 'ON' ? 'bg-emerald-600' : 'bg-[var(--color-outline-variant)]'} disabled:cursor-not-allowed`}
                >
                  <span className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${currentReading?.outlet_fan === 'ON' ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>
            </div>

            {/* Relay 3: Ultrasonic Humidifier Mist */}
            <div className={`card p-5 flex items-center justify-between gap-4 ${!isManualMode || isLockoutActive ? 'opacity-70' : ''}`}>
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${currentReading?.humidifier === 'ON' ? 'bg-cyan-100 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-400' : 'bg-[var(--color-surface-container)] text-[var(--color-outline)]'}`}>
                  <span className="material-symbols-outlined text-2xl">
                    humidity_mid
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--color-on-surface)]">Ultrasonic Humidifier</h4>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)]">Relay 3 (GPIO 5) — 1.7MHz Atomizer</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold ${currentReading?.humidifier === 'ON' ? 'text-cyan-600' : 'text-[var(--color-outline)]'}`}>
                  {currentReading?.humidifier === 'ON' ? 'MISTING' : 'OFF'}
                </span>
                <button
                  onClick={() => handleToggleRelay('humidifier')}
                  disabled={!isManualMode || isLockoutActive || controlLoading || !isReachable}
                  className={`w-12 h-6 rounded-full transition-colors relative ${currentReading?.humidifier === 'ON' ? 'bg-cyan-600' : 'bg-[var(--color-outline-variant)]'} disabled:cursor-not-allowed`}
                >
                  <span className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${currentReading?.humidifier === 'ON' ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>
            </div>

            {/* Relay 4: Inspection White LED (Can be toggled in both AUTO and MANUAL) */}
            <div className="card p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${currentReading?.white_led === 'ON' ? 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400' : 'bg-[var(--color-surface-container)] text-[var(--color-outline)]'}`}>
                  <span className="material-symbols-outlined text-2xl">
                    lightbulb
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--color-on-surface)]">5000K Inspection Daylight</h4>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)]">Relay 4 (GPIO 19) — Bezel Tap / App</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold ${currentReading?.white_led === 'ON' ? 'text-amber-600' : 'text-[var(--color-outline)]'}`}>
                  {currentReading?.white_led === 'ON' ? 'ON' : 'OFF'}
                </span>
                <button
                  onClick={() => handleToggleRelay('white_led')}
                  disabled={controlLoading || !isReachable}
                  className={`w-12 h-6 rounded-full transition-colors relative ${currentReading?.white_led === 'ON' ? 'bg-amber-500' : 'bg-[var(--color-outline-variant)]'}`}
                >
                  <span className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${currentReading?.white_led === 'ON' ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>
            </div>

            {/* Relay 5: Antimicrobial Blue Light (Can be toggled in both AUTO and MANUAL) */}
            <div className="card p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${currentReading?.blue_led === 'ON' ? 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400' : 'bg-[var(--color-surface-container)] text-[var(--color-outline)]'}`}>
                  <span className="material-symbols-outlined text-2xl">
                    sanitizer
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--color-on-surface)]">450nm Blue Sanitizer</h4>
                  <p className="text-[11px] text-[var(--color-on-surface-variant)]">Relay 5 (GPIO 18) — Sterilization</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold ${currentReading?.blue_led === 'ON' ? 'text-blue-600' : 'text-[var(--color-outline)]'}`}>
                  {currentReading?.blue_led === 'ON' ? 'ON' : 'OFF'}
                </span>
                <button
                  onClick={() => handleToggleRelay('blue_led')}
                  disabled={controlLoading || !isReachable}
                  className={`w-12 h-6 rounded-full transition-colors relative ${currentReading?.blue_led === 'ON' ? 'bg-blue-600' : 'bg-[var(--color-outline-variant)]'}`}
                >
                  <span className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${currentReading?.blue_led === 'ON' ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: CLIMATE THRESHOLDS CONFIGURATION                       */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'thresholds' && (
        <div className="card p-6">
          <h3 className="text-base font-bold text-[var(--color-on-surface)] mb-1">
            Automated Chamber Thresholds
          </h3>
          <p className="text-xs text-[var(--color-on-surface-variant)] mb-5">
            When operating in AUTO mode, the ESP32 climate loops maintain chamber parameters within these boundaries.
          </p>

          <form onSubmit={handleSaveThresholds} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                Vault Nickname
              </label>
              <input
                type="text"
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                className="input-field w-full text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                  Min Temperature (°C)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={tempMin}
                  onChange={(e) => setTempMin(parseFloat(e.target.value))}
                  className="input-field w-full text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                  Max Temperature (°C)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={tempMax}
                  onChange={(e) => setTempMax(parseFloat(e.target.value))}
                  className="input-field w-full text-sm"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                  Min Relative Humidity (%)
                </label>
                <input
                  type="number"
                  value={humMin}
                  onChange={(e) => setHumMin(parseFloat(e.target.value))}
                  className="input-field w-full text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                  Max Relative Humidity (%)
                </label>
                <input
                  type="number"
                  value={humMax}
                  onChange={(e) => setHumMax(parseFloat(e.target.value))}
                  className="input-field w-full text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                Ethylene / VOC Index Alert Threshold (0–1023)
              </label>
              <input
                type="number"
                value={gasThreshold}
                onChange={(e) => setGasThreshold(parseInt(e.target.value, 10))}
                className="input-field w-full text-sm"
                required
              />
              <span className="text-[11px] text-[var(--color-on-surface-variant)] mt-1 block">
                If the relative VOC index rises above this value, the chamber triggers the catalytic scrubber fan.
              </span>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={thresholdSaving}
                className="btn-primary py-3 px-8 text-sm font-semibold rounded-full flex items-center gap-2"
              >
                {thresholdSaving ? 'Saving...' : 'Save Thresholds to Vault'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
