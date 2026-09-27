import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useDeviceStore } from '../store/deviceStore';
export default function DevicesPage() {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const { devices, latestReadings, fetchDevices } = useDeviceStore();

  useEffect(() => {
    if (token) {
      fetchDevices(token);
    }
  }, [token]);

  return (
    <div className="px-4 py-8 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-on-surface)]">FreshGuard Vaults</h1>
          <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">
            Manage paired chambers, Wi-Fi SoftAP & QR provisioning, and botanical parameters
          </p>
        </div>

        <button
          onClick={() => navigate('/app/devices/pair')}
          className="btn-primary py-2.5 px-5 rounded-full text-xs font-semibold flex items-center gap-2 self-start sm:self-auto shadow-sm"
        >
          <span className="material-symbols-outlined text-base">qr_code_scanner</span>
          Add a Chamber
        </button>
      </div>

      {/* Devices List */}
      {devices.length === 0 ? (
        <div className="card p-10 flex flex-col items-center text-center gap-4">
          <div className="w-20 h-20 rounded-full bg-[var(--color-surface-container)] flex items-center justify-center text-[var(--color-primary)]">
            <span className="material-symbols-outlined text-4xl">devices</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--color-on-surface)]">No Vaults Registered</h3>
            <p className="text-xs text-[var(--color-on-surface-variant)] max-w-xs mx-auto mt-1">
              Pair your ESP32 controller to monitor relative ethylene index, temperature, and relative humidity.
            </p>
          </div>
          <button
            onClick={() => navigate('/app/devices/pair')}
            className="btn-primary py-3 px-6 rounded-full text-xs font-semibold flex items-center gap-2 mt-2"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Pair FreshGuard Chamber
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {devices.map((device) => {
            const reading = latestReadings[device.device_id] || device.latest_reading;
            const isDoorOpen = reading?.door_status === 'OPEN';

            return (
              <div
                key={device.device_id}
                onClick={() => navigate(`/app/devices/${device.device_id}`)}
                className="card p-5 cursor-pointer hover:border-[var(--color-primary-container)] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface-container)] flex items-center justify-center text-[var(--color-primary)] flex-shrink-0">
                    <span className="material-symbols-outlined text-2xl">shelves</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-[var(--color-on-surface)]">{device.nickname}</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]">
                        {device.device_id}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
                      Mode: <span className="font-semibold text-[var(--color-on-surface)]">{reading?.system_mode || 'AUTO'}</span> • Door: <span className={`font-semibold ${isDoorOpen ? 'text-red-600' : 'text-emerald-600'}`}>{reading?.door_status || 'CLOSED'}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-auto">
                  <div className="text-right text-xs">
                    <span className="text-[var(--color-on-surface-variant)] block">Live Temp:</span>
                    <span className="font-bold text-[var(--color-on-surface)] text-sm">
                      {reading?.dht_exists === false ? 'Offline' : reading?.temperature != null ? `${reading.temperature.toFixed(1)}°C` : '--'}
                    </span>
                  </div>

                  <span className="material-symbols-outlined text-[var(--color-outline)]">chevron_right</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
