import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getBackendUrl } from '../utils/backendUrl';

const BACKEND_URL = getBackendUrl();

export interface TelemetryReading {
  id?: number;
  device_id: string;
  account_id: string;
  door_status: 'OPEN' | 'CLOSED';
  state: 'NORMAL' | 'DOOR_OPEN' | 'WAIT_5_SECONDS' | 'RESTART' | 'ALERT';
  dht_exists: boolean;
  gas_exists: boolean;
  door_exists: boolean;
  temperature: number | null;
  humidity: number | null;
  gas_level: number | null;
  system_mode: 'AUTO' | 'MANUAL';
  inlet_fan: 'ON' | 'OFF';
  outlet_fan: 'ON' | 'OFF';
  humidifier: 'ON' | 'OFF';
  blue_led: 'ON' | 'OFF';
  white_led: 'ON' | 'OFF';
  created_at: string;
}

export interface DeviceThresholds {
  temp_min: number;
  temp_max: number;
  humidity_min: number;
  humidity_max: number;
  gas_threshold: number;
}

export interface DeviceItem {
  device_id: string;
  account_id: string;
  nickname: string;
  thresholds: DeviceThresholds;
  granule_interval_days?: number;
  granule_last_replaced?: string;
  latest_reading?: TelemetryReading | null;
  created_at?: string;
  updated_at?: string;
}

interface DeviceState {
  devices: DeviceItem[];
  latestReadings: Record<string, TelemetryReading>;
  history: Record<string, TelemetryReading[]>;
  localIps: Record<string, string>;
  localReachability: Record<string, boolean>;
  isLoading: boolean;
  error: string | null;

  fetchDevices: (token: string) => Promise<void>;
  fetchLatest: (deviceId: string, token: string) => Promise<TelemetryReading | null>;
  fetchHistory: (deviceId: string, token: string, limit?: number, from?: string, to?: string) => Promise<void>;
  handleTelemetryUpdate: (reading: TelemetryReading) => void;
  registerDevice: (token: string, payload: { device_id: string; nickname?: string; localIp?: string }) => Promise<void>;
  updateThresholds: (token: string, deviceId: string, thresholds: Partial<DeviceThresholds> & { nickname?: string; granule_interval_days?: number; granule_last_replaced?: string }) => Promise<void>;
  unpairDevice: (token: string, deviceId: string) => Promise<{ localWiped: boolean }>;
  setLocalIp: (deviceId: string, ip: string) => void;
  checkLocalReachability: (deviceId: string) => Promise<boolean>;
  sendLocalControl: (deviceId: string, payload: {
    mode?: 'AUTO' | 'MANUAL';
    inlet_fan?: boolean | 'ON' | 'OFF';
    outlet_fan?: boolean | 'ON' | 'OFF';
    humidifier?: boolean | 'ON' | 'OFF';
    white_led?: boolean | 'ON' | 'OFF';
    blue_led?: boolean | 'ON' | 'OFF';
  }) => Promise<{ success: boolean; error?: string }>;
}

