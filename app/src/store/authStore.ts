import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  id: string
  account_id?: string
  name: string
  email: string
  phone?: string
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  error: string | null
  hasSeenOnboarding: boolean

  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, phone: string, password: string) => Promise<void>
  logout: () => void
  clearError: () => void
  setOnboardingSeen: () => void
}

// ── Mock API ──────────────────────────────────────────────────────────────────
const MOCK_DELAY = 1200

const mockUsers: Record<string, { password: string; user: User }> = {
  'demo@freshguard.app': {
    password: 'password123',
    user: { id: 'user_001', account_id: 'mshiva5626', name: 'Demo User', email: 'demo@freshguard.app', phone: '+91 9876543210' },
  },
}

function makeMockToken(user: User): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({ sub: user.id, email: user.email, exp: Date.now() + 86400000 }))
  return `${header}.${payload}.mock_signature`
}

async function apiLogin(email: string, password: string): Promise<{ token: string; user: User }> {
  await new Promise(r => setTimeout(r, MOCK_DELAY))
  const record = mockUsers[email.toLowerCase()]
  if (!record || record.password !== password) {
    throw new Error('Invalid email or password')
  }
  return { token: makeMockToken(record.user), user: record.user }
}

async function apiRegister(
  name: string, email: string, phone: string, password: string
): Promise<{ token: string; user: User }> {
  await new Promise(r => setTimeout(r, MOCK_DELAY))
  if (mockUsers[email.toLowerCase()]) {
    throw new Error('An account with this email already exists')
  }
  const user: User = {
    id: `user_${Date.now()}`,
    name,
    email: email.toLowerCase(),
    phone,
  }
  mockUsers[email.toLowerCase()] = { password, user }
  return { token: makeMockToken(user), user }
}
// ─────────────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isLoading: false,
      error: null,
      hasSeenOnboarding: false,

      login: async (email, password) => {
        set({ isLoading: true, error: null })
        try {
          const { token, user } = await apiLogin(email, password)
          set({ token, user, isLoading: false })
        } catch (e) {
          set({ error: (e as Error).message, isLoading: false })
        }
      },

      register: async (name, email, phone, password) => {
        set({ isLoading: true, error: null })
        try {
          const { token, user } = await apiRegister(name, email, phone, password)
          set({ token, user, isLoading: false })
        } catch (e) {
          set({ error: (e as Error).message, isLoading: false })
        }
      },

      logout: () => set({ user: null, token: null }),
      clearError: () => set({ error: null }),
      setOnboardingSeen: () => set({ hasSeenOnboarding: true }),
    }),
    {
      name: 'freshguard-auth',
      partialize: (s) => ({
        token: s.token,
        user: s.user,
        hasSeenOnboarding: s.hasSeenOnboarding,
      }),
    }
  )
)
