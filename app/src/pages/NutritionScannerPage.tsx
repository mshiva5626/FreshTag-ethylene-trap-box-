import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeviceStore } from '../store/deviceStore';
import { useAuthStore } from '../store/authStore';
import { useDietStore } from '../store/dietStore';
import {
  analyzeProduceImage,
  analyzeProduceText,
  SpecimenData,
} from '../services/geminiNutrition';
import { getFruitRealImage } from '../utils/fruitImages';
import { FreshGuardLogo } from '../components/FreshGuardLogo';

const INITIAL_SPECIMENS: SpecimenData[] = [
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
    aiAnalysisNotes:
      'Pome fruit with moderate post-harvest ethylene surge. Catalytic potassium permanganate filtration prevents enzymatic cell wall softening.',
    source: 'preset',
  },
  {
    id: 'mango',
    name: 'Alphonso Mango',
    scientificName: 'Mangifera indica',
    emoji: '🥭',
    category: 'Climacteric Tropical',
    freshnessScore: 94,
    ripeness: 'Aromatic Tree-Ripe (Brix 18.0°)',
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
    keyNutrientHighlight: '67% Daily Vitamin C & Beta-Carotene Pro-Vitamin A',
    recommendedVaultTemp: 11.5,
    recommendedHumidity: 88.0,
    recommendedGasThreshold: 210,
    aiAnalysisNotes:
      'Chilling sensitive below 10°C. Maintaining chamber between 11-13°C prevents skin pitting while catalytic trap delays anthracnose softening.',
    source: 'preset',
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
    aiAnalysisNotes:
      'Intense burst of ethylene during ripening. Constant VOC scrubbing at index <180 locks in firm green condition for up to 3 weeks.',
    source: 'preset',
  },
  {
    id: 'tomato',
    name: 'Vine-Ripened Roma Tomato',
    scientificName: 'Solanum lycopersicum',
    emoji: '🍅',
    category: 'Climacteric Nightshade',
    freshnessScore: 98,
    ripeness: 'Bright Ruby Firm (Brix 5.2°)',
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
    aiAnalysisNotes:
      'Susceptible to chilling injury below 10°C causing mealy texture. Elevated temperature coupled with ethylene extraction sustains aromatic volatiles.',
    source: 'preset',
  },
  {
    id: 'dragonfruit',
    name: 'Red Pitaya / Dragon Fruit',
    scientificName: 'Selenicereus undatus',
    emoji: '🐉',
    category: 'Non-Climacteric Cactus Fruit',
    freshnessScore: 95,
    ripeness: 'Sweet Juicy (Brix 13.5°)',
    ethyleneOutput: '0.05 µL/kg·h (Very Low)',
    ambientShelfLife: '3–4 Days',
    vaultShelfLife: '18–24 Days',
    portionGrams: 100,
    calories: 60,
    protein_g: 1.2,
    fiber_g: 2.9,
    vitaminC_mg: 20.5,
    potassium_mg: 250,
    antioxidants: 1850,
    keyNutrientHighlight: 'Betalain Bioflavonoids & Prebiotic Dietary Fiber',
    recommendedVaultTemp: 8.0,
    recommendedHumidity: 85.0,
    recommendedGasThreshold: 190,
    aiAnalysisNotes:
      'Non-producer of ethylene, but highly sensitive to ambient ethylene from companion fruits which causes bract yellowing. Scrubber preserves scale greenness.',
    source: 'preset',
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
    aiAnalysisNotes:
      'High respiration soft fruit prone to Botrytis cinerea fungal mold. Cold vault storage at 1.0°C and 95% RH slows desiccation without condensation.',
    source: 'preset',
  },
];

