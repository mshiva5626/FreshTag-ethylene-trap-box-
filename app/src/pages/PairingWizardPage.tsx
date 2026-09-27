import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useDeviceStore } from '../store/deviceStore';
import {
  isWebBluetoothSupported,
  connectBleVault,
  sendWiFiConfig,
  BleConnection,
  BleParsedStatus,
  BLE_CONFIG,
} from '../utils/ble';

type WizardStep = 'scan' | 'connecting' | 'form' | 'provisioning' | 'success';

export default function PairingWizardPage() {
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  const { registerDevice } = useDeviceStore();

  const isBluetoothSupported = isWebBluetoothSupported();

  // Wizard state
  const [step, setStep] = useState<WizardStep>('scan');
  const [bleConnection, setBleConnection] = useState<BleConnection | null>(null);
  const [bleStatus, setBleStatus] = useState<BleParsedStatus | null>(null);
  const [discoveredIp, setDiscoveredIp] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  // Form inputs
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [deviceId, setDeviceId] = useState('SF-001');
  const [nickname, setNickname] = useState('Primary Vault Alpha');
  const [serverUrl, setServerUrl] = useState('http://192.168.1.100:8080/api/telemetry');

  // Manual fallback inputs (for unsupported browsers)
  const [manualIp, setManualIp] = useState('192.168.1.100');
  const [manualDeviceId, setManualDeviceId] = useState('SF-001');
  const [manualNickname, setManualNickname] = useState('Manual Chamber Alpha');
  const [manualLoading, setManualLoading] = useState(false);

  // Clean up BLE on unmount
  useEffect(() => {
    return () => {
      if (bleConnection?.device?.gatt?.connected) {
        bleConnection.device.gatt.disconnect();
      }
    };
  }, [bleConnection]);

  // Handle Scan for BLE Device
  const handleStartScan = async () => {
    setErrorMsg(null);
    setStep('connecting');

    try {
      const conn = await connectBleVault((status) => {
        setBleStatus(status);
        if (status.type === 'CONNECTED' && status.ip) {
          setDiscoveredIp(status.ip);
          setStep('success');
        } else if (status.type === 'WIFI_FAILED') {
          setErrorMsg('Wi-Fi connection failed. Please check your network credentials and try again.');
          setStep('form');
        }
      });

      setBleConnection(conn);
      setStep('form');
    } catch (err: any) {
      console.warn('[BLE Scan Error]:', err);
      if (err.name === 'NotFoundError') {
        setErrorMsg('Pairing cancelled: No FreshGuard device selected.');
      } else {
        setErrorMsg(`Bluetooth Error: ${err.message || 'Could not connect to device'}`);
      }
      setStep('scan');
    }
  };

  // Handle Simulated Pairing (for testing without physical hardware)
  const handleStartSimulatedScan = () => {
    setIsDemoMode(true);
    setStep('connecting');
    setTimeout(() => {
      setStep('form');
    }, 1200);
  };

  // Submit Wi-Fi Configuration to ESP32
  const handleSubmitConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ssid.trim()) {
      setErrorMsg('Wi-Fi Network Name (SSID) is required.');
      return;
    }

    setErrorMsg(null);
    setStep('provisioning');

    if (isDemoMode || !bleConnection) {
      // Simulate real-world provisioning sequence
      setTimeout(() => {
        setBleStatus({
          raw: 'STATUS:CONNECTING_TO_WIFI',
          type: 'CONNECTING',
          message: 'Transmitting credentials to Flash NVS...',
        });
      }, 1000);

      setTimeout(async () => {
        const simIp = '192.168.1.145';
        setDiscoveredIp(simIp);
        setBleStatus({
          raw: `STATUS:CONNECTED:${simIp}`,
          type: 'CONNECTED',
          ip: simIp,
          message: `Connected successfully! Vault IP: ${simIp}`,
        });

        // Register device on backend
        if (token) {
          try {
            await registerDevice(token, {
              device_id: deviceId,
              nickname,
              localIp: simIp,
            });
          } catch (regErr: any) {
            console.warn('[Register Error]:', regErr.message);
          }
        }

        setStep('success');
      }, 3000);
      return;
    }

    try {
      await sendWiFiConfig(bleConnection.configChar, {
        ssid: ssid.trim(),
        password,
        server: serverUrl.trim(),
        device_id: deviceId.trim(),
        account_id: user?.account_id || 'mshiva5626',
        nickname: nickname.trim(),
      });
      // Awaiting notification callback in connectBleVault
    } catch (err: any) {
      setErrorMsg(`Failed to send Wi-Fi settings to Vault: ${err.message}`);
      setStep('form');
    }
  };

  // Manual pairing for unsupported browser or direct IP entry
  const handleManualPairing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDeviceId.trim()) {
      setErrorMsg('Device ID is required');
      return;
    }

    setManualLoading(true);
    setErrorMsg(null);

    try {
      if (token) {
        await registerDevice(token, {
          device_id: manualDeviceId.trim(),
          nickname: manualNickname.trim() || 'FreshGuard Vault',
          localIp: manualIp.trim() || '192.168.1.100',
        });
      }
      setDiscoveredIp(manualIp.trim() || '192.168.1.100');
      setDeviceId(manualDeviceId.trim());
      setNickname(manualNickname.trim());
      setStep('success');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to register device');
    } finally {
      setManualLoading(false);
    }
  };

  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/app/devices')}
          className="p-2 rounded-full hover:bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] transition-colors"
          aria-label="Back to Devices"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-on-surface)]">Add a FreshGuard Vault</h1>
          <p className="text-xs text-[var(--color-on-surface-variant)]">
            Bluetooth Low Energy Provisioning & Network Setup
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* UNSUPPORTED BROWSER FALLBACK SCREEN                          */}
      {/* ------------------------------------------------------------- */}
      {!isBluetoothSupported && step !== 'success' && (
        <div className="space-y-6">
          <div className="card p-6 border-l-4 border-amber-500 bg-amber-50/40 dark:bg-amber-950/20">
            <div className="flex items-start gap-4">
              <span className="material-symbols-outlined text-3xl text-amber-600 flex-shrink-0 mt-0.5">
                bluetooth_disabled
              </span>
              <div>
                <h3 className="text-base font-bold text-[var(--color-on-surface)] mb-1">
                  Web Bluetooth API Not Supported on This Browser
                </h3>
                <p className="text-xs text-[var(--color-on-surface-variant)] leading-relaxed mb-3">
                  Apple iOS (all iPhone browsers including Safari and Chrome), Mozilla Firefox, and insecure HTTP
                  contexts do not support the Web Bluetooth API required for automatic wireless scanning.
                </p>
                <div className="text-xs space-y-1 text-[var(--color-on-surface-variant)] bg-[var(--color-surface)] p-3 rounded-xl border border-[var(--color-outline-variant)]">
                  <p className="font-semibold text-[var(--color-on-surface)]">Recommended Options:</p>
                  <p>1. Open this app on <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong> on a Laptop/Desktop or Android device.</p>
                  <p>2. Connect your phone/laptop to the chamber's temporary Wi-Fi hotspot (if SoftAP is active) or use the manual IP pairing form below.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Manual Entry Form */}
          <div className="card p-6">
            <h3 className="text-base font-bold text-[var(--color-on-surface)] mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-lg text-[var(--color-primary)]">lan</span>
              Manual IP & Chamber Registration
            </h3>
            <p className="text-xs text-[var(--color-on-surface-variant)] mb-5">
              If your chamber is already connected to your local Wi-Fi router or SoftAP, enter its IP address directly:
            </p>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 dark:bg-red-950/30 text-xs text-red-600 dark:text-red-400">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleManualPairing} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                  Device Hardware ID
                </label>
                <input
                  type="text"
                  value={manualDeviceId}
                  onChange={(e) => setManualDeviceId(e.target.value)}
                  placeholder="SF-001"
                  className="input-field w-full text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                  Chamber Nickname
                </label>
                <input
                  type="text"
                  value={manualNickname}
                  onChange={(e) => setManualNickname(e.target.value)}
                  placeholder="e.g. Produce Vault #1"
                  className="input-field w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                  Local LAN IP Address (Optional for direct control)
                </label>
                <input
                  type="text"
                  value={manualIp}
                  onChange={(e) => setManualIp(e.target.value)}
                  placeholder="192.168.1.100"
                  className="input-field w-full text-sm"
                />
                <span className="text-[11px] text-[var(--color-on-surface-variant)] mt-1 block">
                  Found on your Wi-Fi router admin page or ESP32 serial monitor.
                </span>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={manualLoading}
                  className="btn-primary w-full py-3 text-sm font-semibold rounded-full flex items-center justify-center gap-2"
                >
                  {manualLoading ? 'Registering...' : 'Register Vault & Continue'}
                </button>

                <button
                  type="button"
                  onClick={handleStartSimulatedScan}
                  className="btn-secondary w-full py-2.5 text-xs font-medium rounded-full"
                >
                  Test with Virtual BLE Simulator
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SUPPORTED BROWSER WIZARD FLOW (OR SIMULATED MODE)              */}
      {/* ------------------------------------------------------------- */}
      {(isBluetoothSupported || isDemoMode) && (
        <div className="space-y-6">
          {/* Progress Indicators */}
          <div className="flex items-center justify-between px-2 mb-2">
            {[
              { id: 'scan', label: '1. Scan' },
              { id: 'form', label: '2. Wi-Fi' },
              { id: 'provisioning', label: '3. Pair' },
              { id: 'success', label: '4. Done' },
            ].map((s, idx) => {
              const isActive = step === s.id;
              const isPast =
                (step === 'connecting' && idx === 0) ||
                (step === 'form' && idx >= 0) ||
                (step === 'provisioning' && idx >= 1) ||
                (step === 'success' && idx >= 2);

              return (
                <div key={s.id} className="flex items-center gap-1.5 text-xs font-medium">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      isActive
                        ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
                        : isPast
                        ? 'bg-[var(--color-secondary-container)] text-[var(--color-on-secondary-container)]'
                        : 'bg-[var(--color-surface-container)] text-[var(--color-outline)]'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className={isActive ? 'text-[var(--color-on-surface)] font-bold' : 'text-[var(--color-on-surface-variant)]'}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: SCAN SCREEN */}
          {step === 'scan' && (
            <div className="card p-6 flex flex-col items-center text-center gap-5">
              <div className="w-24 h-24 rounded-full bg-[var(--color-primary-container)]/20 flex items-center justify-center relative">
                <span className="material-symbols-outlined text-5xl text-[var(--color-primary-container)] animate-pulse">
                  bluetooth_searching
                </span>
              </div>

              <div>
                <h2 className="text-xl font-bold text-[var(--color-on-surface)] mb-2">
                  Prepare Your FreshGuard Chamber
                </h2>
                <p className="text-xs text-[var(--color-on-surface-variant)] max-w-md mx-auto leading-relaxed">
                  Power on your ESP32 controller. The <strong>Blue Antimicrobial LED (GPIO 18)</strong> will flash rhythmically every 350ms, indicating it is broadcasting as <code>{BLE_CONFIG.DEVICE_NAME}</code>.
                </p>
              </div>

              <div className="w-full max-w-sm p-3.5 rounded-2xl bg-[var(--color-surface-container)] text-left text-xs text-[var(--color-on-surface-variant)] space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-[var(--color-on-surface)]">
                  <span className="material-symbols-outlined text-sm text-[var(--color-primary)]">tune</span>
                  GATT Specifications:
                </div>
                <p>Service UUID: <code className="text-[10px]">{BLE_CONFIG.SERVICE_UUID}</code></p>
                <p>Range: Within 5 meters of your computer/phone.</p>
              </div>

              <div className="w-full max-w-sm flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleStartScan}
                  className="btn-primary w-full py-3.5 text-sm font-semibold rounded-full flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">bluetooth</span>
                  Scan & Pair via Bluetooth
                </button>

                <button
                  type="button"
                  onClick={handleStartSimulatedScan}
                  className="text-xs text-[var(--color-on-surface-variant)] hover:text-[var(--color-primary)] py-2 transition-colors"
                >
                  Simulate pairing without hardware
                </button>
              </div>
            </div>
          )}

          {/* STEP: CONNECTING SPINNER */}
          {step === 'connecting' && (
            <div className="card p-10 flex flex-col items-center text-center gap-5">
              <div className="w-20 h-20 rounded-full border-4 border-[var(--color-primary-container)] border-t-transparent animate-spin flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl text-[var(--color-primary)]">bluetooth</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[var(--color-on-surface)] mb-1">
                  Connecting to FreshGuard GATT Server...
                </h3>
                <p className="text-xs text-[var(--color-on-surface-variant)]">
                  Locating primary service <code>4fafc201...</code> and subscribing to notifications.
                </p>
              </div>
            </div>
          )}

          {/* STEP 2: WI-FI FORM SCREEN */}
          {step === 'form' && (
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[var(--color-outline-variant)]/40">
                <span className="material-symbols-outlined text-2xl text-emerald-600">bluetooth_connected</span>
                <div>
                  <h3 className="text-base font-bold text-[var(--color-on-surface)]">
                    Connected: {bleConnection?.device.name || BLE_CONFIG.DEVICE_NAME}
                  </h3>
                  <p className="text-xs text-[var(--color-on-surface-variant)]">
                    {bleStatus?.message || 'Ready for Wi-Fi provisioning credentials'}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmitConfig} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                    Wi-Fi Network Name (SSID) *
                  </label>
                  <input
                    type="text"
                    value={ssid}
                    onChange={(e) => setSsid(e.target.value)}
                    placeholder="Enter your 2.4GHz Wi-Fi name"
                    className="input-field w-full text-sm"
                    required
                  />
                  <span className="text-[11px] text-[var(--color-on-surface-variant)] mt-1 block">
                    ESP32 requires a standard 2.4GHz Wi-Fi network.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                    Wi-Fi Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter Wi-Fi password"
                      className="input-field w-full text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-on-surface-variant)]"
                    >
                      <span className="material-symbols-outlined text-lg">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                      Chamber Nickname
                    </label>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="e.g. Fruit Storage #1"
                      className="input-field w-full text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                      Device Hardware ID
                    </label>
                    <input
                      type="text"
                      value={deviceId}
                      onChange={(e) => setDeviceId(e.target.value)}
                      placeholder="SF-001"
                      className="input-field w-full text-sm"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                    Backend Ingestion Host URL
                  </label>
                  <input
                    type="text"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    className="input-field w-full text-xs font-mono"
                  />
                  <span className="text-[11px] text-[var(--color-on-surface-variant)] mt-1 block">
                    ESP32 POSTs live telemetry readings to this endpoint every 2.5s.
                  </span>
                </div>

                <div className="pt-3">
                  <button
                    type="submit"
                    className="btn-primary w-full py-3.5 text-sm font-semibold rounded-full flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-lg">send</span>
                    Send Credentials to Vault
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 3: PROVISIONING IN PROGRESS */}
          {step === 'provisioning' && (
            <div className="card p-8 flex flex-col items-center text-center gap-6">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-4 border-[var(--color-primary-container)] border-t-transparent animate-spin" />
                <span className="material-symbols-outlined text-2xl text-[var(--color-primary-container)] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  wifi
                </span>
              </div>

              <div>
                <h3 className="text-lg font-bold text-[var(--color-on-surface)] mb-1">
                  Configuring Chamber Flash Memory...
                </h3>
                <p className="text-xs text-[var(--color-on-surface-variant)] max-w-sm mx-auto">
                  Writing credentials to characteristic <code>beb5483e...</code>. The chamber will now disconnect BLE and connect to your Wi-Fi router.
                </p>
              </div>

              <div className="w-full max-w-md p-3.5 rounded-2xl bg-[var(--color-surface-container)] text-xs font-mono text-[var(--color-on-surface)] text-left">
                <p className="text-[11px] text-[var(--color-on-surface-variant)] mb-1 font-sans">
                  Firmware Status Notification:
                </p>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  <span>{bleStatus?.message || 'STATUS:CONNECTING_TO_WIFI'}</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: SUCCESS CONFIRMATION */}
          {step === 'success' && (
            <div className="card p-8 flex flex-col items-center text-center gap-5">
              <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl">check_circle</span>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-[var(--color-on-surface)] mb-1">
                  Vault Successfully Paired!
                </h2>
                <p className="text-xs text-[var(--color-on-surface-variant)]">
                  Your chamber is connected to Wi-Fi and actively reporting telemetry.
                </p>
              </div>

              <div className="w-full max-w-md p-4 rounded-2xl bg-[var(--color-surface-container)] text-left text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--color-on-surface-variant)]">Device Hardware ID:</span>
                  <span className="font-bold text-[var(--color-on-surface)]">{deviceId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-on-surface-variant)]">Vault Nickname:</span>
                  <span className="font-bold text-[var(--color-on-surface)]">{nickname}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-on-surface-variant)]">Assigned Local IP:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {discoveredIp || '192.168.1.145'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-on-surface-variant)]">Pairing Blue LED:</span>
                  <span className="text-xs text-[var(--color-on-surface)] font-medium">
                    Turned OFF (Normal Auto Climate Active)
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/app/dashboard')}
                className="btn-primary w-full max-w-sm py-3.5 text-sm font-semibold rounded-full flex items-center justify-center gap-2 mt-2"
              >
                <span className="material-symbols-outlined text-lg">dashboard</span>
                Go to Live Dashboard
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
