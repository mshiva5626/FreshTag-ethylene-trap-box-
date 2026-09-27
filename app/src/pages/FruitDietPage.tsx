import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDietStore, ConsumedItem } from '../store/dietStore';
import { useDeviceStore } from '../store/deviceStore';

const QUICK_FRUITS = [
  { name: 'Honeycrisp Apple', emoji: '🍎', grams: 180, cal: 95, vitC: 14, fiber: 4.4, pot: 195, orac: 2250 },
  { name: 'Alphonso Mango', emoji: '🥭', grams: 165, cal: 99, vitC: 60, fiber: 2.6, pot: 277, orac: 3100 },
  { name: 'Hass Avocado', emoji: '🥑', grams: 150, cal: 240, vitC: 15, fiber: 10.0, pot: 720, orac: 1950 },
  { name: 'Golden Kiwi', emoji: '🥝', grams: 100, cal: 61, vitC: 92, fiber: 3.0, pot: 312, orac: 3400 },
  { name: 'Wild Strawberries', emoji: '🍓', grams: 140, cal: 45, vitC: 82, fiber: 2.8, pot: 214, orac: 4800 },
  { name: 'Vine Roma Tomato', emoji: '🍅', grams: 125, cal: 22, vitC: 17, fiber: 1.5, pot: 292, orac: 2800 },
  { name: 'Cavendish Banana', emoji: '🍌', grams: 120, cal: 105, vitC: 10, fiber: 3.1, pot: 422, orac: 1200 },
];