export default function NutritionScannerPage() {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const { devices, updateThresholds } = useDeviceStore();
  const { logItem } = useDietStore();

  const [specimens, setSpecimens] = useState<SpecimenData[]>(INITIAL_SPECIMENS);
  const [selectedSpecimen, setSelectedSpecimen] = useState<SpecimenData>(INITIAL_SPECIMENS[0]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStepText, setScanStepText] = useState<string>('');
  const [selectedVaultId, setSelectedVaultId] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [scanFilterMode, setScanFilterMode] = useState<'optical' | 'spectrometry'>('optical');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [portionMultiplier, setPortionMultiplier] = useState<number>(1);

  // Camera & Image state
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedImagePreview, setCapturedImagePreview] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (devices.length > 0 && !selectedVaultId) {
      setSelectedVaultId(devices[0].device_id);
    }
  }, [devices, selectedVaultId]);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access not supported on this browser or connection');
      }

      // Try back/environment camera first for scanning produce
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
      setCapturedImagePreview(null);
    } catch (err: any) {
      console.error('Camera start failed:', err);
      setCameraError(err.message || 'Unable to access camera. Please allow camera permissions or upload a photo.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const handleCaptureSnapshot = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImagePreview(dataUrl);
    stopCamera();

    await runAiImageAnalysis(dataUrl);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    stopCamera();
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      setCapturedImagePreview(dataUrl);
      await runAiImageAnalysis(file);
    };
    reader.readAsDataURL(file);
  };

  const runAiImageAnalysis = async (fileOrDataUrl: File | string) => {
    setIsScanning(true);
    setScanStepText('Acquiring optical morphology & pigment spectrum...');

    const stepTimer1 = setTimeout(() => {
      setScanStepText('Analyzing specimen morphology & USDA Clinical FoodData...');
    }, 700);

    const stepTimer2 = setTimeout(() => {
      setScanStepText('Synthesizing respiration kinetics & chamber targets...');
    }, 1500);

    try {
      const result = await analyzeProduceImage(fileOrDataUrl, searchQuery || undefined);
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      // Prepend or update list
      setSpecimens((prev) => [result, ...prev.filter((p) => p.name.toLowerCase() !== result.name.toLowerCase())]);
      setSelectedSpecimen(result);
      setPortionMultiplier(1);
      setToastMessage(`Botanical AI identified ${result.name} (${result.freshnessScore}% Freshness Index)!`);
    } catch (err: any) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setToastMessage(`Analysis error: ${err.message}. Loaded calibrated horticultural profile.`);
    } finally {
      setIsScanning(false);
      setScanStepText('');
    }
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsScanning(true);
    setScanStepText(`Consulting Botanical AI for "${searchQuery.trim()}"...`);

    const stepTimer = setTimeout(() => {
      setScanStepText('Resolving USDA macronutrient profile & VOC thresholds...');
    }, 800);

    try {
      const result = await analyzeProduceText(searchQuery.trim());
      clearTimeout(stepTimer);

      setSpecimens((prev) => [result, ...prev.filter((p) => p.name.toLowerCase() !== result.name.toLowerCase())]);
      setSelectedSpecimen(result);
      setPortionMultiplier(1);
      setToastMessage(`Botanical AI analyzed ${result.name} successfully! 🌿`);
    } catch (err: any) {
      clearTimeout(stepTimer);
      setToastMessage(`Could not complete search: ${err.message}`);
    } finally {
      setIsScanning(false);
      setScanStepText('');
    }
  };

  const handleSpecimenSelect = (specimen: SpecimenData) => {
    setSelectedSpecimen(specimen);
    setPortionMultiplier(1);
    setCapturedImagePreview(specimen.imageUrl || null);
  };

  const handleStoreInVault = async () => {
    if (!selectedVaultId) {
      setToastMessage('Please select a FreshGuard chamber to target.');
      return;
    }
    if (!token) return;

    try {
      await updateThresholds(token, selectedVaultId, {
        temp_min: Math.max(0, Number((selectedSpecimen.recommendedVaultTemp - 1).toFixed(1))),
        temp_max: Number((selectedSpecimen.recommendedVaultTemp + 2).toFixed(1)),
        humidity_min: Math.max(60, Math.round(selectedSpecimen.recommendedHumidity - 5)),
        humidity_max: Math.min(99, Math.round(selectedSpecimen.recommendedHumidity + 3)),
        gas_threshold: selectedSpecimen.recommendedGasThreshold,
      });

      const vaultName = devices.find((d) => d.device_id === selectedVaultId)?.nickname || selectedVaultId;
      setToastMessage(`Prescription activated! ${vaultName} configured for ${selectedSpecimen.name}. Catalytic scrubbers engaged.`);
    } catch (err: any) {
      setToastMessage(`Error updating vault: ${err.message}`);
    }
  };

  const handleLogToDiet = () => {
    const scaledPortion = Math.round(selectedSpecimen.portionGrams * portionMultiplier);
    const scaledCalories = Math.round(selectedSpecimen.calories * portionMultiplier);
    const scaledVitaminC = Math.round(selectedSpecimen.vitaminC_mg * portionMultiplier);
    const scaledFiber = Number((selectedSpecimen.fiber_g * portionMultiplier).toFixed(1));
    const scaledPotassium = Math.round(selectedSpecimen.potassium_mg * portionMultiplier);
    const scaledAntioxidants = Math.round(selectedSpecimen.antioxidants * portionMultiplier);

    logItem({
      name: selectedSpecimen.name,
      emoji: selectedSpecimen.emoji,
      grams: scaledPortion,
      calories: scaledCalories,
      vitaminC_mg: scaledVitaminC,
      fiber_g: scaledFiber,
      potassium_mg: scaledPotassium,
      antioxidantScore: scaledAntioxidants,
      fromChamber: true,
    });

    setToastMessage(`Added +${scaledPortion}g ${selectedSpecimen.name} (${scaledCalories} kcal) to Daily Nutrient Tracker! 🥑`);
    setTimeout(() => {
      navigate('/app/diet');
    }, 1200);
  };

  // Scaled values based on portionMultiplier
  const currentPortionGrams = Math.round(selectedSpecimen.portionGrams * portionMultiplier);
  const currentCalories = Math.round(selectedSpecimen.calories * portionMultiplier);
  const currentVitaminC = Math.round(selectedSpecimen.vitaminC_mg * portionMultiplier);
  const currentFiber = Number((selectedSpecimen.fiber_g * portionMultiplier).toFixed(1));
  const currentPotassium = Math.round(selectedSpecimen.potassium_mg * portionMultiplier);
  const currentAntioxidants = Math.round(selectedSpecimen.antioxidants * portionMultiplier);

  return (
    <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto space-y-6">
      {/* ── Top Header with Warm Location & Spectrometry Pill ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <FreshGuardLogo size={44} className="shadow-xs" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-[#1e241c] leading-tight">
                Botanical Nutrition Scanner
              </h1>
              <span className="bg-[#ffede0] text-[#e66a26] text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider border border-[#fbd3b9]">
                Botanical AI Engine
              </span>
            </div>
            <p className="text-xs text-[#596155]">
              AI Optical Spectrometry, USDA FoodData & Ethylene Respiration Diagnostics
            </p>
          </div>
        </div>

        {/* Mode switch */}
        <div className="flex items-center self-start sm:self-auto p-1 bg-[#edf1e8] rounded-full text-xs font-semibold">
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

      {cameraError && (
        <div className="p-3.5 rounded-2xl bg-[#fde8e5] border border-[#ffb3aa] text-[#570f07] text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-[#c43828]">warning</span>
            <span>{cameraError}</span>
          </div>
          <button onClick={() => setCameraError(null)} className="text-[#c43828] hover:text-black font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {/* ── AI Botanical Search Bar ── */}
      <form onSubmit={handleSearchSubmit} className="relative">
        <div className="input-pill flex items-center gap-2 px-4 py-2.5">
          <span className="material-symbols-outlined text-lg text-[#778073]">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type any fruit or vegetable (e.g. Dragon Fruit, Mangosteen, Papaya, Fig)..."
            className="text-xs sm:text-sm font-medium"
            disabled={isScanning}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-[#778073] hover:text-black text-xs font-bold px-1"
            >
              ✕
            </button>
          )}
          <button
            type="submit"
            disabled={isScanning || !searchQuery.trim()}
            className="btn-terracotta px-4 py-1.5 text-xs font-bold rounded-full disabled:opacity-50 whitespace-nowrap"
          >
            {isScanning ? 'Analyzing...' : 'AI Analyze'}
          </button>
        </div>
      </form>

      {/* ── Camera Viewfinder Screen ── */}
      <div className="relative w-full rounded-3xl overflow-hidden border border-[#e1e7dc] bg-[#1a1f18] text-white shadow-xl min-h-[320px] sm:min-h-[400px] flex flex-col justify-between p-5">
        {/* Hidden Canvas for Frame Captures */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Hidden File Input for Image Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* Viewfinder Media Layer */}
        <div className="absolute inset-0 z-0 bg-black flex items-center justify-center overflow-hidden">
          {isCameraActive ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : capturedImagePreview ? (
            <img
              src={capturedImagePreview}
              alt={selectedSpecimen.name}
              className="w-full h-full object-cover opacity-90 transition-transform duration-700 hover:scale-105"
            />
          ) : (
            <img
              src="/assets/scanner_specimens.jpg"
              alt="Scanned botanical specimen"
              className="w-full h-full object-cover opacity-85 scale-105 transition-transform duration-700 hover:scale-100"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/60 pointer-events-none" />
        </div>

        {/* Laser Scanning Line */}
        {(isScanning || isCameraActive) && (
          <div className="absolute left-6 right-6 h-0.5 bg-gradient-to-r from-transparent via-[#f58a43] to-transparent shadow-[0_0_20px_#f58a43] animate-scan-laser pointer-events-none z-10" />
        )}

        {/* Viewfinder Reticle / Brackets */}
        <div className="absolute inset-6 sm:inset-12 border border-white/20 rounded-2xl pointer-events-none z-10">
          <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-[#f58a43] rounded-tl-sm" />
          <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-[#f58a43] rounded-tr-sm" />
          <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-[#f58a43] rounded-bl-sm" />
          <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-[#f58a43] rounded-br-sm" />

          {/* Center Target Crosshair */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 pointer-events-none flex items-center justify-center">
            <div className={`w-3 h-3 rounded-full bg-[#f58a43]/60 ${isScanning ? 'animate-ping' : ''}`} />
            <div className="w-1.5 h-1.5 rounded-full bg-[#f58a43]" />
          </div>
        </div>

        {/* Top Reticle Overlay: Status & Action Controls */}
        <div className="relative z-20 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/15">
            <span className={`w-2 h-2 rounded-full ${isScanning ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-pulse'}`} />
            <span className="text-[11px] font-semibold tracking-wide">
              {isScanning
                ? 'AI VISION PROCESSING...'
                : isCameraActive
                ? 'LIVE CAMERA ACTIVE'
                : 'OPTICAL BIO-SCANNER READY'}
            </span>
          </div>

          {/* Camera & Upload Controls */}
          <div className="flex items-center gap-1.5">
            {isCameraActive ? (
              <>
                <button
                  onClick={handleCaptureSnapshot}
                  disabled={isScanning}
                  className="bg-[#e66a26] text-white hover:bg-[#f58a43] px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-orange-600/30 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">photo_camera</span>
                  Capture & Analyze
                </button>
                <button
                  onClick={stopCamera}
                  className="bg-black/60 hover:bg-black/80 text-white/90 px-3 py-1.5 rounded-full text-xs font-medium border border-white/20 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={startCamera}
                  disabled={isScanning}
                  className="bg-white/90 hover:bg-white text-[#1e241c] px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm text-[#e66a26]">videocam</span>
                  Open Camera
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isScanning}
                  className="bg-black/60 hover:bg-black/80 text-white px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border border-white/20 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm text-emerald-400">upload</span>
                  Upload Photo
                </button>
              </>
            )}
          </div>
        </div>

        {/* Center Scanning HUD / Step Display */}
        {isScanning && (
          <div className="relative z-30 my-auto self-center bg-black/80 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20 text-center max-w-sm shadow-2xl animate-fade-in">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full border-2 border-t-[#e66a26] border-white/20 animate-spin flex items-center justify-center">
              <span className="text-sm">🔬</span>
            </div>
            <p className="text-xs font-bold text-white tracking-wide">{scanStepText}</p>
            <p className="text-[10px] text-white/60 mt-1">Calibrating USDA FoodData & ethylene kinetics</p>
          </div>
        )}

        {/* Bottom Reticle Identification Strip */}
        <div className="relative z-20 flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-9 h-9 rounded-xl overflow-hidden border-2 border-white/80 shadow-md shrink-0 bg-white/20">
                <img
                  src={selectedSpecimen.imageUrl || getFruitRealImage(selectedSpecimen.name)}
                  alt={selectedSpecimen.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="bg-[#e66a26] text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                {selectedSpecimen.category}
              </span>
              {selectedSpecimen.source && (
                <span className="bg-white/20 backdrop-blur-md text-white/90 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                  {selectedSpecimen.source === 'gemini-vision' ? '✨ Optical AI' : selectedSpecimen.source === 'gemini-text' ? '✨ Botanical AI' : 'Botanical Preset'}
                </span>
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight drop-shadow-md">
              {selectedSpecimen.name}
            </h2>
            <p className="text-xs text-white/80 italic font-serif">
              {selectedSpecimen.scientificName}
            </p>
          </div>

          {/* Freshness Badge */}
          <div className="bg-white/95 backdrop-blur-md text-[#1e241c] p-2.5 sm:p-3 rounded-2xl border border-white/30 flex items-center gap-3 shadow-lg self-start sm:self-auto">
            <div className="w-11 h-11 rounded-xl bg-[#e8f3e5] flex flex-col items-center justify-center text-[#3b6b32] font-black leading-none">
              <span className="text-base">{selectedSpecimen.freshnessScore}%</span>
              <span className="text-[8px] uppercase tracking-tighter text-[#3b6b32]/80 mt-0.5">Index</span>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-[#596155] leading-none">Freshness Rating</p>
              <p className="text-xs font-bold text-[#1e241c] mt-0.5 max-w-[180px] truncate">
                {selectedSpecimen.ripeness}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Produce Specimen Picker (Circular chips with Real Photos) ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-[#596155]">
            Quick Botanical Presets
          </p>
          <span className="text-[11px] text-[#596155]">Tap to inspect or capture custom photo above</span>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
          {specimens.map((specimen) => {
            const isSelected = selectedSpecimen.name === specimen.name;
            const photoUrl = specimen.imageUrl || getFruitRealImage(specimen.name);
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
                  className={`w-12 h-12 rounded-full overflow-hidden border-2 transition-all shrink-0 ${
                    isSelected ? 'border-[#e66a26] shadow-md scale-105' : 'border-white'
                  }`}
                >
                  <img
                    src={photoUrl}
                    alt={specimen.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/assets/fruits/apple.jpg';
                    }}
                  />
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

      {/* ── Specimen Nutritional Profile ── */}
      <div className="card-organic p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#eef2ea] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-[#1e241c]">Nutritional & Macro Composition</h3>
              <span className="text-xs bg-[#e8f3e5] text-[#3b6b32] font-bold px-2 py-0.5 rounded-full">
                USDA Calibrated
              </span>
            </div>
            <p className="text-xs text-[#596155] mt-0.5">
              Portion size: <strong className="text-[#1e241c]">{currentPortionGrams}g</strong> ({portionMultiplier}× standard serving)
            </p>
          </div>

          {/* Portion Scaler Quick Buttons */}
          <div className="flex items-center gap-1 bg-[#edf1e8] p-1 rounded-xl self-start sm:self-auto text-xs font-bold">
            <span className="text-[11px] text-[#596155] px-2">Portion:</span>
            {[0.5, 1, 1.5, 2].map((m) => (
              <button
                key={m}
                onClick={() => setPortionMultiplier(m)}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  portionMultiplier === m
                    ? 'bg-white text-[#e66a26] shadow-xs'
                    : 'text-[#596155] hover:text-[#1e241c]'
                }`}
              >
                {m}×
              </button>
            ))}
          </div>
        </div>

        {/* Clinical Highlight */}
        <div className="flex items-center gap-2 text-xs text-[#3b6b32] font-semibold bg-[#e8f3e5] px-3.5 py-2 rounded-2xl">
          <span className="material-symbols-outlined text-base">verified</span>
          <span>{selectedSpecimen.keyNutrientHighlight}</span>
        </div>

        {/* Macro Pill Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {/* Calories */}
          <div className="nutrient-pill">
            <span className="text-[11px] font-medium text-[#778073]">Energy</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-[#1e241c]">{currentCalories}</span>
              <span className="text-[11px] text-[#596155] font-semibold">kcal</span>
            </div>
            <div className="w-full bg-[#e2e8dd] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-[#f58a43] h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (currentCalories / 250) * 100)}%` }}
              />
            </div>
          </div>

          {/* Vitamin C */}
          <div className="nutrient-pill">
            <span className="text-[11px] font-medium text-[#778073]">Vitamin C</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-[#1e241c]">{currentVitaminC}</span>
              <span className="text-[11px] text-[#596155] font-semibold">mg</span>
            </div>
            <div className="w-full bg-[#e2e8dd] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-[#3b6b32] h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (currentVitaminC / 90) * 100)}%` }}
              />
            </div>
          </div>

          {/* Fiber */}
          <div className="nutrient-pill">
            <span className="text-[11px] font-medium text-[#778073]">Dietary Fiber</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-[#1e241c]">{currentFiber}</span>
              <span className="text-[11px] text-[#596155] font-semibold">g</span>
            </div>
            <div className="w-full bg-[#e2e8dd] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-[#528947] h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (currentFiber / 10) * 100)}%` }}
              />
            </div>
          </div>

          {/* Potassium */}
          <div className="nutrient-pill">
            <span className="text-[11px] font-medium text-[#778073]">Potassium</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-[#1e241c]">{currentPotassium}</span>
              <span className="text-[11px] text-[#596155] font-semibold">mg</span>
            </div>
            <div className="w-full bg-[#e2e8dd] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-[#e66a26] h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (currentPotassium / 600) * 100)}%` }}
              />
            </div>
          </div>

          {/* Antioxidant ORAC */}
          <div className="nutrient-pill col-span-2 sm:col-span-1">
            <span className="text-[11px] font-medium text-[#778073]">Antioxidants</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-[#1e241c]">{currentAntioxidants}</span>
              <span className="text-[11px] text-[#596155] font-semibold">ORAC</span>
            </div>
            <div className="w-full bg-[#e2e8dd] h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-purple-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (currentAntioxidants / 5000) * 100)}%` }}
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
              Scrubbing catalytic VOCs delays pectin breakdown and extends nutritional peak by up to 400%.
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
                <span className="text-[10px] text-[#7c2d00] block">Ideal Temp*</span>
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
            <p className="text-[10px] text-[#7c2d00]/80 italic pt-0.5">
              *Advisory baseline. Active chilling is not fitted; chamber passively tracks room ambient temperature.
            </p>
            <div className="text-[11px] text-[#7c2d00] pt-1 flex items-center justify-between">
              <span>Respiration Rate:</span>
              <span className="font-semibold">{selectedSpecimen.ethyleneOutput}</span>
            </div>
          </div>
        </div>

        {/* Post-Harvest AI Physiology Notes */}
        {selectedSpecimen.aiAnalysisNotes && (
          <div className="p-4 rounded-2xl bg-[#edf1e8] border border-[#dbe0d6] text-xs text-[#2b3129] space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-[#1e241c]">
              <span className="material-symbols-outlined text-sm text-[#3b6b32]">psychology</span>
              <span>Botanical Horticultural Intelligence</span>
            </div>
            <p className="text-[#596155] leading-relaxed">
              {selectedSpecimen.aiAnalysisNotes}
            </p>
          </div>
        )}

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
            Log to Diet (+{currentPortionGrams}g)
          </button>
        </div>
      </div>
    </div>
  );
}
