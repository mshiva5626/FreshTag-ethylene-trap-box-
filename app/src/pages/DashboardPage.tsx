import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useDeviceStore } from '../store/deviceStore';
import { useSettingsStore } from '../store/settingsStore';
import { useDietStore } from '../store/dietStore';
import { initSocket } from '../utils/socket';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  const { devices, latestReadings, fetchDevices, handleTelemetryUpdate } = useDeviceStore();
  const { formatTemp } = useSettingsStore();
  const { goals, logs, streakDays } = useDietStore();

  const [selectedBoxId, setSelectedBoxId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

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

  const totalGramsLogged = logs.reduce((sum, item) => sum + item.grams, 0);
  const producePercent = Math.min(100, Math.round((totalGramsLogged / goals.produceGrams) * 100));

  return (
    <div className="px-4 py-6 lg:px-8 max-w-5xl mx-auto space-y-7">
      {/* ── Greeting Bar & Quick Location (from reference Screen 2) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-[#e66a26] bg-[#ffede0] px-3 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#e66a26] animate-pulse" />
              Chamber System Online
            </span>
            <span className="text-xs text-[#596155]">• {streakDays}d Fresh Streak 🔥</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1e241c] tracking-tight">
            Good {getTimeOfDay()}, {user?.name?.split(' ')[0] ?? 'Botanist'} 🌿
          </h2>
          <p className="text-xs text-[#596155] mt-0.5">
            {devices.length === 0
              ? 'Pair your FreshGuard Chamber to initiate ethylene trapping.'
              : `Managing ${devices.length} active botanical storage ${devices.length === 1 ? 'chamber' : 'chambers'}`}
          </p>
        </div>

        {/* Top Quick Actions */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={() => navigate('/app/scanner')}
            className="btn-terracotta py-2.5 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            <span className="material-symbols-outlined text-base">center_focus_strong</span>
            Scan Produce
          </button>

          <button
            onClick={() => navigate('/app/devices/pair')}
            className="btn-secondary py-2.5 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-xs"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Add Chamber
          </button>
        </div>
      </div>

      {/* ── Hero Harvest Banner (Dribbble Screen 1 & 2 inspired) ── */}
      <div className="relative rounded-3xl overflow-hidden shadow-xl bg-gradient-to-r from-[#21351e] to-[#121c10] text-white min-h-[220px] sm:min-h-[240px] flex flex-col justify-between p-6 sm:p-8">
        {/* Background Image with warm gradient overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src="/assets/fresh_produce_hero.jpg"
            alt="Fresh Organic Produce"
            className="w-full h-full object-cover opacity-35 sm:opacity-45 scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-transparent pointer-events-none" />
        </div>

        {/* Top Badges */}
        <div className="relative z-10 flex flex-wrap items-center gap-2">
          <span className="bg-[#e66a26] text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
            100% Quality Guaranteed
          </span>
          <span className="bg-white/20 backdrop-blur-md text-white text-[10px] font-semibold px-2.5 py-1 rounded-full">
            Autonomous Catalytic Ethylene Scrub
          </span>
        </div>

        {/* Main Banner Headline & Stats */}
        <div className="relative z-10 max-w-lg space-y-2 my-2">
          <h3 className="text-xl sm:text-3xl font-extrabold tracking-tight drop-shadow-sm text-white">
            Fresh Produce Preserved to Perfection.
          </h3>
          <p className="text-xs text-white/80 leading-relaxed max-w-md">
            Continuously scrubbing catalytic ethylene (C₂H₄) gas to extend botanical shelf-life up to 400% without chemicals.
          </p>
        </div>

        {/* Bottom Banner Actions & Pill stats */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-3">
            <div className="bg-white/15 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-white/20">
              <span className="text-[10px] text-white/70 block leading-tight">Diet Progress</span>
              <span className="text-sm font-extrabold text-amber-300">
                {producePercent}% <span className="text-[10px] font-normal text-white">({totalGramsLogged}g)</span>
              </span>
            </div>

            <div className="bg-white/15 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-white/20">
              <span className="text-[10px] text-white/70 block leading-tight">Chamber Safety</span>
              <span className="text-sm font-extrabold text-emerald-300">Active Interlock</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/app/diet')}
              className="bg-white text-[#1e241c] hover:bg-[#edf1e8] text-xs font-bold py-2 px-4 rounded-full transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span>View Fruit Diet</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Circular Category Chips (Exact match with Dribbble Screen 2) ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#596155]">
            Botanical Categories & Tools
          </span>
          <span className="text-[11px] text-[#596155]">Quick navigation</span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {/* Chip 1: Fruit Stock */}
          <button
            onClick={() => {
              setSelectedCategory('fruit');
              navigate('/app/fruits');
            }}
            className="card-organic p-3 flex flex-col items-center gap-1.5 text-center hover:border-[#f58a43] transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-[#ffede0] group-hover:bg-[#fbd3b9] flex items-center justify-center text-2xl transition-colors shadow-xs">
              🍎
            </div>
            <span className="text-xs font-bold text-[#1e241c]">Fruit Profiles</span>
          </button>

          {/* Chip 2: Nutrition Scanner */}
          <button
            onClick={() => navigate('/app/scanner')}
            className="card-organic p-3 flex flex-col items-center gap-1.5 text-center hover:border-[#f58a43] transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-[#e8f3e5] group-hover:bg-[#bcdcb3] flex items-center justify-center text-2xl transition-colors shadow-xs">
              📷
            </div>
            <span className="text-xs font-bold text-[#1e241c]">AI Scanner</span>
          </button>

          {/* Chip 3: Nutrient Diet */}
          <button
            onClick={() => navigate('/app/diet')}
            className="card-organic p-3 flex flex-col items-center gap-1.5 text-center hover:border-[#f58a43] transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-[#fef2e9] group-hover:bg-[#fbd3b9] flex items-center justify-center text-2xl transition-colors shadow-xs">
              🥑
            </div>
            <span className="text-xs font-bold text-[#1e241c]">Fruit Diet</span>
          </button>

          {/* Chip 4: Vault Chambers */}
          <button
            onClick={() => navigate('/app/devices')}
            className="card-organic p-3 flex flex-col items-center gap-1.5 text-center hover:border-[#f58a43] transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-[#edf1e8] group-hover:bg-[#dbe0d6] flex items-center justify-center text-2xl transition-colors shadow-xs">
              📦
            </div>
            <span className="text-xs font-bold text-[#1e241c]">Chambers</span>
          </button>

          {/* Chip 5: Automation */}
          <button
            onClick={() => navigate('/app/automation')}
            className="card-organic p-3 flex flex-col items-center gap-1.5 text-center hover:border-[#f58a43] transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-[#f1f4f0] group-hover:bg-[#e4e9df] flex items-center justify-center text-2xl transition-colors shadow-xs">
              ⚙️
            </div>
            <span className="text-xs font-bold text-[#1e241c]">Scrubbers</span>
          </button>

          {/* Chip 6: Analytics */}
          <button
            onClick={() => navigate('/app/analytics')}
            className="card-organic p-3 flex flex-col items-center gap-1.5 text-center hover:border-[#f58a43] transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-[#fff4eb] group-hover:bg-[#ffe3cf] flex items-center justify-center text-2xl transition-colors shadow-xs">
              📊
            </div>
            <span className="text-xs font-bold text-[#1e241c]">Analytics</span>
          </button>
        </div>
      </div>

      {/* ── Multi-Box Switcher Tab Bar ── */}
      {devices.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#596155] uppercase tracking-wider">
              Select Storage Chamber
            </span>
            {selectedBoxId !== 'all' && (
              <button
                onClick={() => setSelectedBoxId('all')}
                className="text-xs font-semibold text-[#e66a26] hover:underline"
              >
                Show All ({devices.length})
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedBoxId('all')}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                selectedBoxId === 'all'
                  ? 'bg-[#ffede0] text-[#e66a26] border border-[#fbd3b9] shadow-sm'
                  : 'bg-white text-[#596155] border border-[#e1e7dc] hover:bg-[#edf1e8]'
              }`}
            >
              <span className="material-symbols-outlined text-sm">dashboard</span>
              All Chambers ({devices.length})
            </button>

            {devices.map((d) => {
              const reading = latestReadings[d.device_id] || d.latest_reading;
              const isDoorOpen = reading?.door_status === 'OPEN';
              const isSelected = selectedBoxId === d.device_id;

              return (
                <button
                  key={d.device_id}
                  onClick={() => setSelectedBoxId(d.device_id)}
                  className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                    isSelected
                      ? 'bg-[#ffede0] text-[#e66a26] border border-[#fbd3b9] shadow-sm'
                      : 'bg-white text-[#596155] border border-[#e1e7dc] hover:bg-[#edf1e8]'
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
        <div className="card-organic p-10 flex flex-col items-center text-center gap-4 border border-dashed border-[#cbd4c5]">
          <div className="w-20 h-20 rounded-3xl bg-[#ffede0] flex items-center justify-center text-[#e66a26] text-3xl">
            📦
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#1e241c]">No FreshGuard Chambers Paired</h3>
            <p className="text-xs text-[#596155] max-w-sm mt-1 leading-relaxed">
              Pair your ESP32 autonomous botanical chamber via Bluetooth or Wi-Fi to monitor real-time ethylene scrubbing, relative humidity, and temperature.
            </p>
          </div>
          <button
            onClick={() => navigate('/app/devices/pair')}
            className="btn-terracotta py-3 px-6 rounded-full text-xs font-bold flex items-center gap-2 mt-2"
          >
            <span className="material-symbols-outlined text-base">bluetooth_searching</span>
            Pair Your First Chamber
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
                className="card-organic p-6 relative overflow-hidden space-y-5"
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#ffede0] flex items-center justify-center flex-shrink-0 text-2xl shadow-xs">
                      🌿
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-extrabold text-[#1e241c]">{device.nickname}</h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#edf1e8] text-[#596155]">
                          {device.device_id}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#596155] mt-0.5">
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
                          ? 'bg-red-50 text-red-700 border-red-300'
                          : chamberState === 'WAIT_5_SECONDS'
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isDoorOpen ? 'bg-red-500 animate-ping' : 'bg-emerald-500'
                        }`}
                      />
                      {isDoorOpen ? 'DOOR OPEN (SAFETY INTERLOCK)' : chamberState === 'WAIT_5_SECONDS' ? 'STABILIZING (5s)' : 'NORMAL SECURED'}
                    </span>

                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#edf1e8] text-[#596155]">
                      {reading?.system_mode || 'AUTO'}
                    </span>
                  </div>
                </div>

                {/* 3 Botanical Gauges (Honoring Data Honesty Rules) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Gauge 1: Temperature */}
                  <div className="nutrient-pill p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[#596155] flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm text-[#e66a26]">thermostat</span>
                        Chamber Temp
                      </span>
                      <span className="text-[10px] text-[#778073]">
                        Target: {formatTemp(device.thresholds.temp_min)}–{formatTemp(device.thresholds.temp_max)}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1 pt-1">
                      {reading?.dht_exists && reading.temperature != null ? (
                        <span className="text-3xl font-black font-mono text-[#1e241c]">
                          {formatTemp(reading.temperature)}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1 text-amber-600 text-xs font-bold py-1">
                          <span className="material-symbols-outlined text-sm">sensors_off</span>
                          Sensor offline
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Gauge 2: Relative Humidity */}
                  <div className="nutrient-pill p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[#596155] flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm text-[#3b6b32]">water_drop</span>
                        Relative Humidity
                      </span>
                      <span className="text-[10px] text-[#778073]">
                        Target: {device.thresholds.humidity_min}–{device.thresholds.humidity_max}%
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1 pt-1">
                      {reading?.dht_exists && reading.humidity != null ? (
                        <>
                          <span className="text-3xl font-black font-mono text-[#1e241c]">
                            {reading.humidity}
                          </span>
                          <span className="text-sm font-bold text-[#596155]">%</span>
                        </>
                      ) : (
                        <div className="flex items-center gap-1 text-amber-600 text-xs font-bold py-1">
                          <span className="material-symbols-outlined text-sm">sensors_off</span>
                          Sensor offline
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Gauge 3: Ethylene / VOC Index (Honoring Rule 1: Never ppm) */}
                  <div className="nutrient-pill p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[#596155] flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm text-amber-600">science</span>
                        Ethylene / VOC Index
                      </span>
                      <span className="text-[10px] text-[#778073]">
                        Alert: &gt; {device.thresholds.gas_threshold}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1 pt-1">
                      {reading?.gas_exists && reading.gas_level != null ? (
                        <>
                          <span className="text-3xl font-black font-mono text-[#1e241c]">
                            {reading.gas_level}
                          </span>
                          <span className="text-xs text-[#596155]">/1023</span>
                        </>
                      ) : (
                        <div className="flex items-center gap-1 text-amber-600 text-xs font-bold py-1">
                          <span className="material-symbols-outlined text-sm">sensors_off</span>
                          Sensor offline
                        </div>
                      )}
                    </div>

                    {vocPercent != null && (
                      <div className="w-full bg-[#e1e7dc] h-1.5 rounded-full overflow-hidden mt-2">
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
                <div className="p-3.5 rounded-2xl bg-[#f7faf4] border border-[#e1e7dc] flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-[#596155]">Relays:</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                        reading?.inlet_fan === 'ON'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-[#edf1e8] text-[#596155]'
                      }`}
                    >
                      HEPA Inlet: {reading?.inlet_fan || 'OFF'}
                    </span>

                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                        reading?.outlet_fan === 'ON'
                          ? 'bg-[#ffede0] text-[#e66a26]'
                          : 'bg-[#edf1e8] text-[#596155]'
                      }`}
                    >
                      Scrubber Fan: {reading?.outlet_fan || 'OFF'}
                    </span>

                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                        reading?.humidifier === 'ON'
                          ? 'bg-cyan-100 text-cyan-800'
                          : 'bg-[#edf1e8] text-[#596155]'
                      }`}
                    >
                      Ultrasonic Mist: {reading?.humidifier || 'OFF'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] text-[#596155]">
                    <span className="material-symbols-outlined text-sm text-[#3b6b32]">wifi</span>
                    Cloud telemetry synced
                  </div>
                </div>

                {/* Footer Action Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[#edf1e8]">
                  <span className="text-xs text-[#596155]">
                    Preset Profile Active: <strong>Autonomous Ethylene Neutralizer</strong>
                  </span>

                  <button
                    onClick={() => navigate(`/app/devices/${device.device_id}`)}
                    className="btn-secondary py-2.5 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto hover:border-[#e66a26] hover:text-[#e66a26] transition-colors"
                  >
                    <span>24h Gas Curves & Relays</span>
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
