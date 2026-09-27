import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useDeviceStore } from '../store/deviceStore';

export default function AutomationPage() {
  const { token } = useAuthStore();
  const { devices, fetchDevices, updateThresholds } = useDeviceStore();

  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form thresholds
  const [tempMin, setTempMin] = useState(1.0);
  const [tempMax, setTempMax] = useState(4.0);
  const [humMin, setHumMin] = useState(90.0);
  const [humMax, setHumMax] = useState(95.0);
  const [gasThreshold, setGasThreshold] = useState(230);
  const [granuleInterval, setGranuleInterval] = useState(30);
  const [nickname, setNickname] = useState('Primary Vault Alpha');

  // Filter maintenance state
  const [filterReplacedDate, setFilterReplacedDate] = useState<string>(new Date().toISOString());

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

  const activeDevice = devices.find((d) => d.device_id === selectedDevice);

  useEffect(() => {
    if (activeDevice) {
      setTempMin(activeDevice.thresholds.temp_min);
      setTempMax(activeDevice.thresholds.temp_max);
      setHumMin(activeDevice.thresholds.humidity_min);
      setHumMax(activeDevice.thresholds.humidity_max);
      setGasThreshold(activeDevice.thresholds.gas_threshold);
      setNickname(activeDevice.nickname);
      if (activeDevice.granule_interval_days) {
        setGranuleInterval(activeDevice.granule_interval_days);
      }
      if (activeDevice.granule_last_replaced) {
        setFilterReplacedDate(activeDevice.granule_last_replaced);
      }
    }
  }, [activeDevice]);

  const handleSaveAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedDevice) return;

    setSaving(true);
    setFeedback(null);

    try {
      await updateThresholds(token, selectedDevice, {
        temp_min: tempMin,
        temp_max: tempMax,
        humidity_min: humMin,
        humidity_max: humMax,
        gas_threshold: gasThreshold,
        granule_interval_days: granuleInterval,
        granule_last_replaced: filterReplacedDate,
        nickname,
      });

      setFeedback(`Automation thresholds and granule schedule saved for ${nickname} (${selectedDevice}).`);
    } catch (err: any) {
      setFeedback(`Error saving settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetGranules = async () => {
    const nowIso = new Date().toISOString();
    setFilterReplacedDate(nowIso);
    if (token && selectedDevice) {
      try {
        await updateThresholds(token, selectedDevice, {
          granule_last_replaced: nowIso,
          granule_interval_days: granuleInterval,
        });
      } catch (e) {
        console.warn('Could not persist reset granules timer:', e);
      }
    }
    setFeedback('Granule service timer reset to day 0. Next reminder in ' + granuleInterval + ' days.');
  };

  const daysSinceReplaced = Math.floor(
    (Date.now() - new Date(filterReplacedDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  const percentGranuleLife = Math.max(0, Math.min(100, Math.round((daysSinceReplaced / granuleInterval) * 100)));

  return (
    <div className="px-4 py-8 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-on-surface)] flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--color-primary)]">auto_awesome</span>
            Chamber Automation Settings
          </h1>
          <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">
            Configure automated climate control loops, fan purges, and consumable maintenance reminders
          </p>
        </div>

        {/* Device Dropdown */}
        <div className="flex items-center gap-2 bg-[var(--color-surface-container)] px-3 py-1.5 rounded-2xl border border-[var(--color-outline-variant)]/40 self-start sm:self-auto">
          <span className="text-[11px] font-semibold text-[var(--color-on-surface-variant)]">Box:</span>
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
      </div>

      {feedback && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            <span>{feedback}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="hover:opacity-75">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      <form onSubmit={handleSaveAutomation} className="space-y-6">
        {/* Section 1: Temperature & Climate Boundaries */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--color-outline-variant)]/30">
            <span className="material-symbols-outlined text-xl text-[var(--color-primary)]">thermostat</span>
            <div>
              <h3 className="text-sm font-bold text-[var(--color-on-surface)]">Temperature Control Loop</h3>
              <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                Autonomous cooling and HEPA fresh air intake triggers when temperature exceeds maximum bound.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                Minimum Temperature Threshold (°C)
              </label>
              <input
                type="number"
                step="0.1"
                value={tempMin}
                onChange={(e) => setTempMin(parseFloat(e.target.value))}
                className="input-field w-full text-sm font-bold"
                required
              />
              <span className="text-[10px] text-[var(--color-on-surface-variant)] mt-1 block">
                Lower bound before cold air circulation halts.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                Maximum Temperature Threshold (°C)
              </label>
              <input
                type="number"
                step="0.1"
                value={tempMax}
                onChange={(e) => setTempMax(parseFloat(e.target.value))}
                className="input-field w-full text-sm font-bold"
                required
              />
              <span className="text-[10px] text-[var(--color-on-surface-variant)] mt-1 block">
                Triggers Inlet (GPIO 16) & Scrubber (GPIO 17) fans for circulation.
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Relative Humidity & Mist Control */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--color-outline-variant)]/30">
            <span className="material-symbols-outlined text-xl text-cyan-600">water_drop</span>
            <div>
              <h3 className="text-sm font-bold text-[var(--color-on-surface)]">Ultrasonic Humidity Automation</h3>
              <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                1.7MHz ultrasonic atomizer (Relay 3 / GPIO 5) engages when moisture drops below target.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                Minimum Humidity Bound (%)
              </label>
              <input
                type="number"
                value={humMin}
                onChange={(e) => setHumMin(parseFloat(e.target.value))}
                className="input-field w-full text-sm font-bold"
                required
              />
              <span className="text-[10px] text-[var(--color-on-surface-variant)] mt-1 block">
                Atomizer turns ON below this level to prevent fruit shrivel.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                Maximum Humidity Bound (%)
              </label>
              <input
                type="number"
                value={humMax}
                onChange={(e) => setHumMax(parseFloat(e.target.value))}
                className="input-field w-full text-sm font-bold"
                required
              />
              <span className="text-[10px] text-[var(--color-on-surface-variant)] mt-1 block">
                Atomizer halts above this level to prevent condensation.
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Ethylene Scrubbing & VOC Threshold */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--color-outline-variant)]/30">
            <span className="material-symbols-outlined text-xl text-amber-500">science</span>
            <div>
              <h3 className="text-sm font-bold text-[var(--color-on-surface)]">Ethylene Catalytic Purge Trigger</h3>
              <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                When relative gas index exceeds threshold, outlet purge fan cycles actively until baseline is restored.
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-[var(--color-on-surface)]">
                Ethylene / VOC Index Alert Threshold (0–1023)
              </label>
              <span className="text-xs font-bold text-amber-600 font-mono">{gasThreshold}</span>
            </div>
            <input
              type="range"
              min="50"
              max="600"
              step="5"
              value={gasThreshold}
              onChange={(e) => setGasThreshold(parseInt(e.target.value, 10))}
              className="w-full accent-[var(--color-primary)] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[var(--color-on-surface-variant)] mt-1">
              <span>Ultra-sensitive (50)</span>
              <span>Default (230)</span>
              <span>Tolerant (600)</span>
            </div>
          </div>
        </div>

        {/* Section 4: Granule Replacement Reminder */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--color-outline-variant)]/30">
            <span className="material-symbols-outlined text-xl text-purple-600">hourglass_top</span>
            <div>
              <h3 className="text-sm font-bold text-[var(--color-on-surface)]">Catalytic Granule Replacement Schedule</h3>
              <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                Configurable reminder interval for replacing potassium permanganate absorption beads.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div>
              <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                Reminder Interval (Days)
              </label>
              <select
                value={granuleInterval}
                onChange={(e) => setGranuleInterval(parseInt(e.target.value, 10))}
                className="input-field w-full text-sm font-bold"
              >
                <option value={15}>Every 15 Days (High Ethylene Crops)</option>
                <option value={30}>Every 30 Days (Standard Botanical)</option>
                <option value={45}>Every 45 Days (Low Respiration)</option>
                <option value={60}>Every 60 Days (Extended)</option>
              </select>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--color-surface-container)] space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--color-on-surface-variant)]">Media Age:</span>
                <span className="font-bold text-[var(--color-on-surface)]">{daysSinceReplaced} days elapsed</span>
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--color-surface-container-high)] overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    percentGranuleLife > 90 ? 'bg-red-500' : percentGranuleLife > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(percentGranuleLife, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-[var(--color-on-surface-variant)] block">
                {granuleInterval - daysSinceReplaced > 0
                  ? `${granuleInterval - daysSinceReplaced} days remaining until filter check`
                  : 'Replacement due now!'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetGranules}
            className="text-xs font-semibold text-[var(--color-primary)] hover:underline flex items-center gap-1.5 pt-1"
          >
            <span className="material-symbols-outlined text-sm">restart_alt</span>
            Reset Granule Timer (I have replaced the filter media)
          </button>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving || devices.length === 0}
            className="btn-primary py-3 px-8 text-sm font-semibold rounded-full flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">save</span>
            {saving ? 'Saving...' : 'Save Automation Rules'}
          </button>
        </div>
      </form>
    </div>
  );
}