export const useDeviceStore = create<DeviceState>()(
  persist(
    (set, get) => ({
      devices: [],
      latestReadings: {},
      history: {},
      localIps: {
        'SF-001': '192.168.1.100', // Default initial fallback
      },
      localReachability: {},
      isLoading: false,
      error: null,

      fetchDevices: async (token: string) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(`${BACKEND_URL}/api/devices`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const devs: DeviceItem[] = data.devices || [];

          const newLatest: Record<string, TelemetryReading> = { ...get().latestReadings };
          devs.forEach((d) => {
            if (d.latest_reading) {
              newLatest[d.device_id] = d.latest_reading;
            }
          });

          set({ devices: devs, latestReadings: newLatest, isLoading: false });
        } catch (err: any) {
          console.warn('[DeviceStore] Failed to fetch devices from backend:', err.message);
          set({ isLoading: false, error: err.message });
        }
      },

      fetchLatest: async (deviceId: string, token: string) => {
        try {
          const res = await fetch(`${BACKEND_URL}/api/devices/${deviceId}/latest`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return null;
          const data = await res.json();
          if (data.reading) {
            set((state) => ({
              latestReadings: { ...state.latestReadings, [deviceId]: data.reading },
            }));
            return data.reading;
          }
          return null;
        } catch (err: any) {
          console.warn(`[DeviceStore] Failed to fetch latest for ${deviceId}:`, err.message);
          return null;
        }
      },

      fetchHistory: async (deviceId: string, token: string, limit: number = 60, from?: string, to?: string) => {
        try {
          let url = `${BACKEND_URL}/api/devices/${deviceId}/history?limit=${limit}`;
          if (from) url += `&from=${encodeURIComponent(from)}`;
          if (to) url += `&to=${encodeURIComponent(to)}`;

          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return;
          const data = await res.json();
          if (Array.isArray(data.history)) {
            // Sort chronologically ascending for charts
            const sorted = [...data.history].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            set((state) => ({
              history: { ...state.history, [deviceId]: sorted },
            }));
          }
        } catch (err: any) {
          console.warn(`[DeviceStore] Failed to fetch history for ${deviceId}:`, err.message);
        }
      },

      handleTelemetryUpdate: (reading: TelemetryReading) => {
        const id = reading.device_id;
        set((state) => {
          const existingHistory = state.history[id] || [];
          const updatedHistory = [...existingHistory, reading].slice(-100); // keep last 100 in memory

          return {
            latestReadings: {
              ...state.latestReadings,
              [id]: reading,
            },
            history: {
              ...state.history,
              [id]: updatedHistory,
            },
          };
        });
      },

      registerDevice: async (token: string, payload) => {
        const res = await fetch(`${BACKEND_URL}/api/devices`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            device_id: payload.device_id,
            nickname: payload.nickname || 'FreshGuard Vault',
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || 'Failed to register device');
        }

        if (payload.localIp) {
          get().setLocalIp(payload.device_id, payload.localIp);
        }

        await get().fetchDevices(token);
      },

      updateThresholds: async (token: string, deviceId: string, thresholds) => {
        const res = await fetch(`${BACKEND_URL}/api/devices/${deviceId}/thresholds`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(thresholds),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || 'Failed to update thresholds');
        }
        await get().fetchDevices(token);
      },

      unpairDevice: async (token: string, deviceId: string) => {
        let localWiped = false;
        const ip = get().localIps[deviceId];
        if (ip) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1800);
            const res = await fetch(`http://${ip}/unpair`, {
              method: 'POST',
              signal: controller.signal,
              mode: 'cors',
            });
            clearTimeout(timeoutId);
            if (res.ok) {
              localWiped = true;
            }
          } catch {
            console.warn(`[DeviceStore] Local /unpair not reachable for ${deviceId} at ${ip}. Proceeding with cloud unpair.`);
          }
        }

        // Call backend unpair
        const res = await fetch(`${BACKEND_URL}/api/devices/${deviceId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Failed to unpair device on backend');
        }

        // Clean up store state
        set((state) => {
          const newHistory = { ...state.history };
          delete newHistory[deviceId];
          const newLatest = { ...state.latestReadings };
          delete newLatest[deviceId];
          const newIps = { ...state.localIps };
          delete newIps[deviceId];
          const newReach = { ...state.localReachability };
          delete newReach[deviceId];

          return {
            history: newHistory,
            latestReadings: newLatest,
            localIps: newIps,
            localReachability: newReach,
          };
        });

        await get().fetchDevices(token);
        return { localWiped };
      },

      setLocalIp: (deviceId: string, ip: string) => {
        set((state) => ({
          localIps: { ...state.localIps, [deviceId]: ip.trim() },
        }));
      },

      checkLocalReachability: async (deviceId: string): Promise<boolean> => {
        const ip = get().localIps[deviceId];
        if (!ip) {
          set((state) => ({
            localReachability: { ...state.localReachability, [deviceId]: false },
          }));
          return false;
        }

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1800);

          const res = await fetch(`http://${ip}/status`, {
            signal: controller.signal,
            mode: 'cors',
          });
          clearTimeout(timeoutId);

          const reachable = res.ok;
          set((state) => ({
            localReachability: { ...state.localReachability, [deviceId]: reachable },
          }));
          return reachable;
        } catch {
          set((state) => ({
            localReachability: { ...state.localReachability, [deviceId]: false },
          }));
          return false;
        }
      },

      sendLocalControl: async (deviceId: string, payload) => {
        const ip = get().localIps[deviceId];
        if (!ip) {
          return {
            success: false,
            error: "No local IP address configured for this chamber. Reconnect on box's Wi-Fi network.",
          };
        }

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);

          const res = await fetch(`http://${ip}/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!res.ok) {
            throw new Error(`Device responded with ${res.status}`);
          }

          // Optimistically update reachability
          set((state) => ({
            localReachability: { ...state.localReachability, [deviceId]: true },
          }));

          return { success: true };
        } catch (err: any) {
          console.warn('[LocalControl Error]:', err.message);
          set((state) => ({
            localReachability: { ...state.localReachability, [deviceId]: false },
          }));
          return {
            success: false,
            error: "Away — monitoring only, reconnect to box's Wi-Fi to control.",
          };
        }
      },
    }),
    {
      name: 'freshguard-device-storage',
      partialize: (state) => ({
        localIps: state.localIps,
      }),
    }
  )
);
