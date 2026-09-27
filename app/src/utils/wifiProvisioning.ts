/**
 * Wi-Fi SoftAP & QR Provisioning Utility for FreshGuard Vault
 * Replaces legacy Bluetooth (BLE) with robust Wi-Fi AP + Captive Portal + QR Pairing.
 */

import QRCode from 'qrcode';

export const PROVISIONING_CONFIG = {
  AP_SSID: 'FreshGuard-Setup',
  AP_PASS: '', // Open network for easy pairing
  DEFAULT_AP_IP: '192.168.4.1',
  DEFAULT_DEVICE_ID: 'SF-001',
  SERVICE_PORT: 80,
};

export interface WiFiProvisionPayload {
  ssid: string;
  password?: string;
  server?: string;
  device_id: string;
  account_id: string;
  nickname?: string;
}

export interface ChamberStatusResponse {
  device_id: string;
  account_id: string;
  configured: boolean;
  ip?: string;
  wifi_rssi?: number;
  door_status?: string;
  state?: string;
  system_mode?: string;
  temperature?: number | null;
  humidity?: number | null;
  gas_level?: number | null;
  [key: string]: any;
}

export interface ScannedNetwork {
  ssid: string;
  rssi: number;
  secure: boolean;
}

/**
 * Generate standard Wi-Fi connection QR code string.
 * Scanning this with any iOS Camera or Android Camera automatically prompts
 * the user to join the "FreshGuard-Setup" Wi-Fi network.
 */
export function getWifiQrString(ssid = PROVISIONING_CONFIG.AP_SSID, pass = PROVISIONING_CONFIG.AP_PASS): string {
  if (!pass) {
    return `WIFI:S:${ssid};T:nopass;;`;
  }
  return `WIFI:S:${ssid};T:WPA;P:${pass};;`;
}

/**
 * Generate direct URL QR code string pointing to ESP32 setup web portal
 */
export function getSetupUrlQrString(accountId: string, deviceId: string, ip = PROVISIONING_CONFIG.DEFAULT_AP_IP): string {
  return `http://${ip}/setup?account=${encodeURIComponent(accountId)}&device=${encodeURIComponent(deviceId)}`;
}

/**
 * Generate a QR Code as Data URL (Base64 PNG)
 */
export async function generateQrDataUrl(text: string, options?: QRCode.QRCodeToDataURLOptions): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 320,
    margin: 2,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
    ...options,
  });
}

/**
 * Check if the ESP32 chamber is reachable at a given IP (defaults to 192.168.4.1)
 */
export async function checkChamberReachable(ip = PROVISIONING_CONFIG.DEFAULT_AP_IP, timeoutMs = 2500): Promise<{ reachable: boolean; status?: ChamberStatusResponse }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`http://${ip}/status`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      mode: 'cors',
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      return { reachable: true, status: data };
    }
    return { reachable: false };
  } catch {
    clearTimeout(timer);
    return { reachable: false };
  }
}

/**
 * Fetch visible 2.4GHz Wi-Fi networks scanned by the ESP32
 */
export async function fetchNearbyNetworks(ip = PROVISIONING_CONFIG.DEFAULT_AP_IP): Promise<ScannedNetwork[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`http://${ip}/scan-wifi`, {
      method: 'GET',
      signal: controller.signal,
      mode: 'cors',
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      return data.networks || [];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Transmit Wi-Fi Credentials & Account Binding to ESP32 Flash Memory
 */
export async function sendWifiCredentials(
  ip: string,
  payload: WiFiProvisionPayload
): Promise<{ success: boolean; message: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(`http://${ip}/api/wifi-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      mode: 'cors',
    });
    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    return {
      success: true,
      message: data.message || 'Credentials saved to Flash. Chamber connecting to Wi-Fi...',
    };
  } catch (err: any) {
    clearTimeout(timer);
    throw new Error(err.message || 'Failed to transmit Wi-Fi settings to chamber');
  }
}
