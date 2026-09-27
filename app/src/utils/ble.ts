/**
 * Legacy BLE Adapter - Deprecated & Replaced with Wi-Fi SoftAP / QR Provisioning
 * Preserved for backward-compatibility.
 */

export const BLE_CONFIG = {
  DEVICE_NAME: 'FreshGuard-Setup',
  ALT_DEVICE_NAME: 'FreshGuard-Vault',
  SERVICE_UUID: 'disabled',
  CHAR_CONFIG_UUID: 'disabled',
  CHAR_STATUS_UUID: 'disabled',
};

export interface BleConnection {
  device: any;
  server?: any;
  service?: any;
  configChar?: any;
  statusChar?: any;
}

export interface WiFiProvisionPayload {
  ssid: string;
  password?: string;
  server?: string;
  device_id: string;
  account_id: string;
  nickname?: string;
}

export interface BleParsedStatus {
  raw: string;
  type: 'CONNECTING' | 'CONNECTED' | 'WIFI_FAILED' | 'AWAITING_CONFIG' | 'UNPAIRED' | 'UNKNOWN';
  ip?: string;
  accountId?: string;
  message?: string;
}

export function isWebBluetoothSupported(): boolean {
  return false;
}

export async function connectBleVault(
  _onStatusChange?: (status: BleParsedStatus) => void
): Promise<BleConnection> {
  throw new Error('Bluetooth has been replaced by Wi-Fi SoftAP & QR code provisioning.');
}

export async function sendWiFiConfig(
  _configChar: any,
  _payload: WiFiProvisionPayload
): Promise<void> {
  throw new Error('Bluetooth has been replaced by Wi-Fi SoftAP & QR code provisioning.');
}

export function parseBleStatus(statusStr: string): BleParsedStatus {
  return {
    raw: statusStr,
    type: 'UNKNOWN',
    message: statusStr,
  };
}
