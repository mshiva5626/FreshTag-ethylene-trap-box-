import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import SplashScreen from './pages/SplashScreen'
import OnboardingCarousel from './pages/OnboardingCarousel'
import AuthPage from './pages/AuthPage'
import AppShell from './components/AppShell'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardPage from './pages/DashboardPage'
import DevicesPage from './pages/DevicesPage'
import PairingWizardPage from './pages/PairingWizardPage'
import BoxDetailPage from './pages/BoxDetailPage'
import FruitProfilesPage from './pages/FruitProfilesPage'
import AutomationPage from './pages/AutomationPage'
import AlertsPage from './pages/AlertsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import ProfilePage from './pages/ProfilePage'
import PremiumUpgradePage from './pages/PremiumUpgradePage'

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}
