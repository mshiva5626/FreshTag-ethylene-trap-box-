import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ConsumedItem {
  id: string;
  name: string;
  emoji: string;
  grams: number;
  calories: number;
  vitaminC_mg: number;
  fiber_g: number;
  potassium_mg: number;
  antioxidantScore: number;
  timestamp: string;
  fromChamber?: boolean;
}

export interface NutrientGoals {
  produceGrams: number;     // e.g. 400g (WHO standard)
  calories: number;         // e.g. 350 kcal from fresh produce
  vitaminC_mg: number;      // e.g. 90 mg
  fiber_g: number;          // e.g. 28 g
  potassium_mg: number;     // e.g. 3400 mg
  antioxidants: number;     // e.g. 5000 ORAC units
}

interface DietState {
  goals: NutrientGoals;
  logs: ConsumedItem[];
  streakDays: number;
  lastLogDate: string | null;

  // Actions
  logItem: (item: Omit<ConsumedItem, 'id' | 'timestamp'>) => void;
  removeLog: (id: string) => void;
  resetToday: () => void;
  updateGoals: (newGoals: Partial<NutrientGoals>) => void;
}

const DEFAULT_GOALS: NutrientGoals = {
  produceGrams: 400,
  calories: 320,
  vitaminC_mg: 90,
  fiber_g: 28,
  potassium_mg: 3400,
  antioxidants: 5000,
};

const INITIAL_DEMO_LOGS: ConsumedItem[] = [
  {
    id: 'demo-1',
    name: 'Honeycrisp Apple',
    emoji: '🍎',
    grams: 180,
    calories: 95,
    vitaminC_mg: 14,
    fiber_g: 4.4,
    potassium_mg: 195,
    antioxidantScore: 2100,
    timestamp: 'Today, 8:30 AM',
    fromChamber: true,
  },
  {
    id: 'demo-2',
    name: 'Alphonso Mango Slice',
    emoji: '🥭',
    grams: 120,
    calories: 72,
    vitaminC_mg: 44,
    fiber_g: 2.1,
    potassium_mg: 202,
    antioxidantScore: 1850,
    timestamp: 'Today, 11:15 AM',
    fromChamber: true,
  },
];

export const useDietStore = create<DietState>()(
  persist(
    (set, get) => ({
      goals: DEFAULT_GOALS,
      logs: INITIAL_DEMO_LOGS,
      streakDays: 7,
      lastLogDate: new Date().toISOString().split('T')[0],

      logItem: (itemData) => {
        const newItem: ConsumedItem = {
          ...itemData,
          id: 'item-' + Date.now(),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        const today = new Date().toISOString().split('T')[0];
        const prevDate = get().lastLogDate;
        let streak = get().streakDays;

        if (prevDate !== today) {
          streak += 1;
        }

        set((state) => ({
          logs: [newItem, ...state.logs],
          streakDays: streak,
          lastLogDate: today,
        }));
      },

      removeLog: (id) => {
        set((state) => ({
          logs: state.logs.filter((log) => log.id !== id),
        }));
      },

      resetToday: () => {
        set({ logs: [] });
      },

      updateGoals: (newGoals) => {
        set((state) => ({
          goals: { ...state.goals, ...newGoals },
        }));
      },
    }),
    {
      name: 'freshguard-diet-storage',
    }
  )
);
