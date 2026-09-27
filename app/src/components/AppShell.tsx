import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const DESKTOP_NAV_ITEMS = [
  { to: '/app/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/app/scanner', icon: 'center_focus_strong', label: 'Nutrition Scanner' },
  { to: '/app/diet', icon: 'nutrition', label: 'Diet & Completion' },
  { to: '/app/devices', icon: 'inventory_2', label: 'Chambers' },
  { to: '/app/fruits', icon: 'spa', label: 'Botanical Presets' },
  { to: '/app/automation', icon: 'tune', label: 'Automation & Scrubbers' },
  { to: '/app/alerts', icon: 'notifications', label: 'Safety Alerts', hasBadge: true },
  { to: '/app/analytics', icon: 'analytics', label: 'Analytics' },
  { to: '/app/profile', icon: 'person', label: 'Account' },
];

const MOBILE_NAV_ITEMS = [
  { to: '/app/dashboard', icon: 'dashboard', label: 'Vaults' },
  { to: '/app/scanner', icon: 'center_focus_strong', label: 'Scanner' },
  { to: '/app/diet', icon: 'nutrition', label: 'Diet' },
  { to: '/app/fruits', icon: 'spa', label: 'Presets' },
  { to: '/app/alerts', icon: 'notifications', label: 'Alerts', hasBadge: true },
];

export default function AppShell() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen w-full bg-[var(--color-surface)] overflow-hidden">
      {/* ── Desktop sidebar (≥1024px) ── */}
      <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-white/80 backdrop-blur-md border-r border-[#e1e7dc] py-6 px-4 z-20">
        {/* Brand */}
        <div className="flex items-center gap-3 px-2 mb-7">
          <div className="w-10 h-10 rounded-2xl overflow-hidden border border-[#fbd3b9] shadow-[0_6px_16px_rgba(230,106,38,0.25)] shrink-0 bg-[#ffede0]">
            <img src="/assets/fruits/apple.jpg" alt="FreshGuard" className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="font-extrabold text-base leading-tight text-[#1e241c] tracking-tight">FreshGuard</p>
            <p className="text-[11px] text-[#596155] font-medium">Botanical Precision Storage</p>
          </div>
        </div>

        {/* Quick Scan Action CTA */}
        <div className="px-1 mb-5">
          <button
            onClick={() => navigate('/app/scanner')}
            className="btn-terracotta w-full py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm"
          >
            <span className="material-symbols-outlined text-base">center_focus_strong</span>
            Scan Produce
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 flex flex-col gap-1 overflow-y-auto pr-1 scrollbar-none">
          {DESKTOP_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-[#ffede0] text-[#e66a26] shadow-sm'
                    : 'text-[#596155] hover:bg-[#edf1e8] hover:text-[#1e241c]'
                }`
              }
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-xl">{item.icon}</span>
                {item.label}
              </div>
              {item.hasBadge && (
                <span className="w-2 h-2 rounded-full bg-[#c43828] animate-pulse" />
              )}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-[#e1e7dc] pt-4 mt-3">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-9 h-9 rounded-2xl bg-[#e8f3e5] flex items-center justify-center">
              <span className="text-xs font-bold text-[#3b6b32]">
                {user?.name?.[0]?.toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#1e241c] truncate">{user?.name}</p>
              <p className="text-[10px] text-[#596155] truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 w-full rounded-xl text-xs font-semibold text-[#c43828] hover:bg-[#fde8e5] transition-all"
          >
            <span className="material-symbols-outlined text-base">logout</span>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content area ── */}
      <main className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-[#e1e7dc] bg-white/90 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl overflow-hidden border border-[#fbd3b9] shadow-xs shrink-0 bg-[#ffede0]">
              <img src="/assets/fruits/apple.jpg" alt="FreshGuard" className="w-full h-full object-cover" />
            </div>
            <span className="font-extrabold text-sm text-[#1e241c]">FreshGuard</span>
          </div>

          <div className="flex items-center gap-2">
            <NavLink
              to="/app/scanner"
              aria-label="Scan produce"
              className="p-2 rounded-xl text-[#e66a26] bg-[#ffede0] min-h-[38px] min-w-[38px] flex items-center justify-center shadow-xs"
              title="Nutrition Scanner"
            >
              <span className="material-symbols-outlined text-lg">center_focus_strong</span>
            </NavLink>
            <NavLink
              to="/app/profile"
              aria-label="View account profile"
              className="w-8 h-8 rounded-full bg-[#e8f3e5] flex items-center justify-center text-xs font-bold text-[#3b6b32]"
            >
              {user?.name?.[0]?.toUpperCase() ?? 'U'}
            </NavLink>
          </div>
        </header>

        {/* Desktop top bar */}
        <header className="hidden lg:flex items-center justify-between px-8 py-4 border-b border-[#e1e7dc] bg-white/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-extrabold text-[#1e241c]">
              Autonomous Botanical Precision Storage
            </h1>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#596155]">
            <div className="flex items-center gap-1.5 bg-[#edf1e8] px-3.5 py-1.5 rounded-full border border-[#e1e7dc]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-[#1e241c]">Telemetry Active</span>
              <span className="text-[#778073]">• Cloud Sink</span>
            </div>
          </div>
        </header>

        {/* Page content — scrollable */}
        <div className="flex-1 overflow-y-auto pb-24 lg:pb-8">
          <Outlet />
        </div>
      </main>

      {/* ── Mobile bottom floating tab bar (Dribbble pill style) ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-[#e1e7dc] flex pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-2">
        {MOBILE_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center pt-2.5 pb-1.5 gap-0.5 transition-all relative ${
                isActive ? 'text-[#e66a26]' : 'text-[#596155] hover:text-[#1e241c]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative">
                  <span
                    className={`material-symbols-outlined text-2xl transition-all ${
                      isActive ? 'text-[#e66a26]' : ''
                    }`}
                    style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {item.icon}
                  </span>
                  {item.hasBadge && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#c43828]" />
                  )}
                </div>
                <span
                  className={`text-[10px] leading-tight ${
                    isActive ? 'font-black text-[#e66a26]' : 'font-semibold'
                  }`}
                >
                  {item.label}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 w-8 h-0.5 bg-[#e66a26] rounded-full" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
