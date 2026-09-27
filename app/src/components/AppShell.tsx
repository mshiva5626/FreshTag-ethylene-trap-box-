import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export const ALL_NAV_ITEMS = [
  { to: '/app/dashboard', icon: 'dashboard', label: 'Dashboard', shortLabel: 'Vaults', desc: 'Active chambers & conditions' },
  { to: '/app/scanner', icon: 'center_focus_strong', label: 'Nutrition Scanner', shortLabel: 'Scanner', desc: 'Optical AI & produce health' },
  { to: '/app/devices', icon: 'inventory_2', label: 'Storage Chambers', shortLabel: 'Chambers', desc: 'Hardware chambers & pairing' },
  { to: '/app/diet', icon: 'nutrition', label: 'Diet & Intake', shortLabel: 'Diet', desc: 'Fresh produce logs & wellness' },
  { to: '/app/fruits', icon: 'spa', label: 'Botanical Presets', shortLabel: 'Presets', desc: 'Horticultural setpoint profiles' },
  { to: '/app/automation', icon: 'tune', label: 'Automation & Scrubbers', shortLabel: 'Automation', desc: 'Catalytic scrubbers & fans' },
  { to: '/app/alerts', icon: 'notifications', label: 'Safety Alerts', shortLabel: 'Alerts', desc: 'VOC & door excursion warnings', hasBadge: true },
  { to: '/app/analytics', icon: 'analytics', label: 'Analytics & Trends', shortLabel: 'Analytics', desc: 'Telemetry graphs & shelf life' },
  { to: '/app/profile', icon: 'person', label: 'Account & Settings', shortLabel: 'Account', desc: 'Account profile & sync' },
];

