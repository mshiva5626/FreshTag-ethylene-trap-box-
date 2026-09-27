import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SplashScreen from './pages/SplashScreen';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';

// Lazy-loaded routes for ultra-fast initial page bundle & mobile performance
const OnboardingCarousel = lazy(() => import('./pages/OnboardingCarousel'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const NutritionScannerPage = lazy(() => import('./pages/NutritionScannerPage'));
const FruitDietPage = lazy(() => import('./pages/FruitDietPage'));
const DevicesPage = lazy(() => import('./pages/DevicesPage'));
const PairingWizardPage = lazy(() => import('./pages/PairingWizardPage'));
const BoxDetailPage = lazy(() => import('./pages/BoxDetailPage'));
const FruitProfilesPage = lazy(() => import('./pages/FruitProfilesPage'));
const AutomationPage = lazy(() => import('./pages/AutomationPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const PremiumUpgradePage = lazy(() => import('./pages/PremiumUpgradePage'));

function PageLoader() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] p-6">
      <div className="w-12 h-12 rounded-2xl bg-[#ffede0] border border-[#fbd3b9] flex items-center justify-center mb-3 shadow-xs">
        <span className="material-symbols-outlined text-2xl text-[#e66a26] animate-spin">refresh</span>
      </div>
      <p className="text-xs font-bold text-[#596155] tracking-wide animate-pulse">Loading FreshGuard...</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          <Route path="/" element={<SplashScreen />} />
          <Route path="/onboarding" element={<OnboardingCarousel />} />
          <Route path="/login" element={<AuthPage />} />

          {/* Protected — requires JWT */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />
              <Route path="/app/dashboard" element={<DashboardPage />} />
              <Route path="/app/scanner" element={<NutritionScannerPage />} />
              <Route path="/app/diet" element={<FruitDietPage />} />
              <Route path="/app/devices" element={<DevicesPage />} />
              <Route path="/app/devices/pair" element={<PairingWizardPage />} />
              <Route path="/app/devices/:deviceId" element={<BoxDetailPage />} />
              <Route path="/app/fruits" element={<FruitProfilesPage />} />
              <Route path="/app/automation" element={<AutomationPage />} />
              <Route path="/app/alerts" element={<AlertsPage />} />
              <Route path="/app/analytics" element={<AnalyticsPage />} />
              <Route path="/app/profile" element={<ProfilePage />} />
              <Route path="/app/premium" element={<PremiumUpgradePage />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
