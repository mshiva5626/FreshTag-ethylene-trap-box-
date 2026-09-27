import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function SplashScreen() {
  const { token, hasSeenOnboarding } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => {
      if (token) {
        navigate('/app/dashboard', { replace: true })
      } else if (hasSeenOnboarding) {
        navigate('/login', { replace: true })
      } else {
        navigate('/onboarding', { replace: true })
      }
    }, 2200)
    return () => clearTimeout(timer)
  }, [token, hasSeenOnboarding, navigate])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-surface)] px-6 relative overflow-hidden">
      {/* Ambient botanical glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-[var(--color-secondary-container)] opacity-25 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-[var(--color-primary-container)] opacity-20 rounded-full blur-2xl" />
      </div>

      {/* Logo card */}
      <div className="relative z-10 flex flex-col items-center gap-6 animate-[fadeUp_0.6s_ease-out_both]">
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-[var(--color-surface-container-lowest)] shadow-[var(--shadow-raised)] flex items-center justify-center p-3">
            {/* FreshGuard leaf icon */}
            <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
              <rect width="64" height="64" rx="20" fill="#F5A623" fillOpacity="0.12"/>
              <path d="M32 8C18 8 10 22 10 34c0 10 8 22 22 22 14 0 22-12 22-22C54 22 46 8 32 8z" fill="#4CAF50" fillOpacity="0.9"/>
              <path d="M32 14v30M32 14c0 0 10 8 10 20M32 14c0 0-10 8-10 20" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="32" cy="44" r="4" fill="#F5A623"/>
            </svg>
          </div>
          {/* Green pulse dot */}
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--color-secondary)] rounded-full shadow">
            <div className="absolute inset-0 bg-[var(--color-secondary)] rounded-full animate-ping opacity-75" />
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-[32px] font-bold leading-tight text-[var(--color-on-surface)] tracking-tight">
            FreshGuard
          </h1>
          <div className="flex items-center gap-1.5 justify-center mt-1.5 px-3 py-0.5 rounded-full bg-[var(--color-secondary-container)] bg-opacity-40 mx-auto w-fit">
            <span className="material-symbols-outlined text-[var(--color-secondary)] text-sm">eco</span>
            <span className="text-[11px] font-semibold text-[var(--color-on-secondary-container)] uppercase tracking-wider">
              Active Ethylene Absorption
            </span>
          </div>
        </div>
      </div>

      {/* Loading dots */}
      <div className="absolute bottom-16 flex items-center gap-2">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-[var(--color-primary-container)]"
            style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
