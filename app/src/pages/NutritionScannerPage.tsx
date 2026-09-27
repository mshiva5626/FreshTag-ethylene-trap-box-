import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeviceStore } from '../store/deviceStore';
import { useAuthStore } from '../store/authStore';
import { useDietStore } from '../store/dietStore';
import { FRUIT_PRESETS } from '../data/fruitPresets';

interface SpecimenData {
  id: string;
  name: string;
  scientificName: string;
  emoji: string;
  category: string;
  freshnessScore: number;
  ripeness: string;
  ethyleneOutput: string;
  ambientShelfLife: string;
  vaultShelfLife: string;
  portionGrams: number;
  calories: number;
  protein_g: number;
  fiber_g: number;
  vitaminC_mg: number;
  potassium_mg: number;
  antioxidants: number;
  keyNutrientHighlight: string;
  recommendedVaultTemp: number;
  recommendedHumidity: number;
  recommendedGasThreshold: number;
}

const SPECIMENS: SpecimenData[] = [
  {
    id: 'apple',
    name: 'Honeycrisp Apple',
    scientificName: 'Malus domestica',
    emoji: '🍎',
    category: 'Climacteric Pome',
    freshnessScore: 97,
    ripeness: 'Firm Crisp (Brix 14.5°)',
    ethyleneOutput: '1.9 µL/kg·h (Moderate)',
    ambientShelfLife: '4–5 Days',
    vaultShelfLife: '21–28 Days',
    portionGrams: 180,
    calories: 95,
    protein_g: 0.5,
    fiber_g: 4.4,
    vitaminC_mg: 14,
    potassium_mg: 195,
    antioxidants: 2250,
    keyNutrientHighlight: 'High Soluble Pectin Fiber & Quercetin Flavonoids',
    recommendedVaultTemp: 3.0,
    recommendedHumidity: 90.0,
    recommendedGasThreshold: 190,
  },
  {
    id: 'mango',
    name: 'Alphonso Mango',
    scientificName: 'Mangifera indica',
    emoji: '🥭',
    category: 'Climacteric Tropical',
    freshnessScore: 94,
    ripeness: 'Aromatic Tree-Ripe',
    ethyleneOutput: '4.2 µL/kg·h (High Surge)',
    ambientShelfLife: '2–3 Days',
    vaultShelfLife: '12–15 Days',
    portionGrams: 165,
    calories: 99,
    protein_g: 1.4,
    fiber_g: 2.6,
    vitaminC_mg: 60,
    potassium_mg: 277,
    antioxidants: 3100,
    keyNutrientHighlight: '67% Daily Vitamin C & Beta-Carotene Vitamin A',
    recommendedVaultTemp: 11.5,
    recommendedHumidity: 88.0,
    recommendedGasThreshold: 210,
  },
  {
    id: 'avocado',
    name: 'Hass Avocado',
    scientificName: 'Persea americana',
    emoji: '🥑',
    category: 'Climacteric Berry',
    freshnessScore: 92,
    ripeness: 'Breaking Yielding Stage',
    ethyleneOutput: '3.1 µL/kg·h (Climacteric)',
    ambientShelfLife: '3 Days',
    vaultShelfLife: '14–18 Days',
    portionGrams: 150,
    calories: 240,
    protein_g: 3.0,
    fiber_g: 10.0,
    vitaminC_mg: 15,
    potassium_mg: 720,
    antioxidants: 1950,
    keyNutrientHighlight: 'Heart-Healthy Monounsaturated Fats & Folate',
    recommendedVaultTemp: 6.0,
    recommendedHumidity: 85.0,
    recommendedGasThreshold: 180,
  },
  {
    id: 'tomato',
    name: 'Vine-Ripened Roma Tomato',
    scientificName: 'Solanum lycopersicum',
    emoji: '🍅',
    category: 'Climacteric Nightshade',
    freshnessScore: 98,
    ripeness: 'Bright Ruby Firm',
    ethyleneOutput: '2.4 µL/kg·h (Moderate)',
    ambientShelfLife: '4 Days',
    vaultShelfLife: '16 Days',
    portionGrams: 125,
    calories: 22,
    protein_g: 1.1,
    fiber_g: 1.5,
    vitaminC_mg: 17,
    potassium_mg: 292,
    antioxidants: 2800,
    keyNutrientHighlight: 'Lycopene Carotenoids & Vascular Protection',
    recommendedVaultTemp: 13.0,
    recommendedHumidity: 88.0,
    recommendedGasThreshold: 240,
  },
  {
    id: 'kiwi',
    name: 'Golden Hayward Kiwi',
    scientificName: 'Actinidia deliciosa',
    emoji: '🥝',
    category: 'Climacteric Subtropical',
    freshnessScore: 95,
    ripeness: 'Sweet Juicy Peak',
    ethyleneOutput: '0.8 µL/kg·h (Sensitive)',
    ambientShelfLife: '4 Days',
    vaultShelfLife: '25 Days',
    portionGrams: 100,
    calories: 61,
    protein_g: 1.1,
    fiber_g: 3.0,
    vitaminC_mg: 92,
    potassium_mg: 312,
    antioxidants: 3400,
    keyNutrientHighlight: '102% Daily Vitamin C & Actinidin Enzymes',
    recommendedVaultTemp: 1.5,
    recommendedHumidity: 95.0,
    recommendedGasThreshold: 160,
  },
  {
    id: 'berries',
    name: 'Wild Alpine Strawberries',
    scientificName: 'Fragaria vesca',
    emoji: '🍓',
    category: 'Non-Climacteric Soft',
    freshnessScore: 91,
    ripeness: 'Fragrant Peak Harvest',
    ethyleneOutput: '0.2 µL/kg·h (Non-Producer)',
    ambientShelfLife: '2 Days',
    vaultShelfLife: '9–11 Days',
    portionGrams: 140,
    calories: 45,
    protein_g: 1.0,
    fiber_g: 2.8,
    vitaminC_mg: 82,
    potassium_mg: 214,
    antioxidants: 4800,
    keyNutrientHighlight: 'Anthocyanins & Ultra-High ORAC Antioxidants',
    recommendedVaultTemp: 1.0,
    recommendedHumidity: 95.0,
    recommendedGasThreshold: 150,
  },
];

