import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useDeviceStore } from '../store/deviceStore';
import { useSettingsStore } from '../store/settingsStore';
import { initSocket } from '../utils/socket';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  const { devices, latestReadings, fetchDevices, handleTelemetryUpdate } = useDeviceStore();
  const { formatTemp } = useSettingsStore();

  const [selectedBoxId, setSelectedBoxId] = useState<string>('all');

  useEffect(() => {
    if (token) {
      fetchDevices(token);
    }

    if (user?.account_id) {
      initSocket(user.account_id, token || undefined, (data) => {
        handleTelemetryUpdate(data);
      });
    }
  }, [token, user?.account_id]);

  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  };

  const activeFilteredDevices =
    selectedBoxId === 'all'
      ? devices
      : devices.filter((d) => d.device_id === selectedBoxId);

  return (
    <div className="px-4 py-6 lg:px-8 lg:py-8 max-w-5xl mx-auto space-y-6">
      {/* Greeting & Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--color-on-surface)]">
            Good {getTimeOfDay()}, {user?.name?.split(' ')[0] ?? 'Researcher'} 🌿
          </h2>
          <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">
            {devices.length === 0
              ? 'No chambers connected yet. Add your first FreshGuard Vault below.'
              : `Monitoring ${devices.length} active botanical storage ${devices.length === 1 ? 'vault' : 'vaults'}`}
          </p>
        </div>

        <button
          onClick={() => navigate('/app/devices/pair')}
          aria-label="Add a new FreshGuard box"
          className="btn-primary py-2.5 px-5 rounded-full text-xs font-semibold flex items-center gap-2 self-start sm:self-auto shadow-sm min-h-[44px]"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Add a Box
        </button>
      </div>

      {/* Global Connectivity Banner */}
      <div className="flex items-center justify-between gap-2.5 px-4 py-2.5 rounded-2xl bg-[var(--color-surface-container)] text-xs">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
          <span className="text-[var(--color-on-surface-variant)] font-medium">
            Real-time Socket.io Telemetry Active • Account:{' '}
            <code className="text-emerald-700 dark:text-emerald-400 font-bold">
              {user?.account_id || 'mshiva5626'}
            </code>
          </span>
        </div>

        <span className="hidden sm:inline-block text-[11px] text-[var(--color-on-surface-variant)]">
          2500ms heartbeat
        </span>
      </div>

      {/* ── Multi-Box Switcher Tab Bar ── */}
      {devices.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-wider">
              Select Chamber
            </span>
            {selectedBoxId !== 'all' && (
              <button
                onClick={() => setSelectedBoxId('all')}
                aria-label="View all chambers"
                className="text-xs font-semibold text-[var(--color-primary)] hover:underline min-h-[44px] flex items-center"
              >
                Show All ({devices.length})
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              onClick={() => setSelectedBoxId('all')}
              aria-label="Show all vaults"
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 min-h-[44px] ${
                selectedBoxId === 'all'
                  ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] shadow-sm'
                  : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">dashboard</span>
              All Vaults ({devices.length})
            </button>

            {devices.map((d) => {
              const reading = latestReadings[d.device_id] || d.latest_reading;
              const isDoorOpen = reading?.door_status === 'OPEN';
              const isSelected = selectedBoxId === d.device_id;

              return (
                <button
                  key={d.device_id}
                  onClick={() => setSelectedBoxId(d.device_id)}
                  aria-label={`Select box ${d.nickname}`}
                  className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 min-h-[44px] ${
                    isSelected
                      ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] shadow-sm'
                      : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      isDoorOpen ? 'bg-red-500 animate-ping' : 'bg-emerald-500'
                    }`}
                  />
                  <span>{d.nickname}</span>
                  <span className="font-mono text-[10px] opacity-70">({d.device_id})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State if No Devices Registered */}
      {devices.length === 0 ? (
        <div className="card p-10 flex flex-col items-center text-center gap-4 border border-dashed border-[var(--color-outline-variant)]">
          <div className="w-20 h-20 rounded-full bg-[var(--color-primary-container)]/20 flex items-center justify-center text-[var(--color-primary)]">
            <span className="material-symbols-outlined text-4xl">inventory_2</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--color-on-surface)]">No FreshGuard Vaults Paired</h3>
            <p className="text-xs text-[var(--color-on-surface-variant)] max-w-sm mt-1">
              Connect your ESP32 autonomous storage chamber over Web Bluetooth to begin monitoring real-time ethylene, temperature, and relative humidity.
            </p>
          </div>
          <button
            onClick={() => navigate('/app/devices/pair')}
            aria-label="Pair your first vault"
            className="btn-primary py-3 px-6 rounded-full text-xs font-semibold flex items-center gap-2 mt-2 min-h-[44px]"
          >
            <span className="material-symbols-outlined text-base">bluetooth_searching</span>
            Pair Your First Vault
          </button>
        </div>
      ) : (
        /* Live Cards Per Box Driven by Socket.io */
        <div className="space-y-6">
          {activeFilteredDevices.map((device) => {
            const reading = latestReadings[device.device_id] || device.latest_reading;
            const isDoorOpen = reading?.door_status === 'OPEN';
            const chamberState = reading?.state || 'NORMAL';
            const vocPercent = reading?.gas_level != null ? Math.round((reading.gas_level / 1023) * 100) : null;

            return (
              <div
                key={device.device_id}
                className="card p-5 sm:p-6 transition-all hover:shadow-md border border-[var(--color-outline-variant)]/50 relative overflow-hidden"
              >
                {/* State Indicator Accent Line */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1.5 ${
                    isDoorOpen
                      ? 'bg-red-500'
                      : chamberState === 'WAIT_5_SECONDS'
                      ? 'bg-amber-500'
                      : chamberState === 'ALERT'
                      ? 'bg-orange-500'
                      : 'bg-emerald-500'
                  }`}
                />

                {/* Box Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface-container)] flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-2xl text-[var(--color-primary)]">
                        shelves
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-[var(--color-on-surface)]">{device.nickname}</h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]">
                          {device.device_id}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--color-on-surface-variant)] mt-0.5">
                        {reading
                          ? `Last ping: ${new Date(reading.created_at).toLocaleTimeString()}`
                          : 'Awaiting telemetry broadcast...'}
                      </p>
                    </div>
                  </div>

                  {/* Badges: Mode & Door Safety Status */}
                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                        isDoorOpen
                          ? 'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900'
                          : chamberState === 'WAIT_5_SECONDS'
                          ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isDoorOpen ? 'bg-red-500 animate-ping' : 'bg-emerald-500'
                        }`}
                      />
                      {isDoorOpen ? 'DOOR OPEN (HALTED)' : chamberState === 'WAIT_5_SECONDS' ? 'STABILIZING (5s)' : 'NORMAL SECURED'}
                    </span>

                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]">
                      {reading?.system_mode || 'AUTO'}
                    </span>
                  </div>
                </div>

                {/* 3 Botanical Gauges (Honoring Data Honesty Rules) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                  {/* Gauge 1: Temperature */}
                  <div className="p-4 rounded-2xl bg-[var(--color-surface-container-low)] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[var(--color-on-surface-variant)] flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm text-[var(--color-primary)]">thermostat</span>
                        Temperature
                      </span>
                      <span className="text-[10px] text-[var(--color-on-surface-variant)]">
                        Target: {formatTemp(device.thresholds.temp_min)}–{formatTemp(device.thresholds.temp_max)}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1 pt-1">
                      {reading?.dht_exists && reading.temperature != null ? (
                        <>
                          <span className="text-3xl font-black font-mono text-[var(--color-on-surface)]">
                            {formatTemp(reading.temperature)}
                          </span>
                        </>
                      ) : (
                        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-bold py-1">
                          <span className="material-symbols-outlined text-sm">sensors_off</span>
                          Sensor offline
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Gauge 2: Relative Humidity */}
                  <div className="p-4 rounded-2xl bg-[var(--color-surface-container-low)] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[var(--color-on-surface-variant)] flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm text-cyan-600">water_drop</span>
                        Rel. Humidity
                      </span>
                      <span className="text-[10px] text-[var(--color-on-surface-variant)]">
                        Target: {device.thresholds.humidity_min}–{device.thresholds.humidity_max}%
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1 pt-1">
                      {reading?.dht_exists && reading.humidity != null ? (
                        <>
                          <span className="text-3xl font-black font-mono text-[var(--color-on-surface)]">
                            {reading.humidity}
                          </span>
                          <span className="text-sm font-bold text-[var(--color-on-surface-variant)]">%</span>
                        </>
                      ) : (
                        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-bold py-1">
                          <span className="material-symbols-outlined text-sm">sensors_off</span>
                          Sensor offline
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Gauge 3: Ethylene / VOC Index (Honoring Rule 1: Never ppm) */}
                  <div className="p-4 rounded-2xl bg-[var(--color-surface-container-low)] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[var(--color-on-surface-variant)] flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm text-amber-500">science</span>
                        Ethylene / VOC Index
                      </span>
                      <span className="text-[10px] text-[var(--color-on-surface-variant)]">
                        Alert: &gt; {device.thresholds.gas_threshold}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1 pt-1">
                      {reading?.gas_exists && reading.gas_level != null ? (
                        <>
                          <span className="text-3xl font-black font-mono text-[var(--color-on-surface)]">
                            {reading.gas_level}
                          </span>
                          <span className="text-xs text-[var(--color-on-surface-variant)]">/1023</span>
                        </>
                      ) : (
                        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-bold py-1">
                          <span className="material-symbols-outlined text-sm">sensors_off</span>
                          Sensor offline
                        </div>
                      )}
                    </div>

                    {vocPercent != null && (
                      <div className="w-full bg-[var(--color-surface-container-high)] h-1.5 rounded-full overflow-hidden mt-2">
                        <div
                          className={`h-full transition-all ${
                            vocPercent > 40 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${vocPercent}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Actuator State Bar */}
                <div className="p-3 rounded-2xl bg-[var(--color-surface-container)] flex flex-wrap items-center justify-between gap-3 text-xs mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-[var(--color-on-surface-variant)]">Relays:</span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        reading?.inlet_fan === 'ON'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                      }`}
                    >
                      HEPA Inlet: {reading?.inlet_fan || 'OFF'}
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        reading?.outlet_fan === 'ON'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                      }`}
                    >
                      Scrubber Fan: {reading?.outlet_fan || 'OFF'}
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        reading?.humidifier === 'ON'
                          ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300'
                          : 'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]'
                      }`}
                    >
                      Mist: {reading?.humidifier || 'OFF'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-on-surface-variant)]">
                    <span className="material-symbols-outlined text-sm text-[var(--color-secondary)]">wifi</span>
                    Away — monitoring only
                  </div>
                </div>

                {/* Footer Action Bar */}
                <div className="flex items-center justify-between pt-2 border-t border-[var(--color-outline-variant)]/30">
                  <span className="text-[11px] text-[var(--color-on-surface-variant)]">
                    Mode: <strong>{reading?.system_mode || 'AUTO'}</strong>
                  </span>

                  <button
                    onClick={() => navigate(`/app/devices/${device.device_id}`)}
                    aria-label={`Open controls and 24-hour charts for ${device.nickname}`}
                    className="btn-secondary py-2 px-4 rounded-full text-xs font-semibold flex items-center gap-1.5 hover:bg-[var(--color-primary-container)] hover:text-[var(--color-on-primary-container)] transition-colors min-h-[44px]"
                  >
                    <span>24h Trends & Manual Relays</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
