import { useState, useEffect } from 'react';
import { FRUIT_PRESETS, FruitPreset } from '../data/fruitPresets';
import { useDeviceStore } from '../store/deviceStore';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';

export default function FruitProfilesPage() {
  const { token } = useAuthStore();
  const { devices, fetchDevices, updateThresholds } = useDeviceStore();
  const { formatTemp } = useSettingsStore();

  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  const categories = ['All', 'Climacteric', 'Non-Climacteric', 'High-Respiration'];

  const filteredPresets = FRUIT_PRESETS.filter((p) => {
    if (selectedCategory === 'All') return true;
    return p.category === selectedCategory;
  });

  const handleApplyPreset = async (preset: FruitPreset) => {
    if (!selectedDevice) {
      setToastMessage('Please select a vault to apply this profile.');
      return;
    }
    if (!token) return;

    setApplyingId(preset.id);
    try {
      await updateThresholds(token, selectedDevice, {
        temp_min: preset.temp_min,
        temp_max: preset.temp_max,
        humidity_min: preset.humidity_min,
        humidity_max: preset.humidity_max,
        gas_threshold: preset.gas_threshold,
      });

      const devName = devices.find((d) => d.device_id === selectedDevice)?.nickname || selectedDevice;
      setToastMessage(
        `Applied "${preset.name}" preset to ${devName}! Temp: ${formatTemp(preset.temp_min)}–${formatTemp(preset.temp_max)}, RH: ${preset.humidity_min}–${preset.humidity_max}%, VOC Index < ${preset.gas_threshold}.`
      );
    } catch (err: any) {
      setToastMessage(`Failed to apply preset: ${err.message}`);
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="px-4 py-8 max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-on-surface)] flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500">nutrition</span>
            Botanical Fruit Profiles & Presets
          </h1>
          <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">
            Calibrated climate & catalytic VOC thresholds optimized to maximize harvest shelf-life
          </p>
        </div>

        {/* Target Vault Dropdown */}
        <div className="flex items-center gap-2 bg-[var(--color-surface-container)] px-3 py-1.5 rounded-2xl border border-[var(--color-outline-variant)]/40 self-start sm:self-auto">
          <span className="text-[11px] font-semibold text-[var(--color-on-surface-variant)]">Target Box:</span>
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

      {/* Confirmation Toast */}
      {toastMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between shadow-sm animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400">check_circle</span>
            <span className="font-medium">{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="hover:opacity-75">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2 text-xs">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-1.5 rounded-full font-semibold transition-all ${
              selectedCategory === cat
                ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] shadow-sm'
                : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Presets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredPresets.map((preset) => {
          const isApplying = applyingId === preset.id;

          return (
            <div
              key={preset.id}
              className="card p-5 flex flex-col justify-between gap-4 border border-[var(--color-outline-variant)]/40 hover:border-[var(--color-primary-container)] transition-all"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl p-2 rounded-2xl bg-[var(--color-surface-container)] flex items-center justify-center">
                      {preset.emoji}
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-[var(--color-on-surface)]">{preset.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]">
                          {preset.category}
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {preset.shelf_life_gain} Shelf-Life
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Storage Threshold Chips */}
                <div className="grid grid-cols-3 gap-2 my-3 p-3 rounded-xl bg-[var(--color-surface-container-low)] text-center text-xs">
                  <div>
                    <span className="text-[10px] text-[var(--color-on-surface-variant)] block font-medium">Temperature</span>
                    <span className="font-bold text-[var(--color-on-surface)]">{formatTemp(preset.temp_min)} – {formatTemp(preset.temp_max)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--color-on-surface-variant)] block font-medium">Rel. Humidity</span>
                    <span className="font-bold text-[var(--color-on-surface)]">{preset.humidity_min}–{preset.humidity_max}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--color-on-surface-variant)] block font-medium">Ethylene Alert</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">&lt; {preset.gas_threshold}</span>
                  </div>
                </div>

                <p className="text-[11px] text-[var(--color-on-surface-variant)] leading-relaxed">
                  {preset.tips}
                </p>
              </div>

              {/* Action Button */}
              <div className="pt-2 border-t border-[var(--color-outline-variant)]/30 flex items-center justify-between">
                <span className="text-[11px] text-[var(--color-on-surface-variant)]">
                  Sensitivity: <strong className="text-[var(--color-on-surface)]">{preset.ethylene_sensitivity}</strong>
                </span>

                <button
                  type="button"
                  disabled={isApplying || devices.length === 0}
                  onClick={() => handleApplyPreset(preset)}
                  className="btn-primary py-2 px-4 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">check</span>
                  {isApplying ? 'Applying...' : 'Apply to This Box'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
