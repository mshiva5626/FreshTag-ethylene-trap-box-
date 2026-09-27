import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useDeviceStore } from '../store/deviceStore';
import { useSettingsStore } from '../store/settingsStore';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuthStore();
  const { devices, fetchDevices, updateThresholds, unpairDevice, localIps, checkLocalReachability, localReachability } =
    useDeviceStore();
  const {
    temperatureUnit,
    setTemperatureUnit,
    planTier,
    notificationPrefs,
    updateNotificationPrefs,
    networkLatencyMs,
    lastNetworkCheck,
    testNetworkLatency,
  } = useSettingsStore();

  // State
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState('');
  const [unpairingId, setUnpairingId] = useState<string | null>(null);
  const [confirmUnpairDevice, setConfirmUnpairDevice] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  useEffect(() => {
    if (token) {
      fetchDevices(token);
    }
  }, [token]);

  // Handle Box Rename
  const handleStartRename = (deviceId: string, currentName: string) => {
    setEditingDeviceId(deviceId);
    setEditNickname(currentName);
  };

  const handleSaveRename = async (deviceId: string) => {
    if (!token || !editNickname.trim()) return;
    try {
      await updateThresholds(token, deviceId, { nickname: editNickname.trim() });
      setToastMessage(`Box renamed to "${editNickname.trim()}".`);
      setEditingDeviceId(null);
    } catch (err: any) {
      setToastMessage(`Failed to rename: ${err.message}`);
    }
  };

  // Handle Box Unpair
  const handleExecuteUnpair = async (deviceId: string) => {
    if (!token) return;
    setUnpairingId(deviceId);
    try {
      const { localWiped } = await unpairDevice(token, deviceId);
      const wipedNote = localWiped
        ? 'Local box flash memory wiped and reset to BLE pairing mode.'
        : 'Cloud registration removed. Box was offline/remote.';
      setToastMessage(`Chamber ${deviceId} unpaired successfully! ${wipedNote}`);
      setConfirmUnpairDevice(null);
    } catch (err: any) {
      setToastMessage(`Unpair error: ${err.message}`);
    } finally {
      setUnpairingId(null);
    }
  };

  // Handle Network Ping Test
  const handleTestLatency = async () => {
    setPinging(true);
    await testNetworkLatency();
    setPinging(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="px-4 py-8 lg:px-8 max-w-4xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-on-surface)] flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--color-primary)]">settings</span>
            Account & System Settings
          </h1>
          <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">
            Manage your researcher profile, measurement units, paired chambers, and cloud telemetry
          </p>
        </div>

        {/* Plan Upgrade Shortcut */}
        <button
          onClick={() => navigate('/app/premium')}
          aria-label="View plan tiers and upgrade"
          className="btn-secondary py-2.5 px-4 rounded-full text-xs font-bold flex items-center gap-2 self-start sm:self-auto min-h-[44px]"
        >
          <span className="material-symbols-outlined text-amber-500 text-base">workspace_premium</span>
          {planTier === 'premium' ? 'Pro Botanist Plan' : 'Upgrade to Pro'}
        </button>
      </div>

      {/* Confirmation Toast */}
      {toastMessage && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between shadow-sm animate-fadeIn"
        >
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400">check_circle</span>
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            aria-label="Close notification"
            className="hover:opacity-75 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* ── 1. Researcher Profile Card ── */}
      <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[var(--color-secondary-container)] flex items-center justify-center text-2xl font-bold text-[var(--color-on-secondary-container)] shadow-sm flex-shrink-0">
            {user?.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[var(--color-on-surface)]">{user?.name}</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]">
                {planTier === 'premium' ? 'Pro Botanist' : 'Hobbyist'}
              </span>
            </div>
            <p className="text-xs text-[var(--color-on-surface-variant)]">{user?.email}</p>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] font-mono text-[var(--color-on-surface-variant)]">
              <span>Account ID:</span>
              <strong className="text-[var(--color-primary)]">{user?.account_id || 'mshiva5626'}</strong>
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          aria-label="Sign out of account"
          className="btn-secondary py-2 px-4 rounded-full text-xs font-semibold text-[var(--color-tertiary)] hover:bg-[var(--color-error-container)] border-[var(--color-error-container)] transition-all flex items-center gap-1.5 self-start sm:self-auto min-h-[44px]"
        >
          <span className="material-symbols-outlined text-sm">logout</span>
          Sign Out
        </button>
      </div>

      {/* ── 2. Units of Measurement ── */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--color-outline-variant)]/30">
          <span className="material-symbols-outlined text-xl text-[var(--color-primary)]">thermostat</span>
          <div>
            <h3 className="text-sm font-bold text-[var(--color-on-surface)]">Temperature Unit of Measurement</h3>
            <p className="text-[11px] text-[var(--color-on-surface-variant)]">
              Select your preferred scale for climate bounds, sensor charts, and live gauges
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center bg-[var(--color-surface-container)] p-1 rounded-full border border-[var(--color-outline-variant)]/40">
            <button
              onClick={() => setTemperatureUnit('C')}
              aria-label="Use Celsius units"
              className={`py-2 px-5 rounded-full text-xs font-bold transition-all min-h-[44px] ${
                temperatureUnit === 'C'
                  ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] shadow-sm'
                  : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
              }`}
            >
              Celsius (°C)
            </button>
            <button
              onClick={() => setTemperatureUnit('F')}
              aria-label="Use Fahrenheit units"
              className={`py-2 px-5 rounded-full text-xs font-bold transition-all min-h-[44px] ${
                temperatureUnit === 'F'
                  ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] shadow-sm'
                  : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
              }`}
            >
              Fahrenheit (°F)
            </button>
          </div>

          <span className="text-xs text-[var(--color-on-surface-variant)]">
            Active: <strong>{temperatureUnit === 'C' ? 'Celsius (Standard Metric)' : 'Fahrenheit (Imperial)'}</strong>
          </span>
        </div>
      </div>

      {/* ── 3. Paired Chambers List (with Rename & Unpair) ── */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--color-outline-variant)]/30">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-xl text-[var(--color-primary)]">inventory_2</span>
            <div>
              <h3 className="text-sm font-bold text-[var(--color-on-surface)]">
                Paired FreshGuard Chambers ({devices.length})
              </h3>
              <p className="text-[11px] text-[var(--color-on-surface-variant)]">
                Rename vaults or unpair hardware to reset them back to Bluetooth provisioning mode
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate('/app/devices/pair')}
            aria-label="Pair an additional box"
            className="btn-primary py-2 px-4 rounded-full text-xs font-semibold flex items-center gap-1.5 min-h-[44px]"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Add Box
          </button>
        </div>

        {devices.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--color-on-surface-variant)]">
            No chambers paired to your account.
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map((device) => {
              const ip = localIps[device.device_id];
              const isReachable = localReachability[device.device_id];
              const isEditing = editingDeviceId === device.device_id;
              const isConfirming = confirmUnpairDevice === device.device_id;

              return (
                <div
                  key={device.device_id}
                  className="p-4 rounded-2xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)]/40 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editNickname}
                          onChange={(e) => setEditNickname(e.target.value)}
                          className="input-field text-xs py-1 px-3 w-48 font-bold"
                          placeholder="Vault Nickname"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveRename(device.device_id)}
                          aria-label="Save new box nickname"
                          className="btn-primary py-1 px-3 text-xs rounded-full min-h-[44px]"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingDeviceId(null)}
                          aria-label="Cancel rename"
                          className="text-xs text-[var(--color-outline)] hover:underline min-h-[44px] px-2"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-[var(--color-on-surface)]">{device.nickname}</h4>
                        <button
                          onClick={() => handleStartRename(device.device_id, device.nickname)}
                          aria-label={`Rename ${device.nickname}`}
                          className="text-[var(--color-outline)] hover:text-[var(--color-primary)] p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                          <span className="material-symbols-outlined text-sm">edit</span>
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-on-surface-variant)]">
                      <span className="font-mono font-semibold">ID: {device.device_id}</span>
                      <span>•</span>
                      {ip ? (
                        <span className="flex items-center gap-1 font-mono">
                          LAN: {ip}
                          <span
                            className={`w-2 h-2 rounded-full ${isReachable ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            title={isReachable ? 'LAN Reachable' : 'LAN Check Pending'}
                          />
                        </span>
                      ) : (
                        <span className="text-[var(--color-outline)]">Cloud Telemetry Only</span>
                      )}
                    </div>
                  </div>

                  {/* Actions: View & Unpair */}
                  <div className="flex items-center gap-2 self-end md:self-auto">
                    <button
                      onClick={() => navigate(`/app/devices/${device.device_id}`)}
                      aria-label={`Open details for ${device.nickname}`}
                      className="btn-secondary py-1.5 px-3 rounded-full text-xs font-semibold flex items-center gap-1 min-h-[44px]"
                    >
                      <span className="material-symbols-outlined text-sm">visibility</span>
                      Controls
                    </button>

                    {isConfirming ? (
                      <div className="flex items-center gap-2 animate-fadeIn">
                        <span className="text-[11px] font-bold text-red-600">Unpair this box?</span>
                        <button
                          onClick={() => handleExecuteUnpair(device.device_id)}
                          disabled={unpairingId === device.device_id}
                          aria-label="Confirm unpairing"
                          className="py-1 px-3 rounded-full text-xs font-bold bg-red-600 text-white hover:bg-red-700 min-h-[44px]"
                        >
                          {unpairingId === device.device_id ? 'Wiping...' : 'Yes, Unpair'}
                        </button>
                        <button
                          onClick={() => setConfirmUnpairDevice(null)}
                          aria-label="Cancel unpair"
                          className="py-1 px-2 text-xs text-[var(--color-outline)] hover:underline min-h-[44px]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmUnpairDevice(device.device_id)}
                        aria-label={`Unpair box ${device.nickname}`}
                        className="py-1.5 px-3 rounded-full text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900 transition-colors flex items-center gap-1 min-h-[44px]"
                      >
                        <span className="material-symbols-outlined text-sm">link_off</span>
                        Unpair
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 4. Notification Preferences ── */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--color-outline-variant)]/30">
          <span className="material-symbols-outlined text-xl text-[var(--color-primary)]">notifications</span>
          <div>
            <h3 className="text-sm font-bold text-[var(--color-on-surface)]">Notification & Alert Channels</h3>
            <p className="text-[11px] text-[var(--color-on-surface-variant)]">
              Choose which botanical safety alerts trigger device vibrations and push banners
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {[
            {
              key: 'criticalExcursions' as const,
              label: 'Critical Climate Excursions',
              desc: 'Immediate alert when chamber temperature moves outside safe biological threshold',
            },
            {
              key: 'doorOpenProlonged' as const,
              label: 'Door Prolonged Open (>2 min)',
              desc: 'Optical safety beam broken for over 120 seconds with actuator lockout',
            },
            {
              key: 'filterSchedule' as const,
              label: 'Catalytic Granule Service Reminder',
              desc: 'Maintenance notification when potassium permanganate media expires',
            },
            {
              key: 'emailSummaries' as const,
              label: 'Weekly Botanical Health Digest',
              desc: 'Summary of harvest shelf-life gained and compliance stability index',
            },
          ].map((item) => (
            <label
              key={item.key}
              className="flex items-center justify-between p-3 rounded-2xl bg-[var(--color-surface-container)] hover:bg-[var(--color-surface-container-high)] transition-colors cursor-pointer min-h-[44px]"
            >
              <div className="pr-4">
                <span className="text-xs font-bold text-[var(--color-on-surface)] block">{item.label}</span>
                <span className="text-[11px] text-[var(--color-on-surface-variant)] block">{item.desc}</span>
              </div>
              <input
                type="checkbox"
                checked={notificationPrefs[item.key]}
                onChange={(e) => updateNotificationPrefs({ [item.key]: e.target.checked })}
                aria-label={item.label}
                className="w-5 h-5 rounded accent-[var(--color-primary)] cursor-pointer flex-shrink-0"
              />
            </label>
          ))}
        </div>
      </div>

      {/* ── 5. Network Connectivity & Telemetry Diagnostics ── */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--color-outline-variant)]/30">
          <span className="material-symbols-outlined text-xl text-blue-600">wifi</span>
          <div>
            <h3 className="text-sm font-bold text-[var(--color-on-surface)]">Network Telemetry & Connectivity</h3>
            <p className="text-[11px] text-[var(--color-on-surface-variant)]">
              Status of your connection to FreshGuard cloud ingestion and local ESP32 chambers
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-[var(--color-surface-container)] space-y-2">
            <span className="text-xs font-bold text-[var(--color-on-surface)] block">Cloud Ingestion Server</span>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">Online & Listening</span>
            </div>
            <p className="text-[10px] text-[var(--color-on-surface-variant)]">
              Socket.io telemetry channel connected at 2500ms upload interval.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[var(--color-surface-container)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-on-surface)]">Cloud API Latency</span>
              <button
                onClick={handleTestLatency}
                disabled={pinging}
                aria-label="Test network latency"
                className="text-[11px] font-semibold text-[var(--color-primary)] hover:underline min-h-[44px] flex items-center"
              >
                {pinging ? 'Pinging...' : 'Test Connection'}
              </button>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black font-mono text-[var(--color-on-surface)]">
                {networkLatencyMs !== null ? `${networkLatencyMs} ms` : '—'}
              </span>
              <span className="text-[10px] text-[var(--color-on-surface-variant)]">
                {networkLatencyMs ? '(Excellent)' : 'Run test to measure'}
              </span>
            </div>
            <span className="text-[10px] text-[var(--color-on-surface-variant)] block">
              {lastNetworkCheck ? `Last checked: ${new Date(lastNetworkCheck).toLocaleTimeString()}` : 'Never checked'}
            </span>
          </div>
        </div>
      </div>

      {/* ── 6. Help, FAQ & Support ── */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--color-outline-variant)]/30">
          <span className="material-symbols-outlined text-xl text-purple-600">help</span>
          <div>
            <h3 className="text-sm font-bold text-[var(--color-on-surface)]">Botanical Knowledgebase & Support</h3>
            <p className="text-[11px] text-[var(--color-on-surface-variant)]">
              Expert guides for optimal fruit storage, sensor care, and customer support
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {[
            {
              q: 'How does catalytic ethylene scrubbing prevent produce over-ripening?',
              a: 'Ethylene (C₂H₄) is an autocatalytic plant hormone. FreshGuard draws internal air through potassium permanganate (KMnO₄) granules, oxidizing ethylene into harmless carbon dioxide and water vapor before produce triggers secondary ripening.',
            },
            {
              q: 'Why does the system halt misting and fans when the door opens?',
              a: 'Optical beam interlocks (GPIO 14) protect the researcher from mist inhalation and prevent high-velocity room air turbulence from entering the controlled microclimate.',
            },
            {
              q: 'How often should I clean the ultrasonic atomizer?',
              a: 'Inspect the 1.7MHz ceramic piezoelectric disc every 30 days. Wipe gently with distilled water or diluted vinegar to remove mineral deposits.',
            },
          ].map((item, idx) => {
            const isOpen = expandedFaq === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)]/30 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedFaq(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="w-full p-3.5 text-left text-xs font-bold text-[var(--color-on-surface)] flex items-center justify-between gap-3 min-h-[44px]"
                >
                  <span>{item.q}</span>
                  <span className="material-symbols-outlined text-sm text-[var(--color-outline)]">
                    {isOpen ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-3.5 pb-3.5 text-xs text-[var(--color-on-surface-variant)] leading-relaxed border-t border-[var(--color-outline-variant)]/20 pt-2 animate-fadeIn">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Contact Helpdesk */}
        <div className="p-4 rounded-2xl bg-[var(--color-surface-container-high)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-bold text-[var(--color-on-surface)] block">Need Agronomist Assistance?</span>
            <span className="text-[var(--color-on-surface-variant)]">Email: support@freshguard.app • Call: +1 (800) 268-2642</span>
          </div>
          <a
            href="mailto:support@freshguard.app"
            aria-label="Email FreshGuard Support"
            className="btn-secondary py-2 px-4 rounded-full font-semibold flex items-center gap-1.5 self-start sm:self-auto min-h-[44px]"
          >
            <span className="material-symbols-outlined text-sm">mail</span>
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}