export default function FruitDietPage() {
  const navigate = useNavigate();
  const { goals, logs, streakDays, logItem, removeLog, resetToday } = useDietStore();
  const { devices } = useDeviceStore();

  const [customFruitName, setCustomFruitName] = useState('');
  const [customGrams, setCustomGrams] = useState<number>(100);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Aggregated totals
  const totalGrams = logs.reduce((sum, item) => sum + item.grams, 0);
  const totalCalories = logs.reduce((sum, item) => sum + item.calories, 0);
  const totalVitC = logs.reduce((sum, item) => sum + item.vitaminC_mg, 0);
  const totalFiber = logs.reduce((sum, item) => sum + item.fiber_g, 0);
  const totalPotassium = logs.reduce((sum, item) => sum + item.potassium_mg, 0);
  const totalAntioxidants = logs.reduce((sum, item) => sum + item.antioxidantScore, 0);

  const producePercent = Math.min(100, Math.round((totalGrams / goals.produceGrams) * 100));
  const vitCPercent = Math.min(100, Math.round((totalVitC / goals.vitaminC_mg) * 100));
  const fiberPercent = Math.min(100, Math.round((totalFiber / goals.fiber_g) * 100));
  const potassiumPercent = Math.min(100, Math.round((totalPotassium / goals.potassium_mg) * 100));
  const antioxidantPercent = Math.min(100, Math.round((totalAntioxidants / goals.antioxidants) * 100));

  const handleQuickAdd = (fruit: typeof QUICK_FRUITS[0]) => {
    logItem({
      name: fruit.name,
      emoji: fruit.emoji,
      grams: fruit.grams,
      calories: fruit.cal,
      vitaminC_mg: fruit.vitC,
      fiber_g: fruit.fiber,
      potassium_mg: fruit.pot,
      antioxidantScore: fruit.orac,
      fromChamber: true,
    });
    setToastMessage(`Logged ${fruit.name} (+${fruit.grams}g produce)! 🌿`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFruitName) return;

    // Approximate metrics based on grams
    const factor = customGrams / 100;
    logItem({
      name: customFruitName,
      emoji: '🥗',
      grams: customGrams,
      calories: Math.round(50 * factor),
      vitaminC_mg: Math.round(25 * factor),
      fiber_g: Number((2.5 * factor).toFixed(1)),
      potassium_mg: Math.round(200 * factor),
      antioxidantScore: Math.round(1500 * factor),
      fromChamber: false,
    });

    setCustomFruitName('');
    setShowCustomModal(false);
    setToastMessage(`Logged ${customGrams}g ${customFruitName}! ✨`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // SVG Circular Ring Parameters
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (producePercent / 100) * circumference;

  return (
    <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto space-y-6">
      {/* ── Top Header with Streak Counter ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🥑</span>
            <span className="text-xs font-bold text-[#e66a26] uppercase tracking-wider bg-[#ffede0] px-2.5 py-0.5 rounded-full">
              Harvest Wellness
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1e241c] tracking-tight">
            Fruit Diet & Nutrient Completion
          </h1>
          <p className="text-xs text-[#596155] mt-0.5">
            Synchronized with FreshGuard storage chambers for optimal bioactive bioavailability
          </p>
        </div>

        {/* Streak & Reset */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-[#e1e7dc] shadow-sm">
            <span className="text-2xl">🔥</span>
            <div>
              <p className="text-xs font-extrabold text-[#1e241c] leading-tight">{streakDays} Day Streak</p>
              <p className="text-[10px] text-[#596155]">Daily Habit Active</p>
            </div>
          </div>

          <button
            onClick={() => navigate('/app/scanner')}
            className="btn-terracotta py-2 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            <span className="material-symbols-outlined text-base">center_focus_strong</span>
            Scan Produce
          </button>
        </div>
      </div>

      {/* ── Toast Notification ── */}
      {toastMessage && (
        <div className="p-3.5 rounded-2xl bg-[#e8f3e5] border border-[#bcdcb3] text-[#1b3e15] text-xs font-semibold flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-[#3b6b32]">check_circle</span>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-[#3b6b32] font-bold">
            ✕
          </button>
        </div>
      )}

      {/* ── Chamber-to-Table Smart Rescue Alert ── */}
      <div className="relative overflow-hidden card-organic p-5 bg-gradient-to-r from-[#fff9f3] to-[#fbfef9] border border-[#fbd3b9] space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#ffede0] flex items-center justify-center text-xl">
              🥝
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-[#e66a26] text-white px-2 py-0.5 rounded-md">
                  Chamber Alert
                </span>
                <span className="text-xs font-semibold text-[#596155]">Optimal Brix Ripeness</span>
              </div>
              <h3 className="text-sm font-bold text-[#1e241c] mt-0.5">
                Golden Kiwi & Mango at Peak Sugar in Vault
              </h3>
            </div>
          </div>

          <span className="text-xs font-semibold text-[#3b6b32] bg-[#e8f3e5] px-2.5 py-1 rounded-full whitespace-nowrap">
            +92mg Vit C
          </span>
        </div>

        <p className="text-xs text-[#596155] leading-relaxed">
          {devices.length > 0 ? devices[0].nickname : 'FreshGuard Vault #1'} reports that stored Golden Kiwis have achieved maximum ascorbic acid concentration. Consuming 1 Kiwi now hits <strong>100% of your Vitamin C target</strong> and frees chamber capacity before ethylene surges!
        </p>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => handleQuickAdd(QUICK_FRUITS[3])} // Kiwi
            className="btn-terracotta py-2 px-4 rounded-full text-xs font-bold flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">restaurant</span>
            Consume 1 Kiwi from Chamber
          </button>
          <button
            onClick={() => navigate('/app/fruits')}
            className="text-xs font-semibold text-[#596155] hover:text-[#1e241c] underline"
          >
            View Chamber Presets
          </button>
        </div>
      </div>

      {/* ── Hero Daily Completion Rings Card ── */}
      <div className="card-organic p-6 space-y-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Main SVG Circular Ring */}
          <div className="relative flex items-center justify-center">
            <svg className="w-44 h-44 transform -rotate-90">
              {/* Background track */}
              <circle
                cx="88"
                cy="88"
                r={radius}
                className="text-[#edf1e8]"
                strokeWidth="14"
                stroke="currentColor"
                fill="transparent"
              />
              {/* Animated Progress track */}
              <circle
                cx="88"
                cy="88"
                r={radius}
                className="text-[#e66a26] transition-all duration-1000 ease-out"
                strokeWidth="14"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
              />
            </svg>

            {/* Inner Ring Text */}
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-black text-[#1e241c] leading-tight">
                {producePercent}%
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#596155]">
                {totalGrams} / {goals.produceGrams}g
              </span>
              <span className="text-[10px] text-[#778073]">WHO Produce Goal</span>
            </div>
          </div>

          {/* Right Column: 4 Key Micronutrient Progress Bars */}
          <div className="flex-1 w-full space-y-3.5">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-[#1e241c] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#3b6b32]" />
                  Vitamin C
                </span>
                <span className="text-[#596155] font-semibold">
                  {totalVitC} / {goals.vitaminC_mg} mg ({vitCPercent}%)
                </span>
              </div>
              <div className="w-full bg-[#edf1e8] h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#3b6b32] h-full rounded-full transition-all duration-700"
                  style={{ width: `${vitCPercent}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-[#1e241c] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#528947]" />
                  Dietary Fiber
                </span>
                <span className="text-[#596155] font-semibold">
                  {totalFiber.toFixed(1)} / {goals.fiber_g} g ({fiberPercent}%)
                </span>
              </div>
              <div className="w-full bg-[#edf1e8] h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#528947] h-full rounded-full transition-all duration-700"
                  style={{ width: `${fiberPercent}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-[#1e241c] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#f58a43]" />
                  Potassium & Electrolytes
                </span>
                <span className="text-[#596155] font-semibold">
                  {totalPotassium} / {goals.potassium_mg} mg ({potassiumPercent}%)
                </span>
              </div>
              <div className="w-full bg-[#edf1e8] h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#f58a43] h-full rounded-full transition-all duration-700"
                  style={{ width: `${potassiumPercent}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-[#1e241c] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  Antioxidant ORAC Index
                </span>
                <span className="text-[#596155] font-semibold">
                  {totalAntioxidants} / {goals.antioxidants} ORAC ({antioxidantPercent}%)
                </span>
              </div>
              <div className="w-full bg-[#edf1e8] h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-purple-500 h-full rounded-full transition-all duration-700"
                  style={{ width: `${antioxidantPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Macro Nutrient Summary Chips (Dribbble pill style) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[#edf1e8]">
          <div className="nutrient-pill">
            <span className="text-[11px] font-medium text-[#778073]">Total Produce</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-[#1e241c]">{totalGrams}</span>
              <span className="text-[11px] text-[#596155] font-semibold">gram</span>
            </div>
          </div>

          <div className="nutrient-pill">
            <span className="text-[11px] font-medium text-[#778073]">Harvest Calories</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-[#1e241c]">{totalCalories}</span>
              <span className="text-[11px] text-[#596155] font-semibold">kcal</span>
            </div>
          </div>

          <div className="nutrient-pill">
            <span className="text-[11px] font-medium text-[#778073]">Active Vitamin C</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-[#1e241c]">{totalVitC}</span>
              <span className="text-[11px] text-[#596155] font-semibold">mg</span>
            </div>
          </div>

          <div className="nutrient-pill">
            <span className="text-[11px] font-medium text-[#778073]">Items Logged</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-[#1e241c]">{logs.length}</span>
              <span className="text-[11px] text-[#596155] font-semibold">portions</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Harvest Logger (One-Tap Produce Cards) ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[#1e241c]">Quick Log Produce</h3>
            <p className="text-xs text-[#596155]">Tap any fresh specimen to record intake</p>
          </div>

          <button
            onClick={() => setShowCustomModal(true)}
            className="text-xs font-bold text-[#e66a26] hover:underline flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">add_circle</span>
            Custom Grams
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK_FRUITS.map((fruit) => (
            <button
              key={fruit.name}
              onClick={() => handleQuickAdd(fruit)}
              className="card-organic p-3.5 flex items-center justify-between text-left hover:border-[#f58a43] transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-2xl group-hover:scale-110 transition-transform">
                  {fruit.emoji}
                </span>
                <div>
                  <p className="text-xs font-bold text-[#1e241c] leading-tight truncate max-w-[90px]">
                    {fruit.name}
                  </p>
                  <p className="text-[10px] text-[#778073]">+{fruit.grams}g • {fruit.cal} kcal</p>
                </div>
              </div>

              <div className="w-7 h-7 rounded-full bg-[#f4f7f1] group-hover:bg-[#ffede0] flex items-center justify-center text-[#596155] group-hover:text-[#e66a26] transition-colors">
                <span className="material-symbols-outlined text-base">add</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Custom Portion Modal ── */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card-organic bg-white p-6 max-w-sm w-full space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-[#edf1e8] pb-3">
              <h4 className="text-base font-bold text-[#1e241c]">Log Custom Produce</h4>
              <button onClick={() => setShowCustomModal(false)} className="text-[#596155] hover:text-black">
                ✕
              </button>
            </div>

            <form onSubmit={handleCustomSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#596155] block mb-1">
                  Produce Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Blueberries, Pomegranate..."
                  value={customFruitName}
                  onChange={(e) => setCustomFruitName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-[#e1e7dc] text-sm focus:outline-none focus:border-[#e66a26]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#596155] block mb-1">
                  Portion Weight (Grams)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    value={customGrams}
                    onChange={(e) => setCustomGrams(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-[#e1e7dc] text-sm focus:outline-none focus:border-[#e66a26]"
                  />
                  <span className="text-xs font-bold text-[#596155]">grams</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="btn-secondary flex-1 py-2 text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-terracotta flex-1 py-2 text-xs">
                  Save to Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Today's Harvest Log (Activity List) ── */}
      <div className="card-organic p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-[#edf1e8] pb-3">
          <div>
            <h3 className="text-base font-bold text-[#1e241c]">Today's Harvest Log</h3>
            <p className="text-xs text-[#596155]">{logs.length} entries recorded today</p>
          </div>

          {logs.length > 0 && (
            <button
              onClick={resetToday}
              className="text-xs font-semibold text-[#c43828] hover:underline"
            >
              Clear Today's Log
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-8 text-[#778073] space-y-2">
            <span className="text-3xl">🧺</span>
            <p className="text-xs">No produce logged yet today.</p>
            <p className="text-[11px]">Tap any fruit above or scan with the camera to start!</p>
          </div>
        ) : (
          <div className="divide-y divide-[#edf1e8]">
            {logs.map((log) => (
              <div key={log.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{log.emoji}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-[#1e241c]">{log.name}</p>
                      {log.fromChamber && (
                        <span className="text-[9px] font-semibold bg-[#e8f3e5] text-[#3b6b32] px-1.5 py-0.5 rounded">
                          Chamber Fresh
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#596155]">
                      {log.grams}g • {log.calories} kcal • {log.vitaminC_mg}mg Vit C • {log.timestamp}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => removeLog(log.id)}
                  className="p-1.5 rounded-lg text-[#778073] hover:text-[#c43828] hover:bg-[#fde8e5] transition-colors"
                  title="Remove entry"
                >
                  <span className="material-symbols-outlined text-base">delete</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