export default function AppShell() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // Check if current route is one of the secondary pages accessed via "More"
  const isMoreActive = ['/app/automation', '/app/alerts', '/app/analytics', '/app/profile'].some((p) =>
    location.pathname.startsWith(p)
  );

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
            className="btn-terracotta w-full py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">center_focus_strong</span>
            Scan Produce
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 flex flex-col gap-1 overflow-y-auto pr-1 scrollbar-none">
          {ALL_NAV_ITEMS.map((item) => (
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
            className="flex items-center gap-2 px-3 py-2 w-full rounded-xl text-xs font-semibold text-[#c43828] hover:bg-[#fde8e5] transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">logout</span>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content area ── */}
      <main className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Mobile top bar with hamburger menu for all navigation items */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-[#e1e7dc] bg-white/95 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open complete navigation menu"
              className="p-1.5 -ml-1 text-[#1e241c] hover:bg-[#edf1e8] rounded-xl flex items-center justify-center cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-2xl">menu</span>
            </button>
            <div className="w-8 h-8 rounded-xl overflow-hidden border border-[#fbd3b9] shadow-xs shrink-0 bg-[#ffede0]">
              <img src="/assets/fruits/apple.jpg" alt="FreshGuard" className="w-full h-full object-cover" />
            </div>
            <div>
              <span className="font-extrabold text-sm text-[#1e241c] tracking-tight block leading-none">FreshGuard</span>
              <span className="text-[10px] text-[#596155] font-medium leading-tight">Storage Chamber</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <NavLink
              to="/app/scanner"
              aria-label="Scan produce"
              className="p-2 rounded-xl text-[#e66a26] bg-[#ffede0] min-h-[36px] min-w-[36px] flex items-center justify-center shadow-xs"
              title="Nutrition Scanner"
            >
              <span className="material-symbols-outlined text-lg">center_focus_strong</span>
            </NavLink>
            <NavLink
              to="/app/alerts"
              aria-label="Alerts"
              className="relative p-2 rounded-xl text-[#596155] hover:bg-[#edf1e8] min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Safety Alerts"
            >
              <span className="material-symbols-outlined text-lg">notifications</span>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#c43828] animate-pulse" />
            </NavLink>
            <NavLink
              to="/app/profile"
              aria-label="View account profile"
              className="w-8 h-8 rounded-full bg-[#e8f3e5] flex items-center justify-center text-xs font-bold text-[#3b6b32] ml-1"
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

      {/* ── Mobile bottom floating tab bar ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#e1e7dc] flex pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-2">
        <NavLink
          to="/app/dashboard"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center pt-2 pb-1 gap-0.5 transition-all relative ${
              isActive ? 'text-[#e66a26]' : 'text-[#596155] hover:text-[#1e241c]'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={`material-symbols-outlined text-2xl transition-all ${
                  isActive ? 'text-[#e66a26]' : ''
                }`}
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                dashboard
              </span>
              <span className={`text-[10px] leading-tight ${isActive ? 'font-black text-[#e66a26]' : 'font-semibold'}`}>
                Vaults
              </span>
              {isActive && <span className="absolute bottom-0 w-8 h-0.5 bg-[#e66a26] rounded-full" />}
            </>
          )}
        </NavLink>

        <NavLink
          to="/app/scanner"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center pt-2 pb-1 gap-0.5 transition-all relative ${
              isActive ? 'text-[#e66a26]' : 'text-[#596155] hover:text-[#1e241c]'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={`material-symbols-outlined text-2xl transition-all ${
                  isActive ? 'text-[#e66a26]' : ''
                }`}
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                center_focus_strong
              </span>
              <span className={`text-[10px] leading-tight ${isActive ? 'font-black text-[#e66a26]' : 'font-semibold'}`}>
                Scanner
              </span>
              {isActive && <span className="absolute bottom-0 w-8 h-0.5 bg-[#e66a26] rounded-full" />}
            </>
          )}
        </NavLink>

        <NavLink
          to="/app/devices"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center pt-2 pb-1 gap-0.5 transition-all relative ${
              isActive ? 'text-[#e66a26]' : 'text-[#596155] hover:text-[#1e241c]'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={`material-symbols-outlined text-2xl transition-all ${
                  isActive ? 'text-[#e66a26]' : ''
                }`}
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                inventory_2
              </span>
              <span className={`text-[10px] leading-tight ${isActive ? 'font-black text-[#e66a26]' : 'font-semibold'}`}>
                Chambers
              </span>
              {isActive && <span className="absolute bottom-0 w-8 h-0.5 bg-[#e66a26] rounded-full" />}
            </>
          )}
        </NavLink>

        <NavLink
          to="/app/diet"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center pt-2 pb-1 gap-0.5 transition-all relative ${
              isActive ? 'text-[#e66a26]' : 'text-[#596155] hover:text-[#1e241c]'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={`material-symbols-outlined text-2xl transition-all ${
                  isActive ? 'text-[#e66a26]' : ''
                }`}
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                nutrition
              </span>
              <span className={`text-[10px] leading-tight ${isActive ? 'font-black text-[#e66a26]' : 'font-semibold'}`}>
                Diet
              </span>
              {isActive && <span className="absolute bottom-0 w-8 h-0.5 bg-[#e66a26] rounded-full" />}
            </>
          )}
        </NavLink>

        {/* More (Opens Drawer with ALL 9 Navigation Items) */}
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className={`flex-1 flex flex-col items-center justify-center pt-2 pb-1 gap-0.5 transition-all relative cursor-pointer ${
            isMoreActive ? 'text-[#e66a26]' : 'text-[#596155] hover:text-[#1e241c]'
          }`}
        >
          <div className="relative">
            <span
              className={`material-symbols-outlined text-2xl transition-all ${
                isMoreActive ? 'text-[#e66a26]' : ''
              }`}
            >
              grid_view
            </span>
            <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-[#e66a26]" />
          </div>
          <span className={`text-[10px] leading-tight ${isMoreActive ? 'font-black text-[#e66a26]' : 'font-semibold'}`}>
            Menu
          </span>
          {isMoreActive && <span className="absolute bottom-0 w-8 h-0.5 bg-[#e66a26] rounded-full" />}
        </button>
      </nav>

      {/* ── Full Mobile Navigation Drawer Overlay (Contains Complete 9 Nav Items) ── */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop blur */}
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            aria-hidden="true"
          />

          {/* Drawer container */}
          <div className="relative w-[85%] max-w-sm bg-white h-full shadow-2xl flex flex-col z-10 animate-fade-in">
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#e1e7dc] bg-[#fbfdf9]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl overflow-hidden border border-[#fbd3b9] shadow-xs shrink-0 bg-[#ffede0]">
                  <img src="/assets/fruits/apple.jpg" alt="FreshGuard" className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="font-extrabold text-base leading-tight text-[#1e241c] tracking-tight">FreshGuard</p>
                  <p className="text-[11px] text-[#596155] font-medium">Complete Navigation</p>
                </div>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Close navigation"
                className="p-2 text-[#596155] hover:text-[#1e241c] hover:bg-[#edf1e8] rounded-full cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Quick Scan Produce Button */}
            <div className="p-4 pb-2">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  navigate('/app/scanner');
                }}
                className="btn-terracotta w-full py-3 px-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">center_focus_strong</span>
                Scan Produce with AI
              </button>
            </div>

            {/* Complete Navigation List (All 9 Items) */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#778073] px-3 py-1">
                All App Sections ({ALL_NAV_ITEMS.length})
              </p>
              {ALL_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3 py-3 rounded-2xl transition-all ${
                      isActive
                        ? 'bg-[#ffede0] text-[#e66a26] shadow-xs font-bold'
                        : 'text-[#2b3129] hover:bg-[#edf1e8] font-semibold'
                    }`
                  }
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="material-symbols-outlined text-2xl shrink-0">{item.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm leading-tight truncate">{item.label}</p>
                      <p className="text-[10px] text-[#596155] font-normal truncate mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                  {item.hasBadge && (
                    <span className="w-2.5 h-2.5 rounded-full bg-[#c43828] shrink-0 animate-pulse ml-2" />
                  )}
                </NavLink>
              ))}
            </div>

            {/* User Profile & Sign Out Footer */}
            <div className="p-4 border-t border-[#e1e7dc] bg-[#fbfdf9]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-[#e8f3e5] flex items-center justify-center text-sm font-bold text-[#3b6b32] shrink-0">
                  {user?.name?.[0]?.toUpperCase() ?? 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#1e241c] truncate">{user?.name}</p>
                  <p className="text-[10px] text-[#596155] truncate">{user?.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-[#c43828] bg-[#fde8e5] hover:bg-[#fad4cf] transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">logout</span>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
