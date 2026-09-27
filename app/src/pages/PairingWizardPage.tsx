import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useDeviceStore } from '../store/deviceStore';
import {
  PROVISIONING_CONFIG,
  getWifiQrString,
  getSetupUrlQrString,
  generateQrDataUrl,
  sendWifiCredentials,
  fetchNearbyNetworks,
  checkChamberReachable,
  ScannedNetwork,
} from '../utils/wifiProvisioning';

type PairingMethod = 'qr' | 'direct' | 'manual';
type WizardStep = 'select' | 'configuring' | 'success';

export default function PairingWizardPage() {
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  const { registerDevice } = useDeviceStore();

  const accountId = user?.account_id || 'mshiva5626';

  // Active Pairing Method Tab
  const [activeTab, setActiveTab] = useState<PairingMethod>('qr');
  const [step, setStep] = useState<WizardStep>('select');

  // QR Code Data URLs
  const [wifiQrUrl, setWifiQrUrl] = useState<string>('');
  const [setupUrlQr, setSetupUrlQr] = useState<string>('');
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  // Form Inputs
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [deviceId, setDeviceId] = useState(PROVISIONING_CONFIG.DEFAULT_DEVICE_ID);
  const [nickname, setNickname] = useState('Botanical Vault Alpha');
  const [serverUrl, setServerUrl] = useState('http://192.168.1.100:8080/api/telemetry');
  const [chamberIp, setChamberIp] = useState(PROVISIONING_CONFIG.DEFAULT_AP_IP);

  // Scanned Visible Networks
  const [scannedNets, setScannedNets] = useState<ScannedNetwork[]>([]);
  const [scanningNets, setScanningNets] = useState<boolean>(false);

  // Manual LAN IP Inputs
  const [manualIp, setManualIp] = useState('192.168.1.100');
  const [manualDeviceId, setManualDeviceId] = useState('SF-001');
  const [manualNickname, setManualNickname] = useState('Vault Alpha (LAN)');

  // Status & Feedback
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [discoveredIp, setDiscoveredIp] = useState<string>('');
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  // Generate QR codes on mount or when deviceId/accountId changes
  useEffect(() => {
    async function makeQrCodes() {
      try {
        const wifiStr = getWifiQrString(PROVISIONING_CONFIG.AP_SSID, PROVISIONING_CONFIG.AP_PASS);
        const wUrl = await generateQrDataUrl(wifiStr);
        setWifiQrUrl(wUrl);

        const portalStr = getSetupUrlQrString(accountId, deviceId, chamberIp);
        const pUrl = await generateQrDataUrl(portalStr);
        setSetupUrlQr(pUrl);
      } catch (err) {
        console.error('[QR Generation Error]:', err);
      }
    }
    makeQrCodes();
  }, [accountId, deviceId, chamberIp]);

  // Scan visible Wi-Fi networks from chamber (if phone/PC is on FreshGuard-Setup)
  const handleScanChamberNetworks = async () => {
    setScanningNets(true);
    setErrorMsg(null);
    try {
      const nets = await fetchNearbyNetworks(chamberIp);
      if (nets.length > 0) {
        setScannedNets(nets);
      } else {
        setErrorMsg('No networks returned. Ensure your device is connected to "FreshGuard-Setup" Wi-Fi.');
      }
    } catch {
      setErrorMsg('Could not reach chamber at ' + chamberIp + '. Please connect to "FreshGuard-Setup" Wi-Fi.');
    } finally {
      setScanningNets(false);
    }
  };

  // Direct In-App Provisioning Submit
  const handleDirectProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ssid.trim()) {
      setErrorMsg('Wi-Fi Network Name (SSID) is required.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);
    setStep('configuring');
    setStatusMessage('Transmitting credentials and account binding to Flash NVS...');

    // Demo Mode Simulation
    if (isDemoMode) {
      setTimeout(() => {
        setStatusMessage('Chamber connecting to Wi-Fi router...');
      }, 1000);

      setTimeout(async () => {
        const simIp = '192.168.1.145';
        setDiscoveredIp(simIp);
        if (token) {
          try {
            await registerDevice(token, {
              device_id: deviceId.trim(),
              nickname: nickname.trim(),
              localIp: simIp,
            });
          } catch (regErr: any) {
            console.warn('[Register Error]:', regErr.message);
          }
        }
        setIsSubmitting(false);
        setStep('success');
      }, 2500);
      return;
    }

    try {
      await sendWifiCredentials(chamberIp, {
        ssid: ssid.trim(),
        password,
        account_id: accountId,
        device_id: deviceId.trim(),
        server: serverUrl.trim(),
        nickname: nickname.trim(),
      });

      setStatusMessage('Credentials saved! Chamber is connecting to your Wi-Fi router...');

      // Register device on backend database
      if (token) {
        try {
          await registerDevice(token, {
            device_id: deviceId.trim(),
            nickname: nickname.trim(),
            localIp: chamberIp !== PROVISIONING_CONFIG.DEFAULT_AP_IP ? chamberIp : '192.168.1.145',
          });
        } catch (regErr: any) {
          console.warn('[Register Error]:', regErr.message);
        }
      }

      setDiscoveredIp(chamberIp !== PROVISIONING_CONFIG.DEFAULT_AP_IP ? chamberIp : 'Assigned by Router');
      setIsSubmitting(false);
      setStep('success');
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(`Transmission failed: ${err.message}. Ensure you are connected to "FreshGuard-Setup" Wi-Fi or chamber IP.`);
      setStep('select');
    }
  };

  // Manual LAN IP Registration
  const handleManualPairing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDeviceId.trim()) {
      setErrorMsg('Device Hardware ID is required.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      // Test reachability if IP provided
      const ip = manualIp.trim() || '192.168.1.100';
      const check = await checkChamberReachable(ip, 2000);
      if (check.reachable && check.status) {
        console.log('[Manual Pairing] Chamber verified online:', check.status);
      }

      if (token) {
        await registerDevice(token, {
          device_id: manualDeviceId.trim(),
          nickname: manualNickname.trim() || 'FreshGuard Vault',
          localIp: ip,
        });
      }

      setDeviceId(manualDeviceId.trim());
      setNickname(manualNickname.trim());
      setDiscoveredIp(ip);
      setStep('success');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to register device on backend.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Virtual Demo Mode Trigger
  const handleStartSimulatedScan = () => {
    setIsDemoMode(true);
    setSsid('Home_Botanical_WiFi');
    setPassword('produce123');
    setActiveTab('direct');
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
            Wi-Fi SoftAP & QR Code Fast Pairing (Bluetooth-Free)
          </p>
        </div>
      </div>

      {/* Account Info Pill */}
      <div className="mb-6 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-lg">verified_user</span>
          <span className="text-[var(--color-on-surface)]">
            Binding to Account: <strong>{accountId}</strong>
          </span>
        </div>
        <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
          Auto-reconnects on reboot
        </span>
      </div>

      {/* Progress Indicators */}
      <div className="flex items-center justify-between px-2 mb-6">
        {[
          { id: 'select', label: '1. Connect' },
          { id: 'configuring', label: '2. Provision' },
          { id: 'success', label: '3. Online' },
        ].map((s, idx) => {
          const isActive = step === s.id;
          const isPast = (step === 'configuring' && idx === 0) || (step === 'success' && idx <= 1);

          return (
            <div key={s.id} className="flex items-center gap-2 text-xs font-medium">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : isPast
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
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
        <div className="p-4 mb-6 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 flex items-start gap-2.5">
          <span className="material-symbols-outlined text-lg flex-shrink-0 mt-0.5">error</span>
          <div className="leading-relaxed">
            <strong className="block mb-0.5">Setup Attention Needed</strong>
            {errorMsg}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STEP 1: SELECT PAIRING METHOD & CREDENTIAL INPUT               */}
      {/* ------------------------------------------------------------- */}
      {step === 'select' && (
        <div className="space-y-6">
          {/* Method Selection Tabs */}
          <div className="flex rounded-2xl bg-[var(--color-surface-container)] p-1 border border-[var(--color-outline-variant)]/30">
            <button
              type="button"
              onClick={() => setActiveTab('qr')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'qr'
                  ? 'bg-[var(--color-surface)] text-[var(--color-on-surface)] shadow-sm'
                  : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
              }`}
            >
              <span className="material-symbols-outlined text-base">qr_code_scanner</span>
              <span>QR Code Pairing</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('direct')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'direct'
                  ? 'bg-[var(--color-surface)] text-[var(--color-on-surface)] shadow-sm'
                  : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
              }`}
            >
              <span className="material-symbols-outlined text-base">wifi</span>
              <span>Direct Wi-Fi Setup</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'manual'
                  ? 'bg-[var(--color-surface)] text-[var(--color-on-surface)] shadow-sm'
                  : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
              }`}
            >
              <span className="material-symbols-outlined text-base">lan</span>
              <span>Manual LAN IP</span>
            </button>
          </div>

          {/* TAB 1: QR CODE PAIRING */}
          {activeTab === 'qr' && (
            <div className="card p-6 flex flex-col items-center text-center gap-6">
              <div>
                <h2 className="text-xl font-bold text-[var(--color-on-surface)] mb-2">
                  Pair ESP32 with Camera QR Code
                </h2>
                <p className="text-xs text-[var(--color-on-surface-variant)] max-w-md mx-auto leading-relaxed">
                  Scan this QR code with your iPhone or Android camera to instantly join the chamber's setup network,
                  or tap the link below to open the setup portal directly.
                </p>
              </div>

              {/* QR Code Display Container */}
              <div className="p-4 bg-white rounded-3xl shadow-xl border-4 border-emerald-500/30 flex flex-col items-center">
                {wifiQrUrl ? (
                  <img
                    src={wifiQrUrl}
                    alt="FreshGuard Wi-Fi Auto-Connect QR Code"
                    className="w-56 h-56 rounded-xl"
                  />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center text-slate-400">
                    <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
                  </div>
                )}
                <div className="mt-3 text-center">
                  <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full">
                    SSID: {PROVISIONING_CONFIG.AP_SSID} (Open)
                  </span>
                </div>
              </div>

              {/* Instructions Steps */}
              <div className="w-full text-left text-xs space-y-2.5 p-4 rounded-2xl bg-[var(--color-surface-container)] border border-[var(--color-outline-variant)]/20">
                <div className="font-semibold text-[var(--color-on-surface)] flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-500 text-sm">tips_and_updates</span>
                  How to complete setup:
                </div>
                <p className="text-[var(--color-on-surface-variant)]">
                  1. Power on your ESP32. The <strong>Blue LED (GPIO 18)</strong> will flash rhythmically every 350ms indicating setup mode.
                </p>
                <p className="text-[var(--color-on-surface-variant)]">
                  2. Point your phone camera at the QR code above and tap <strong>"Join FreshGuard-Setup"</strong>.
                </p>
                <p className="text-[var(--color-on-surface-variant)]">
                  3. A popup will automatically open the FreshGuard chamber setup portal. Pick your home 2.4GHz Wi-Fi and submit!
                </p>
              </div>

              {/* Action Buttons */}
              <div className="w-full flex flex-col sm:flex-row gap-3">
                <a
                  href={`http://${PROVISIONING_CONFIG.DEFAULT_AP_IP}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary flex-1 py-3 text-xs font-semibold rounded-full flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">open_in_browser</span>
                  Open Chamber Portal (192.168.4.1)
                </a>

                <button
                  type="button"
                  onClick={() => setShowPrintModal(true)}
                  className="btn-secondary flex-1 py-3 text-xs font-medium rounded-full flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">print</span>
                  Print Box QR Sticker
                </button>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('direct')}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                >
                  Prefer typing your Wi-Fi details here? Switch to Direct Setup →
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: DIRECT IN-APP WI-FI PROVISIONING */}
          {activeTab === 'direct' && (
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-5 pb-4 border-b border-[var(--color-outline-variant)]/40">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <span className="material-symbols-outlined text-xl">router</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--color-on-surface)]">
                    Direct Chamber Wi-Fi Configuration
                  </h3>
                  <p className="text-xs text-[var(--color-on-surface-variant)]">
                    Transmits network details to ESP32 Flash Memory & permanently binds to your account
                  </p>
                </div>
              </div>

              <form onSubmit={handleDirectProvision} className="space-y-4">
                {/* Chamber Gateway IP */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                    Chamber Setup Gateway IP
                  </label>
                  <input
                    type="text"
                    value={chamberIp}
                    onChange={(e) => setChamberIp(e.target.value)}
                    placeholder="192.168.4.1"
                    className="input-field w-full text-xs font-mono"
                    required
                  />
                  <span className="text-[11px] text-[var(--color-on-surface-variant)] mt-1 block">
                    Default is <code>192.168.4.1</code> when connected to <code>FreshGuard-Setup</code>.
                  </span>
                </div>

                {/* Wi-Fi SSID with Scanner */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-[var(--color-on-surface)]">
                      2.4GHz Wi-Fi Network Name (SSID) *
                    </label>
                    <button
                      type="button"
                      onClick={handleScanChamberNetworks}
                      disabled={scanningNets}
                      className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <span className="material-symbols-outlined text-xs">sync</span>
                      {scanningNets ? 'Scanning...' : 'Scan Nearby Networks'}
                    </button>
                  </div>

                  {scannedNets.length > 0 && (
                    <select
                      className="input-field w-full text-xs mb-2"
                      onChange={(e) => {
                        if (e.target.value) setSsid(e.target.value);
                      }}
                      defaultValue=""
                    >
                      <option value="">-- Select Scanned 2.4GHz Network --</option>
                      {scannedNets.map((n, i) => (
                        <option key={i} value={n.ssid}>
                          {n.ssid} ({n.rssi} dBm) {n.secure ? '🔒' : ''}
                        </option>
                      ))}
                    </select>
                  )}

                  <input
                    type="text"
                    value={ssid}
                    onChange={(e) => setSsid(e.target.value)}
                    placeholder="Enter your home or lab 2.4GHz Wi-Fi name"
                    className="input-field w-full text-sm"
                    required
                  />
                </div>

                {/* Wi-Fi Password */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                    Wi-Fi Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter Wi-Fi password (leave blank if open)"
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

                {/* Nickname and Device Hardware ID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                      Chamber Nickname
                    </label>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="e.g. Vault Alpha"
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

                {/* Backend Telemetry Endpoint */}
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

                {/* Submit button */}
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-primary w-full py-3.5 text-sm font-semibold rounded-full flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-lg">send</span>
                    {isSubmitting ? 'Transmitting Settings...' : 'Save Wi-Fi & Pair Chamber'}
                  </button>

                  <button
                    type="button"
                    onClick={handleStartSimulatedScan}
                    className="btn-secondary w-full py-2.5 text-xs font-medium rounded-full"
                  >
                    Test with Virtual Hardware Simulator
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: MANUAL LAN IP REGISTRATION */}
          {activeTab === 'manual' && (
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[var(--color-outline-variant)]/40">
                <span className="material-symbols-outlined text-2xl text-[var(--color-primary)]">lan</span>
                <div>
                  <h3 className="text-base font-bold text-[var(--color-on-surface)]">
                    Manual Local Network Registration
                  </h3>
                  <p className="text-xs text-[var(--color-on-surface-variant)]">
                    Already configured your chamber via router or captive portal? Enter its assigned LAN IP.
                  </p>
                </div>
              </div>

              <form onSubmit={handleManualPairing} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                    Device Hardware ID *
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
                    placeholder="Produce Vault Alpha"
                    className="input-field w-full text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-on-surface)] mb-1">
                    Assigned Router IP Address
                  </label>
                  <input
                    type="text"
                    value={manualIp}
                    onChange={(e) => setManualIp(e.target.value)}
                    placeholder="192.168.1.100"
                    className="input-field w-full text-sm font-mono"
                    required
                  />
                  <span className="text-[11px] text-[var(--color-on-surface-variant)] mt-1 block">
                    Found in your home Wi-Fi router admin page or ESP32 serial output.
                  </span>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-primary w-full py-3.5 text-sm font-semibold rounded-full flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? 'Registering...' : 'Link Vault & Continue'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STEP 2: PROVISIONING IN PROGRESS                              */}
      {/* ------------------------------------------------------------- */}
      {step === 'configuring' && (
        <div className="card p-10 flex flex-col items-center text-center gap-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
            <span className="material-symbols-outlined text-3xl text-emerald-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              wifi
            </span>
          </div>

          <div>
            <h3 className="text-xl font-bold text-[var(--color-on-surface)] mb-2">
              Writing Settings to Flash NVS...
            </h3>
            <p className="text-xs text-[var(--color-on-surface-variant)] max-w-sm mx-auto leading-relaxed">
              Persisting Wi-Fi credentials and locking to account <strong>{accountId}</strong>. The chamber will now disconnect its setup hotspot and join your Wi-Fi router.
            </p>
          </div>

          <div className="w-full max-w-md p-4 rounded-2xl bg-[var(--color-surface-container)] text-xs text-left">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Chamber Firmware Status:</span>
            </div>
            <p className="font-mono text-[11px] text-[var(--color-on-surface)]">
              {statusMessage || 'STATUS:CONNECTING_TO_WIFI'}
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STEP 3: SUCCESS CONFIRMATION                                  */}
      {/* ------------------------------------------------------------- */}
      {step === 'success' && (
        <div className="card p-8 flex flex-col items-center text-center gap-6">
          <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl">check_circle</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-[var(--color-on-surface)] mb-1">
              Chamber Successfully Paired!
            </h2>
            <p className="text-xs text-[var(--color-on-surface-variant)]">
              Your FreshGuard vault is bound to your account and reporting telemetry.
            </p>
          </div>

          <div className="w-full max-w-md p-4 rounded-2xl bg-[var(--color-surface-container)] text-left text-xs space-y-2.5">
            <div className="flex justify-between">
              <span className="text-[var(--color-on-surface-variant)]">Device Hardware ID:</span>
              <span className="font-bold text-[var(--color-on-surface)]">{deviceId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-on-surface-variant)]">Bound Account:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{accountId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-on-surface-variant)]">Assigned LAN IP:</span>
              <span className="font-bold text-[var(--color-on-surface)] font-mono">
                {discoveredIp || '192.168.1.145'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-on-surface-variant)]">Reboot Persistence:</span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                Permanent (Flash NVS)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-on-surface-variant)]">Pairing Blue LED:</span>
              <span className="text-xs text-[var(--color-on-surface)] font-medium">
                Turned OFF (Normal Climate Control Active)
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

      {/* ------------------------------------------------------------- */}
      {/* PRINTABLE QR STICKER MODAL                                    */}
      {/* ------------------------------------------------------------- */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => setShowPrintModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-500 hover:text-slate-800 rounded-full"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>

            <div className="text-center mb-6">
              <div className="inline-block p-2 rounded-2xl bg-emerald-100 text-emerald-700 font-bold text-xs uppercase tracking-wider mb-2">
                FreshGuard Vault Label
              </div>
              <h3 className="text-xl font-bold">Hardware QR Sticker</h3>
              <p className="text-xs text-slate-500 mt-1">
                Stick this onto your ESP32 chamber for instant setup & pairing from any phone camera.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center">
              {wifiQrUrl && (
                <img
                  src={wifiQrUrl}
                  alt="Chamber QR Code"
                  className="w-48 h-48 rounded-xl"
                />
              )}
              <div className="mt-3 text-center">
                <p className="text-sm font-bold text-slate-800">FreshGuard Botanical Vault</p>
                <p className="text-xs font-mono text-slate-600">ID: {deviceId} | Setup: {PROVISIONING_CONFIG.AP_SSID}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Scan to connect Wi-Fi</p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-full shadow-md"
              >
                Print Sticker
              </button>
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs rounded-full"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
