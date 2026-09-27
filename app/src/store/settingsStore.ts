import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getBackendUrl } from '../utils/backendUrl';

export interface NotificationPreferences {
  pushAlerts: boolean;
  emailSummaries: boolean;
  criticalExcursions: boolean;
  doorOpenProlonged: boolean;
  filterSchedule: boolean;
}

interface SettingsState {
  temperatureUnit: 'C' | 'F';
  planTier: 'free' | 'premium';
  notificationPrefs: NotificationPreferences;
  networkLatencyMs: number | null;
  lastNetworkCheck: string | null;

  setTemperatureUnit: (unit: 'C' | 'F') => void;
  setPlanTier: (tier: 'free' | 'premium') => void;
  updateNotificationPrefs: (prefs: Partial<NotificationPreferences>) => void;
  formatTemp: (celsius: number | null | undefined) => string;
  convertTemp: (celsius: number) => number;
  testNetworkLatency: () => Promise<number | null>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      temperatureUnit: 'C',
      planTier: 'free',
      notificationPrefs: {
        pushAlerts: true,
        emailSummaries: true,
        criticalExcursions: true,
        doorOpenProlonged: true,
        filterSchedule: true,
      },
      networkLatencyMs: null,
      lastNetworkCheck: null,

      setTemperatureUnit: (unit: 'C' | 'F') => {
        set({ temperatureUnit: unit });
      },

      setPlanTier: (tier: 'free' | 'premium') => {
        set({ planTier: tier });
      },

      updateNotificationPrefs: (prefs: Partial<NotificationPreferences>) => {
        set((state) => ({
          notificationPrefs: { ...state.notificationPrefs, ...prefs },
        }));
      },

      convertTemp: (celsius: number) => {
        if (get().temperatureUnit === 'F') {
          return Math.round((celsius * (9 / 5) + 32) * 10) / 10;
        }
        return Math.round(celsius * 10) / 10;
      },

      formatTemp: (celsius: number | null | undefined) => {
        if (celsius === null || celsius === undefined || isNaN(celsius)) {
          return '—';
        }
        const unit = get().temperatureUnit;
        if (unit === 'F') {
          const fahrenheit = Math.round((celsius * (9 / 5) + 32) * 10) / 10;
          return `${fahrenheit}°F`;
        }
        return `${Math.round(celsius * 10) / 10}°C`;
      },

      testNetworkLatency: async () => {
        const start = performance.now();
        try {
          const backendUrl = getBackendUrl();
          const res = await fetch(`${backendUrl}/api/health`, { method: 'GET', cache: 'no-cache' });
          const latency = Math.round(performance.now() - start);
          if (res.ok) {
            set({ networkLatencyMs: latency, lastNetworkCheck: new Date().toISOString() });
            return latency;
          }
          set({ networkLatencyMs: null, lastNetworkCheck: new Date().toISOString() });
          return null;
        } catch {
          set({ networkLatencyMs: null, lastNetworkCheck: new Date().toISOString() });
          return null;
        }
      },
    }),
    {
      name: 'freshguard_settings',
    }
  )
);