export default function NutritionScannerPage() {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const { devices, updateThresholds } = useDeviceStore();
  const { logItem } = useDietStore();

  const [selectedSpecimen, setSelectedSpecimen] = useState<SpecimenData>(SPECIMENS[0]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [selectedVaultId, setSelectedVaultId] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [scanFilterMode, setScanFilterMode] = useState<'optical' | 'spectrometry'>('optical');

  useEffect(() => {
    if (devices.length > 0 && !selectedVaultId) {
      setSelectedVaultId(devices[0].device_id);
    }
  }, [devices, selectedVaultId]);

  const handleSpecimenSelect = (specimen: SpecimenData) => {
    setIsScanning(true);
    setSelectedSpecimen(specimen);
    setTimeout(() => {
      setIsScanning(false);
    }, 700);
  };

  const handleStoreInVault = async () => {
    if (!selectedVaultId) {
      setToastMessage('Please select a FreshGuard chamber to target.');
      return;
    }
    if (!token) return;

    try {
      await updateThresholds(token, selectedVaultId, {
        temp_min: selectedSpecimen.recommendedVaultTemp - 1,
        temp_max: selectedSpecimen.recommendedVaultTemp + 2,
        humidity_min: selectedSpecimen.recommendedHumidity - 5,
        humidity_max: selectedSpecimen.recommendedHumidity + 3,
        gas_threshold: selectedSpecimen.recommendedGasThreshold,
      });

      const vaultName = devices.find((d) => d.device_id === selectedVaultId)?.nickname || selectedVaultId;
      setToastMessage(`Prescription activated! ${vaultName} configured for ${selectedSpecimen.name}. Catalytic scrubbers engaged.`);
    } catch (err: any) {
      setToastMessage(`Error updating vault: ${err.message}`);
    }
  };

  const handleLogToDiet = () => {
    logItem({
      name: selectedSpecimen.name,
      emoji: selectedSpecimen.emoji,
      grams: selectedSpecimen.portionGrams,
      calories: selectedSpecimen.calories,
      vitaminC_mg: selectedSpecimen.vitaminC_mg,
      fiber_g: selectedSpecimen.fiber_g,
      potassium_mg: selectedSpecimen.potassium_mg,
      antioxidantScore: selectedSpecimen.antioxidants,
      fromChamber: true,
    });

    setToastMessage(`Added +${selectedSpecimen.portionGrams}g ${selectedSpecimen.name} to Daily Nutrient Completion! 🥑`);
    setTimeout(() => {
      navigate('/app/diet');
    }, 1200);
  };

  return (
    <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto space-y-6">
      {/* ── Top Header with Warm Location & Spectrometry Pill ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#fef2e9] border border-[#fbd3b9] flex items-center justify-center text-xl shadow-sm">
            📷
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#1e241c] leading-tight">
              Botanical Nutrition Scanner
            </h1>
            <p className="text-xs text-[#596155]">
              AI Optical Spectrometry & Ethylene Respiration Diagnostics
            </p>
          </div>
        </div>

        {/* Mode switch */}
        <div className="hidden sm:flex items-center p-1 bg-[#edf1e8] rounded-full text-xs font-semibold">
          <button
            onClick={() => setScanFilterMode('optical')}
            className={`px-3 py-1 rounded-full transition-all ${
              scanFilterMode === 'optical'
                ? 'bg-white text-[#1e241c] shadow-sm font-bold'
                : 'text-[#596155] hover:text-[#1e241c]'
            }`}
          >
            4K Optical
          </button>
          <button
            onClick={() => setScanFilterMode('spectrometry')}
            className={`px-3 py-1 rounded-full transition-all ${
              scanFilterMode === 'spectrometry'
                ? 'bg-white text-[#e66a26] shadow-sm font-bold'
                : 'text-[#596155] hover:text-[#1e241c]'
            }`}
          >
            VOC Gas Matrix
          </button>
        </div>
      </div>

      {/* ── Toast Notification ── */}
      {toastMessage && (
        <div className="p-3.5 rounded-2xl bg-[#e8f3e5] border border-[#bcdcb3] text-[#1b3e15] text-xs font-semibold flex items-center justify-between animate-fade-in shadow-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-[#3b6b32]">check_circle</span>
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-[#3b6b32] hover:text-black font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Camera Viewfinder Screen ── */}
      <div className="relative w-full rounded-3xl overflow-hidden border border-[#e1e7dc] bg-[#1a1f18] text-white shadow-xl min-h-[300px] sm:min-h-[380px] flex flex-col justify-between p-5">
        {/* Background Specimen Image */}
        <div className="absolute inset-0 z-0">
          <img
            src="/assets/scanner_specimens.jpg"
            alt="Scanned botanical specimen"
            className="w-full h-full object-cover opacity-85 scale-105 transition-transform duration-700 hover:scale-100"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/60 pointer-events-none" />
        </div>

        {/* Laser Scanning Line */}
        <div className="absolute left-6 right-6 h-0.5 bg-gradient-to-r from-transparent via-[#f58a43] to-transparent shadow-[0_0_15px_#f58a43] animate-scan-laser pointer-events-none z-10" />

        {/* Viewfinder Reticle / Brackets */}
        <div className="absolute inset-8 sm:inset-14 border border-white/20 rounded-2xl pointer-events-none z-10">
          {/* Top Left Bracket */}
          <div className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-[#f58a43] rounded-tl-sm" />
          {/* Top Right Bracket */}
          <div className="absolute -top-1 -right-1 w-5 h-5 border-t-2 border-r-2 border-[#f58a43] rounded-tr-sm" />
          {/* Bottom Left Bracket */}
          <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-2 border-l-2 border-[#f58a43] rounded-bl-sm" />
          {/* Bottom Right Bracket */}
          <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-[#f58a43] rounded-br-sm" />

          {/* Center Target Crosshair */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 pointer-events-none flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-[#f58a43]/60 animate-ping" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#f58a43]" />
          </div>
        </div>

        {/* Top Reticle Overlay */}
        <div className="relative z-20 flex items-center justify-between">
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/15">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-semibold tracking-wide">
              LIVE SPECTRUM • 99.4% OPTICAL CONFIDENCE
            </span>
          </div>

          <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/15 text-[11px] font-medium text-amber-300">
            {scanFilterMode === 'optical' ? 'Visual Phenotype' : 'C₂H₄ Ethylene Sensor'}
          </div>
        </div>

        {/* Bottom Reticle Identification Strip */}
        <div className="relative z-20 flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{selectedSpecimen.emoji}</span>
              <span className="bg-[#e66a26] text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                {selectedSpecimen.category}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight drop-shadow-md">
              {selectedSpecimen.name}
            </h2>
            <p className="text-xs text-white/70 italic font-serif">
              {selectedSpecimen.scientificName}
            </p>
          </div>

          {/* Freshness Badge */}
          <div className="bg-white/95 backdrop-blur-md text-[#1e241c] p-2.5 sm:p-3 rounded-2xl border border-white/30 flex items-center gap-3 shadow-lg self-start sm:self-auto">
            <div className="w-10 h-10 rounded-xl bg-[#e8f3e5] flex items-center justify-center text-[#3b6b32] font-black text-sm">
              {selectedSpecimen.freshnessScore}%
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-[#596155] leading-none">Freshness Index</p>
              <p className="text-xs font-bold text-[#1e241c] mt-0.5">{selectedSpecimen.ripeness}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Produce Specimen Picker (Circular chips like reference) ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-[#596155]">
            Select or Capture Specimen
          </p>
          <span className="text-[11px] text-[#596155]">Tap fruit to simulate instant scan</span>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
          {SPECIMENS.map((specimen) => {
            const isSelected = selectedSpecimen.id === specimen.id;
            return (
              <button
                key={specimen.id}
                onClick={() => handleSpecimenSelect(specimen)}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl transition-all cursor-pointer min-w-[76px] ${
                  isSelected
                    ? 'bg-white border-2 border-[#e66a26] shadow-md transform -translate-y-0.5'
                    : 'bg-[#f4f7f1] border border-transparent hover:bg-white hover:border-[#e1e7dc]'
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl transition-colors ${
                    isSelected ? 'bg-[#ffede0]' : 'bg-[#eef3eb]'
                  }`}
                >
                  {specimen.emoji}
                </div>
                <span
                  className={`text-[11px] font-semibold whitespace-nowrap ${
                    isSelected ? 'text-[#e66a26] font-bold' : 'text-[#1e241c]'
                  }`}
                >
                  {specimen.name.split(' ')[0]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Specimen Nutritional Profile (Dribbble pill style) ── */}
      <div className="card-organic p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#eef2ea] pb-4">
          <div>
            <h3 className="text-lg font-bold text-[#1e241c]">Nutritional & Macro Composition</h3>
            <p className="text-xs text-[#596155]">
              Analyzed for 1 standard serving ({selectedSpecimen.portionGrams}g)
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[#3b6b32] font-semibold bg-[#e8f3e5] px-3 py-1.5 rounded-full self-start sm:self-auto">
            <span className="material-symbols-outlined text-sm">verified</span>
            {selectedSpecimen.keyNutrientHighlight}
          </div>
        </div>

        {/* Macro Pill Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {/* Calories */}
          <div className="nutrient-pill">
            <span className="text-[11px] font-medium text-[#778073]">Energy</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-[#1e241c]">{selectedSpecimen.calories}</span>
              <span className="text-[11px] text-[#596155] font-semibold">kcal</span>
            </div>
            <div className="w-full bg-[#e2e8dd] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-[#f58a43] h-full rounded-full"
                style={{ width: `${Math.min(100, (selectedSpecimen.calories / 250) * 100)}%` }}
              />
            </div>
          </div>

          {/* Vitamin C */}
          <div className="nutrient-pill">
            <span className="text-[11px] font-medium text-[#778073]">Vitamin C</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-[#1e241c]">{selectedSpecimen.vitaminC_mg}</span>
              <span className="text-[11px] text-[#596155] font-semibold">mg</span>
            </div>
            <div className="w-full bg-[#e2e8dd] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-[#3b6b32] h-full rounded-full"
                style={{ width: `${Math.min(100, (selectedSpecimen.vitaminC_mg / 90) * 100)}%` }}
              />
            </div>
          </div>

          {/* Fiber */}
          <div className="nutrient-pill">
            <span className="text-[11px] font-medium text-[#778073]">Dietary Fiber</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-[#1e241c]">{selectedSpecimen.fiber_g}</span>
              <span className="text-[11px] text-[#596155] font-semibold">gram</span>
            </div>
            <div className="w-full bg-[#e2e8dd] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-[#528947] h-full rounded-full"
                style={{ width: `${Math.min(100, (selectedSpecimen.fiber_g / 10) * 100)}%` }}
              />
            </div>
          </div>

          {/* Potassium */}
          <div className="nutrient-pill">
            <span className="text-[11px] font-medium text-[#778073]">Potassium</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-[#1e241c]">{selectedSpecimen.potassium_mg}</span>
              <span className="text-[11px] text-[#596155] font-semibold">mg</span>
            </div>
            <div className="w-full bg-[#e2e8dd] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-[#e66a26] h-full rounded-full"
                style={{ width: `${Math.min(100, (selectedSpecimen.potassium_mg / 600) * 100)}%` }}
              />
            </div>
          </div>

          {/* Antioxidant ORAC */}
          <div className="nutrient-pill col-span-2 sm:col-span-1">
            <span className="text-[11px] font-medium text-[#778073]">Antioxidants</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-[#1e241c]">{selectedSpecimen.antioxidants}</span>
              <span className="text-[11px] text-[#596155] font-semibold">ORAC</span>
            </div>
            <div className="w-full bg-[#e2e8dd] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-purple-500 h-full rounded-full"
                style={{ width: `${Math.min(100, (selectedSpecimen.antioxidants / 5000) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* ── Shelf Life & Catalytic Prescription ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Ambient vs FreshGuard Chamber */}
          <div className="p-4 rounded-2xl bg-[#f7faf4] border border-[#e1e7dc] space-y-2">
            <p className="text-xs font-bold text-[#1e241c] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base text-[#e66a26]">hourglass_bottom</span>
              Shelf-Life Extension Model
            </p>
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-[#596155]">Standard Kitchen Counter:</span>
              <span className="font-bold text-[#c43828]">{selectedSpecimen.ambientShelfLife}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#3b6b32] font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                FreshGuard Ethylene Trap:
              </span>
              <span className="font-extrabold text-[#3b6b32]">{selectedSpecimen.vaultShelfLife}</span>
            </div>
            <p className="text-[11px] text-[#778073] pt-1">
              Scrubbing catalytic VOCs delays softening and prevents sugar depletion by 400%.
            </p>
          </div>

          {/* Chamber Climate Prescription */}
          <div className="p-4 rounded-2xl bg-[#fff8f2] border border-[#fbd3b9] space-y-2">
            <p className="text-xs font-bold text-[#7c2d00] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base text-[#e66a26]">tune</span>
              Target Preservation Prescription
            </p>
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="bg-white/80 p-1.5 rounded-xl border border-[#fbd3b9]/50">
                <span className="text-[10px] text-[#7c2d00] block">Temp</span>
                <span className="text-xs font-bold text-[#1e241c]">{selectedSpecimen.recommendedVaultTemp}°C</span>
              </div>
              <div className="bg-white/80 p-1.5 rounded-xl border border-[#fbd3b9]/50">
                <span className="text-[10px] text-[#7c2d00] block">RH</span>
                <span className="text-xs font-bold text-[#1e241c]">{selectedSpecimen.recommendedHumidity}%</span>
              </div>
              <div className="bg-white/80 p-1.5 rounded-xl border border-[#fbd3b9]/50">
                <span className="text-[10px] text-[#7c2d00] block">VOC Limit</span>
                <span className="text-xs font-bold text-[#1e241c]">&lt;{selectedSpecimen.recommendedGasThreshold}</span>
              </div>
            </div>
            <div className="text-[11px] text-[#7c2d00] pt-1 flex items-center justify-between">
              <span>Respiration:</span>
              <span className="font-semibold">{selectedSpecimen.ethyleneOutput}</span>
            </div>
          </div>
        </div>

        {/* ── Action Buttons ── */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-3">
          {/* Target Vault selector */}
          {devices.length > 0 && (
            <div className="w-full sm:w-auto flex items-center gap-2 bg-[#edf1e8] px-3.5 py-2.5 rounded-full border border-[#e1e7dc]">
              <span className="text-xs font-semibold text-[#596155] whitespace-nowrap">Target Chamber:</span>
              <select
                value={selectedVaultId}
                onChange={(e) => setSelectedVaultId(e.target.value)}
                className="bg-transparent text-xs font-bold text-[#1e241c] focus:outline-none cursor-pointer"
              >
                {devices.map((d) => (
                  <option key={d.device_id} value={d.device_id}>
                    {d.nickname}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleStoreInVault}
            className="btn-terracotta w-full sm:flex-1 py-3.5 px-6 rounded-full text-sm font-bold flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">inventory_2</span>
            Store in Chamber & Apply Climate
          </button>

          <button
            onClick={handleLogToDiet}
            className="btn-sage w-full sm:w-auto py-3.5 px-5 rounded-full text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-lg">restaurant</span>
            Log to Diet (+{selectedSpecimen.portionGrams}g)
          </button>
        </div>
      </div>
    </div>
  );
}
