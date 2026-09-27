import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const DESKTOP_NAV_ITEMS = [
  { to: '/app/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/app/devices', icon: 'inventory_2', label: 'Chambers' },
  { to: '/app/fruits', icon: 'nutrition', label: 'Fruit Profiles' },
  { to: '/app/automation', icon: 'tune', label: 'Automation' },
  { to: '/app/alerts', icon: 'notifications', label: 'Safety Alerts', hasBadge: true },
  { to: '/app/analytics', icon: 'analytics', label: 'Analytics' },
  { to: '/app/profile', icon: 'person', label: 'Account' },
]

const MOBILE_NAV_ITEMS = [
  { to: '/app/dashboard', icon: 'dashboard', label: 'Home' },
  { to: '/app/fruits', icon: 'nutrition', label: 'Profiles' },
  { to: '/app/automation', icon: 'tune', label: 'Automation' },
  { to: '/app/alerts', icon: 'notifications', label: 'Alerts', hasBadge: true },
  { to: '/app/analytics', icon: 'analytics', label: 'Analytics' },
]

export default function AppShell() {
  const { user, token, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen w-full bg-[var(--color-surface)] overflow-hidden">
      {/* ── Desktop sidebar (≥1024px) ── */}
      <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-[var(--color-surface-container-lowest)] border-r border-[var(--color-outline-variant)] py-6 px-4">
        {/* Brand */}
        <div className="flex items-center gap-3 px-2 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-container)] flex items-center justify-center shadow">
            <span className="material-symbols-outlined text-[var(--color-on-primary-fixed)] text-xl">eco</span>
          </div>
          <div>
            <p className="font-bold text-base leading-tight text-[var(--color-on-surface)]">FreshGuard</p>
            <p className="text-[11px] text-[var(--color-on-surface-variant)]">Botanical Precision Storage</p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 flex flex-col gap-1">
          {DESKTOP_NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-fixed)] shadow-sm'
                    : 'text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] hover:text-[var(--color-on-surface)]'
                }`
              }
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-xl">{item.icon}</span>
                {item.label}
              </div>
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-[var(--color-outline-variant)] pt-4 mt-4">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-9 h-9 rounded-full bg-[var(--color-secondary-container)] flex items-center justify-center">
              <span className="text-sm font-bold text-[var(--color-on-secondary-container)]">
                {user?.name?.[0]?.toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--color-on-surface)] truncate">{user?.name}</p>
              <p className="text-xs text-[var(--color-on-surface-variant)] truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 w-full rounded-xl text-sm font-semibold text-[var(--color-tertiary)] hover:bg-[var(--color-tertiary-container)] transition-all"
          >
            <span className="material-symbols-outlined text-xl">logout</span>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content area ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-[var(--color-primary-container)] flex items-center justify-center">
              <span className="material-symbols-outlined text-base text-[var(--color-on-primary-fixed)]">eco</span>
            </div>
            <span className="font-bold text-sm text-[var(--color-on-surface)]">FreshGuard</span>
          </div>

          <div className="flex items-center gap-2">
            <NavLink
              to="/app/devices"
              aria-label="View paired chambers"
              className="p-2 rounded-lg text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)] min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Paired Chambers"
            >
              <span className="material-symbols-outlined text-xl">inventory_2</span>
            </NavLink>
            <NavLink
              to="/app/profile"
              aria-label="View account profile and settings"
              className="w-8 h-8 rounded-full bg-[var(--color-secondary-container)] flex items-center justify-center text-xs font-bold text-[var(--color-on-secondary-container)]"
            >
              {user?.name?.[0]?.toUpperCase() ?? 'U'}
            </NavLink>
          </div>
        </header>

        {/* Desktop top bar */}
        <header className="hidden lg:flex items-center justify-between px-6 py-4 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)]">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-[var(--color-on-surface)]">Botanical Precision Dashboard</h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-[var(--color-on-surface-variant)]">
            <div className="flex items-center gap-1.5 text-xs bg-[var(--color-surface-container)] px-3 py-1.5 rounded-full border border-[var(--color-outline-variant)]/40">
              <span className="material-symbols-outlined text-sm text-[var(--color-secondary)]">wifi</span>
              Away — cloud telemetry
            </div>
          </div>
        </header>

        {/* Page content — scrollable */}
        <div className="flex-1 overflow-y-auto pb-20 lg:pb-6">
          <Outlet />
        </div>
      </main>

      {/* ── Mobile bottom tab bar ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--color-surface-container-lowest)] border-t border-[var(--color-outline-variant)] flex pb-safe shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
        {MOBILE_NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center pt-2 pb-1 gap-0.5 transition-all ${
                isActive
                  ? 'text-[var(--color-primary)]'
                  : 'text-[var(--color-on-surface-variant)]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative">
                  <span
                    className={`material-symbols-outlined text-2xl transition-all ${
                      isActive ? 'text-[var(--color-primary)]' : ''
                    }`}
                    style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {item.icon}
                  </span>
                </div>
                <span className="text-[10px] font-semibold leading-tight">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
