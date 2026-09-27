import { useState, useEffect } from 'react';
import { FRUIT_PRESETS, FruitPreset } from '../data/fruitPresets';
import { useDeviceStore } from '../store/deviceStore';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { getFruitRealImage } from '../utils/fruitImages';
import { generateGemmaFruitPreset } from '../services/openrouterGemma';

const CUSTOM_PRESETS_KEY = 'freshguard_custom_fruit_presets';

export default function FruitProfilesPage() {
  const { token } = useAuthStore();
  const { devices, fetchDevices, updateThresholds } = useDeviceStore();
  const { formatTemp } = useSettingsStore();

  const [allPresets, setAllPresets] = useState<FruitPreset[]>(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_PRESETS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return [...parsed, ...FRUIT_PRESETS];
      }
    } catch (e) {
      console.warn('Failed to load custom presets from localStorage', e);
    }
    return FRUIT_PRESETS;
  });

  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Gemma 4 31B Preset Management State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [newFruitName, setNewFruitName] = useState<string>('');
  const [gemmaStatus, setGemmaStatus] = useState<string>('');

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

  const categories = ['All', 'Climacteric', 'Non-Climacteric', 'High-Respiration', 'Custom AI'];

  const filteredPresets = allPresets.filter((p) => {
    if (selectedCategory === 'All') return true;
    if (selectedCategory === 'Custom AI') return p.id.includes('custom') || p.id.includes('-');
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

  const handleGeneratePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFruitName.trim()) return;

    setIsGenerating(true);
    setGemmaStatus('Consulting Google Gemma 4 31B on OpenRouter...');

    try {
      const generated = await generateGemmaFruitPreset(newFruitName.trim());
      setGemmaStatus('Synthesizing post-harvest respiration & gas thresholds...');

      // Save custom preset
      const updated = [generated, ...allPresets];
      setAllPresets(updated);

      try {
        const customOnly = updated.filter((p) => !FRUIT_PRESETS.some((fp) => fp.id === p.id));
        localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customOnly));
      } catch (err) {
        console.warn('Could not save custom preset to localStorage', err);
      }

      setNewFruitName('');
      setToastMessage(`Google Gemma 4 31B synthesized new botanical preset for "${generated.name}"! ✨`);
    } catch (err: any) {
      console.error('Failed to generate preset:', err);
      setToastMessage(`Gemma 4 31B generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
      setGemmaStatus('');
    }
  };

  const handleDeletePreset = (id: string, name: string) => {
    const updated = allPresets.filter((p) => p.id !== id);
    setAllPresets(updated);
    try {
      const customOnly = updated.filter((p) => !FRUIT_PRESETS.some((fp) => fp.id === p.id));
      localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customOnly));
    } catch (err) {
      console.warn('Could not update localStorage', err);
    }
    setToastMessage(`Removed custom preset "${name}".`);
  };

  return (
    <div className="px-4 py-8 max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-[#ffede0] text-[#e66a26] text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-[#fbd3b9]">
              Google Gemma 4 31B Powered
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1e241c] flex items-center gap-2">
            Botanical Fruit Profiles & Presets
          </h1>
          <p className="text-xs text-[#596155] mt-0.5">
            Calibrated climate & catalytic VOC thresholds optimized with real botanical photography
          </p>
        </div>

        {/* Target Vault Dropdown */}
        <div className="flex items-center gap-2 bg-[#edf1e8] px-3.5 py-2 rounded-2xl border border-[#e1e7dc] self-start sm:self-auto">
          <span className="text-[11px] font-bold text-[#596155]">Target Vault:</span>
          {devices.length === 0 ? (
            <span className="text-xs text-[#778073]">No vaults paired</span>
          ) : (
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="bg-transparent text-xs font-bold text-[#1e241c] focus:outline-none cursor-pointer"
            >
              {devices.map((d) => (
                <option key={d.device_id} value={d.device_id} className="bg-white text-[#1e241c]">
                  {d.nickname} ({d.device_id})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Confirmation Toast */}
      {toastMessage && (
        <div className="p-4 rounded-2xl bg-[#e8f3e5] border border-[#bcdcb3] text-xs text-[#1b3e15] flex items-center justify-between shadow-sm animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[#3b6b32]">check_circle</span>
            <span className="font-semibold">{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="hover:opacity-75 font-bold">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* ── Botanical Preset Management Form with Gemma 4 31B ── */}
      <div className="card-organic p-5 bg-gradient-to-br from-[#ffffff] to-[#fbf7f2] border border-[#fbd3b9] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-[#1e241c] flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#e66a26] animate-pulse" />
              AI Botanical Preset Synthesizer
            </h2>
            <p className="text-[11px] text-[#596155]">
              Generate empirical vault storage setpoints for any unlisted fruit or crop using Google Gemma 4 31B
            </p>
          </div>
          <span className="text-[10px] font-bold text-[#7c2d00] bg-[#ffe0cb] px-2.5 py-1 rounded-full self-start sm:self-auto">
            OpenRouter Gemma-4-31B
          </span>
        </div>

        <form onSubmit={handleGeneratePreset} className="flex flex-col sm:flex-row gap-2 pt-1">
          <div className="input-pill flex-1 flex items-center gap-2 px-3 py-2 bg-white">
            <span className="material-symbols-outlined text-base text-[#778073]">science</span>
            <input
              type="text"
              value={newFruitName}
              onChange={(e) => setNewFruitName(e.target.value)}
              placeholder="Enter fruit or vegetable (e.g. Passion Fruit, Guava, Fig, Cherries)..."
              disabled={isGenerating}
              className="text-xs font-semibold"
            />
          </div>
          <button
            type="submit"
            disabled={isGenerating || !newFruitName.trim()}
            className="btn-terracotta px-5 py-2.5 rounded-full text-xs font-bold disabled:opacity-50 whitespace-nowrap shadow-sm cursor-pointer"
          >
            {isGenerating ? 'Synthesizing...' : 'Generate Preset with Gemma'}
          </button>
        </form>

        {isGenerating && (
          <div className="flex items-center gap-2 text-xs font-medium text-[#e66a26] bg-[#ffede0] p-2.5 rounded-xl animate-pulse">
            <span className="material-symbols-outlined text-base animate-spin">refresh</span>
            <span>{gemmaStatus}</span>
          </div>
        )}
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2 text-xs">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-1.5 rounded-full font-semibold transition-all cursor-pointer ${
              selectedCategory === cat
                ? 'bg-[#ffede0] text-[#e66a26] font-bold shadow-xs'
                : 'bg-[#edf1e8] text-[#596155] hover:bg-[#e4e9df]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Presets Grid with Real Photographic Logos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredPresets.map((preset) => {
          const isApplying = applyingId === preset.id;
          const isCustom = !FRUIT_PRESETS.some((fp) => fp.id === preset.id);
          const realPhoto = preset.realImageUrl || getFruitRealImage(preset.name);

          return (
            <div
              key={preset.id}
              className="card-organic p-5 flex flex-col justify-between gap-4 border border-[#e1e7dc] hover:border-[#f58a43] transition-all group"
            >
              <div>
                {/* Header with Real Fruit Picture Logo */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3.5">
                    {/* Real Fruit Picture Logo */}
                    <div className="relative w-14 h-14 rounded-2xl overflow-hidden border-2 border-white shadow-md bg-[#edf1e8] shrink-0 group-hover:scale-105 transition-transform">
                      <img
                        src={realPhoto}
                        alt={preset.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/assets/fruits/apple.jpg';
                        }}
                      />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-[#1e241c] leading-tight group-hover:text-[#e66a26] transition-colors">
                        {preset.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#edf1e8] text-[#596155]">
                          {preset.category}
                        </span>
                        <span className="text-[11px] font-bold text-[#3b6b32]">
                          {preset.shelf_life_gain} Gain
                        </span>
                        {isCustom && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#ffe0cb] text-[#7c2d00]">
                            Gemma 4 31B
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isCustom && (
                    <button
                      onClick={() => handleDeletePreset(preset.id, preset.name)}
                      className="text-[#778073] hover:text-[#c43828] text-xs font-bold p-1 rounded-md"
                      title="Remove custom preset"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Storage Threshold Chips */}
                <div className="grid grid-cols-3 gap-2 my-3 p-3 rounded-2xl bg-[#f7faf4] border border-[#e1e7dc] text-center text-xs">
                  <div>
                    <span className="text-[10px] text-[#596155] block font-medium">Temperature</span>
                    <span className="font-extrabold text-[#1e241c]">
                      {formatTemp(preset.temp_min)} – {formatTemp(preset.temp_max)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#596155] block font-medium">Rel. Humidity</span>
                    <span className="font-extrabold text-[#1e241c]">
                      {preset.humidity_min}–{preset.humidity_max}%
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#596155] block font-medium">VOC Threshold</span>
                    <span className="font-extrabold text-[#e66a26]">&lt; {preset.gas_threshold}</span>
                  </div>
                </div>

                <p className="text-[11px] text-[#596155] leading-relaxed">
                  {preset.tips}
                </p>
              </div>

              {/* Action Button & Respiration Info */}
              <div className="pt-3 border-t border-[#eef2ea] flex items-center justify-between gap-2">
                <div className="text-[11px] text-[#596155]">
                  <span>Sensitivity: </span>
                  <strong className="text-[#1e241c]">{preset.ethylene_sensitivity}</strong>
                </div>

                <button
                  type="button"
                  disabled={isApplying || devices.length === 0}
                  onClick={() => handleApplyPreset(preset)}
                  className="btn-terracotta py-2 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
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
