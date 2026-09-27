/**
 * Web Bluetooth API Utility for FreshGuard Vault
 * Matching firmware specifications in esp32_freshguard.ino & PROJECT.md
 */

export const BLE_CONFIG = {
  DEVICE_NAME: 'FreshGuard',
  ALT_DEVICE_NAME: 'FreshGuard-Vault-ESP32',
  SERVICE_UUID: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
  CHAR_CONFIG_UUID: 'beb5483e-36e1-4688-b7f5-ea07361b26a8', // Write JSON
  CHAR_STATUS_UUID: '1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e', // Read / Notify
};

export interface BleConnection {
  device: BluetoothDevice;
  server: BluetoothRemoteGATTServer;
  service: BluetoothRemoteGATTService;
  configChar: BluetoothRemoteGATTCharacteristic;
  statusChar: BluetoothRemoteGATTCharacteristic;
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

/**
 * Check if Web Bluetooth API is supported by the user's browser.
 * Note: Not supported on iOS Safari, Firefox, or insecure HTTP origins.
 */
export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/**
 * Request user to pick the FreshGuard ESP32 device and connect to GATT server
 */
export async function connectBleVault(
  onStatusChange?: (status: BleParsedStatus) => void
): Promise<BleConnection> {
  if (!isWebBluetoothSupported()) {
    throw new Error('Web Bluetooth is not supported in this browser.');
  }

  // Request device with primary service filter
  let device: BluetoothDevice;
  try {
    device = await navigator.bluetooth.requestDevice({
      filters: [
        { name: BLE_CONFIG.DEVICE_NAME },
        { name: BLE_CONFIG.ALT_DEVICE_NAME },
        { services: [BLE_CONFIG.SERVICE_UUID] },
      ],
      optionalServices: [BLE_CONFIG.SERVICE_UUID],
    });
  } catch (err: any) {
    // Fallback: acceptAllDevices if filtered request is rejected
    if (err.name === 'NotFoundError') {
      throw err;
    }
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [BLE_CONFIG.SERVICE_UUID],
    });
  }

  if (!device.gatt) {
    throw new Error('Device does not support GATT server.');
  }

  // Connect to GATT
  const server = await device.gatt.connect();

  // Get FreshGuard Service
  const service = await server.getPrimaryService(BLE_CONFIG.SERVICE_UUID);

  // Get Characteristics
  const configChar = await service.getCharacteristic(BLE_CONFIG.CHAR_CONFIG_UUID);
  const statusChar = await service.getCharacteristic(BLE_CONFIG.CHAR_STATUS_UUID);

  // Enable Notifications on Status Characteristic
  await statusChar.startNotifications();
  statusChar.addEventListener('characteristicvaluechanged', (event: any) => {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const statusStr = decoder.decode(value);
    const parsed = parseBleStatus(statusStr);
    if (onStatusChange) {
      onStatusChange(parsed);
    }
  });

  return {
    device,
    server,
    service,
    configChar,
    statusChar,
  };
}

/**
 * Parse status notifications from ESP32 firmware
 * Examples:
 * - "STATUS:AWAITING_WIFI_CONFIG:ACCOUNT:mshiva5626"
 * - "STATUS:CONNECTING_TO_WIFI:ACCOUNT:mshiva5626"
 * - "STATUS:CONNECTED:192.168.1.145:ACCOUNT:mshiva5626"
 * - "STATUS:WIFI_FAILED:ACCOUNT:mshiva5626"
 */
export function parseBleStatus(statusStr: string): BleParsedStatus {
  const parts = statusStr.split(':');

  if (statusStr.includes('CONNECTED:')) {
    // STATUS:CONNECTED:192.168.1.145:ACCOUNT:...
    const ipIndex = parts.indexOf('CONNECTED') + 1;
    const ip = parts[ipIndex] || '';
    const accIndex = parts.indexOf('ACCOUNT') + 1;
    const accountId = parts[accIndex] || '';

    return {
      raw: statusStr,
      type: 'CONNECTED',
      ip,
      accountId,
      message: `Vault connected to Wi-Fi at IP ${ip}`,
    };
  }

  if (statusStr.includes('CONNECTING_TO_WIFI')) {
    return {
      raw: statusStr,
      type: 'CONNECTING',
      message: 'Chamber is attempting connection to Wi-Fi network...',
    };
  }

  if (statusStr.includes('WIFI_FAILED')) {
    return {
      raw: statusStr,
      type: 'WIFI_FAILED',
      message: 'Wi-Fi connection failed. Please check SSID and password.',
    };
  }

  if (statusStr.includes('AWAITING_WIFI_CONFIG') || statusStr.includes('BOOT_INITIALIZING')) {
    return {
      raw: statusStr,
      type: 'AWAITING_CONFIG',
      message: 'Vault ready for Wi-Fi provisioning credentials.',
    };
  }

  if (statusStr.includes('UNPAIRED')) {
    return {
      raw: statusStr,
      type: 'UNPAIRED',
      message: 'Vault credentials cleared. Ready for new user.',
    };
  }

  return {
    raw: statusStr,
    type: 'UNKNOWN',
    message: statusStr,
  };
}

/**
 * Send JSON credentials to characteristic beb5483e-36e1-4688-b7f5-ea07361b26a8
 */
export async function sendWiFiConfig(
  configChar: BluetoothRemoteGATTCharacteristic,
  payload: WiFiProvisionPayload
): Promise<void> {
  const jsonStr = JSON.stringify({
    ssid: payload.ssid,
    password: payload.password || '',
    server: payload.server || 'http://192.168.1.100:8080/api/telemetry',
    device_id: payload.device_id,
    account_id: payload.account_id,
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(jsonStr);

  await configChar.writeValue(data);
}
