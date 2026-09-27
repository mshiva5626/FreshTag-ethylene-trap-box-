import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../store/settingsStore';

export default function PremiumUpgradePage() {
  const navigate = useNavigate();
  const { planTier, setPlanTier } = useSettingsStore();

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [upgradedToast, setUpgradedToast] = useState(false);

  const handleUpgrade = () => {
    setPlanTier('premium');
    setUpgradedToast(true);
    setTimeout(() => {
      setUpgradedToast(false);
    }, 4000);
  };

  const handleDowngrade = () => {
    setPlanTier('free');
  };

  const features = [
    {
      name: 'Chamber / Vault Connections',
      free: '1 Box Maximum',
      premium: 'Unlimited Multi-Box Mesh',
      icon: 'inventory_2',
    },
    {
      name: 'Telemetry History Retention',
      free: 'Last 24 Hours',
      premium: '365 Days + CSV Export',
      icon: 'history',
    },
    {
      name: 'Botanical Fruit Library',
      free: '3 Basic Presets',
      premium: 'All 8+ Climacteric & Exotic Presets',
      icon: 'nutrition',
    },
    {
      name: 'Actuator Control Scope',
      free: 'Local Wi-Fi Only',
      premium: 'Global Remote Cloud Relays',
      icon: 'tune',
    },
    {
      name: 'Shelf-Life Analytics & AI Models',
      free: 'Basic Compliance %',
      premium: 'Predictive Respiration & Decay Curves',
      icon: 'analytics',
    },
    {
      name: 'Consumable Maintenance',
      free: 'Manual Countdown',
      premium: 'Auto-Replenish & Granule Reminders',
      icon: 'hourglass_top',
    },
    {
      name: 'Safety & Excursion Alerts',
      free: 'Standard Web Push',
      premium: 'SMS + Web Push + Escalation Calls',
      icon: 'notifications_active',
    },
    {
      name: 'Support & Advisory',
      free: 'Community Docs',
      premium: '24/7 Botanical Agronomist Support',
      icon: 'support_agent',
    },
  ];

  return (
    <div className="px-4 py-8 lg:px-8 max-w-4xl mx-auto space-y-8">
      {/* Back button & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back to previous screen"
            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-primary)] hover:underline mb-2 min-h-[44px]"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back
          </button>
          <h1 className="text-3xl font-extrabold text-[var(--color-on-surface)] flex items-center gap-2.5">
            <span className="material-symbols-outlined text-amber-500 text-3xl">workspace_premium</span>
            FreshGuard Pro Botanist
          </h1>
          <p className="text-xs text-[var(--color-on-surface-variant)] mt-1">
            Unlock precision post-harvest shelf-life extension, unlimited multi-box storage mesh, and predictive AI climate control.
          </p>
        </div>

        {/* Current Plan Badge */}
        <div className="self-start sm:self-auto">
          <span
            className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
              planTier === 'premium'
                ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800'
                : 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] border-[var(--color-outline-variant)]'
            }`}
          >
            <span className="material-symbols-outlined text-sm">
              {planTier === 'premium' ? 'verified' : 'account_circle'}
            </span>
            Active Tier: {planTier === 'premium' ? 'Pro Botanist' : 'Free Tier'}
          </span>
        </div>
      </div>

      {upgradedToast && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between shadow-sm animate-fadeIn"
        >
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-base">check_circle</span>
            <span className="font-semibold">
              Congratulations! Your account has been upgraded to FreshGuard Pro Botanist. Unlimited vaults and 365-day analytics unlocked!
            </span>
          </div>
          <button
            onClick={() => setUpgradedToast(false)}
            aria-label="Close upgrade confirmation"
            className="hover:opacity-75 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Billing Switcher (Annual / Monthly) */}
      <div className="flex items-center justify-center">
        <div className="flex items-center bg-[var(--color-surface-container)] p-1 rounded-full border border-[var(--color-outline-variant)]/40 shadow-sm">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`py-2 px-5 rounded-full text-xs font-bold transition-all min-h-[44px] ${
              billingCycle === 'monthly'
                ? 'bg-[var(--color-surface)] text-[var(--color-on-surface)] shadow-sm'
                : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            Monthly Billing
          </button>

          <button
            onClick={() => setBillingCycle('annual')}
            className={`py-2 px-5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 min-h-[44px] ${
              billingCycle === 'annual'
                ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] shadow-sm'
                : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            Annual Billing
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-extrabold uppercase">
              Save 25%
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Free Tier Card */}
        <div
          className={`card p-6 rounded-3xl border-2 flex flex-col justify-between space-y-6 ${
            planTier === 'free'
              ? 'border-[var(--color-outline)] shadow-sm'
              : 'border-[var(--color-outline-variant)]/30 opacity-80'
          }`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-[var(--color-on-surface)]">Botanical Hobbyist</h3>
                <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">
                  Essential climate monitoring for a single storage box
                </p>
              </div>
              <span className="material-symbols-outlined text-2xl text-[var(--color-on-surface-variant)]">
                eco
              </span>
            </div>

            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-[var(--color-on-surface)] font-mono">$0</span>
              <span className="text-xs text-[var(--color-on-surface-variant)]">/ forever</span>
            </div>

            <ul className="space-y-2.5 text-xs text-[var(--color-on-surface-variant)] pt-2 border-t border-[var(--color-outline-variant)]/30">
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-emerald-600">check</span>
                <span><strong>1 Connected Chamber</strong></span>
              </li>
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-emerald-600">check</span>
                <span>24-Hour Telemetry History</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-emerald-600">check</span>
                <span>3 Botanical Presets (Banana, Mango, Tomato)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-emerald-600">check</span>
                <span>Local Wi-Fi Actuator Controls</span>
              </li>
              <li className="flex items-center gap-2 text-[var(--color-outline)]">
                <span className="material-symbols-outlined text-sm">close</span>
                <span className="line-through">Remote Cloud Actuator Control</span>
              </li>
              <li className="flex items-center gap-2 text-[var(--color-outline)]">
                <span className="material-symbols-outlined text-sm">close</span>
                <span className="line-through">Predictive Ripening Analytics</span>
              </li>
            </ul>
          </div>

          <div>
            {planTier === 'free' ? (
              <button
                disabled
                className="w-full py-3 px-6 rounded-full text-xs font-bold bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] cursor-default min-h-[44px]"
              >
                Current Active Plan
              </button>
            ) : (
              <button
                onClick={handleDowngrade}
                className="w-full py-3 px-6 rounded-full text-xs font-bold border border-[var(--color-outline)] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container)] transition-all min-h-[44px]"
              >
                Switch to Free Plan
              </button>
            )}
          </div>
        </div>

        {/* Pro Botanist Tier Card */}
        <div
          className={`card p-6 rounded-3xl border-2 relative flex flex-col justify-between space-y-6 bg-gradient-to-b from-[var(--color-surface-container-lowest)] to-[var(--color-surface-container)] ${
            planTier === 'premium'
              ? 'border-emerald-500 shadow-lg ring-2 ring-emerald-500/20'
              : 'border-[var(--color-primary-container)] shadow-md'
          }`}
        >
          {/* Most Popular Badge */}
          <div className="absolute -top-3.5 right-6 bg-emerald-600 text-white text-[10px] font-extrabold uppercase px-3 py-1 rounded-full shadow-sm">
            Recommended for Serious Growers
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-[var(--color-on-surface)] flex items-center gap-1.5">
                  Pro Botanist
                  <span className="material-symbols-outlined text-amber-500 text-base">verified</span>
                </h3>
                <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">
                  Industrial-grade harvest longevity & autonomous storage mesh
                </p>
              </div>
              <span className="material-symbols-outlined text-3xl text-amber-500">
                workspace_premium
              </span>
            </div>

            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-[var(--color-on-surface)] font-mono">
                {billingCycle === 'annual' ? '$7.40' : '$9.99'}
              </span>
              <span className="text-xs text-[var(--color-on-surface-variant)]">
                / month {billingCycle === 'annual' ? '(billed $89 annually)' : ''}
              </span>
            </div>

            <ul className="space-y-2.5 text-xs text-[var(--color-on-surface)] pt-2 border-t border-[var(--color-outline-variant)]/30">
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-emerald-600 font-bold">check_circle</span>
                <span><strong>Unlimited Connected Vaults</strong> (Multi-room monitoring)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-emerald-600 font-bold">check_circle</span>
                <span><strong>365-Day Historical Analytics</strong> with raw CSV export</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-emerald-600 font-bold">check_circle</span>
                <span><strong>Complete Botanical Library</strong> (All 8+ calibrated cultivars)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-emerald-600 font-bold">check_circle</span>
                <span><strong>Cloud Remote Relay Control</strong> anywhere via secure tunnel</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-emerald-600 font-bold">check_circle</span>
                <span><strong>Predictive Shelf-Life AI</strong> & autocatalytic excursion forecasting</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-emerald-600 font-bold">check_circle</span>
                <span><strong>Automatic Granule Consumable Dispatch</strong></span>
              </li>
              <li className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-emerald-600 font-bold">check_circle</span>
                <span><strong>24/7 Dedicated Agronomist Hotline</strong></span>
              </li>
            </ul>
          </div>

          <div>
            {planTier === 'premium' ? (
              <div className="flex items-center justify-center gap-2 py-3 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold text-xs min-h-[44px]">
                <span className="material-symbols-outlined text-base">verified</span>
                You Are On Pro Botanist
              </div>
            ) : (
              <button
                onClick={handleUpgrade}
                aria-label="Upgrade to FreshGuard Pro Botanist"
                className="btn-primary w-full py-3.5 px-6 rounded-full text-xs font-bold flex items-center justify-center gap-2 shadow-md hover:scale-[1.01] transition-transform min-h-[44px]"
              >
                <span className="material-symbols-outlined text-base">bolt</span>
                Upgrade to Pro Botanist
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Feature Comparison Matrix */}
      <div className="card p-6 space-y-4">
        <h3 className="text-base font-bold text-[var(--color-on-surface)] flex items-center gap-2">
          <span className="material-symbols-outlined text-xl text-[var(--color-primary)]">compare</span>
          Detailed Tier Comparison
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-outline-variant)]/40 text-[var(--color-on-surface-variant)]">
                <th className="py-3 px-3 font-semibold">Capability</th>
                <th className="py-3 px-3 font-semibold text-center">Hobbyist (Free)</th>
                <th className="py-3 px-3 font-semibold text-center text-emerald-600 dark:text-emerald-400">
                  Pro Botanist
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-outline-variant)]/20">
              {features.map((f) => (
                <tr key={f.name} className="hover:bg-[var(--color-surface-container)]/40 transition-colors">
                  <td className="py-3 px-3 font-medium text-[var(--color-on-surface)] flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-[var(--color-on-surface-variant)]">
                      {f.icon}
                    </span>
                    {f.name}
                  </td>
                  <td className="py-3 px-3 text-center text-[var(--color-on-surface-variant)]">
                    {f.free}
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-emerald-700 dark:text-emerald-300">
                    {f.premium}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ Accordion */}
      <div className="card p-6 space-y-4">
        <h3 className="text-base font-bold text-[var(--color-on-surface)]">
          Frequently Asked Questions
        </h3>

        <div className="space-y-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-[var(--color-surface-container)] space-y-1">
            <h4 className="font-bold text-[var(--color-on-surface)]">Can I use multiple boxes on the free tier?</h4>
            <p className="text-[var(--color-on-surface-variant)] leading-relaxed">
              The free tier is intended for monitoring a single chamber. Upgrading to Pro Botanist allows you to pair unlimited ESP32 storage chambers across multiple rooms or facilities.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--color-surface-container)] space-y-1">
            <h4 className="font-bold text-[var(--color-on-surface)]">How does remote cloud relay control work?</h4>
            <p className="text-[var(--color-on-surface-variant)] leading-relaxed">
              On Pro Botanist, our secure Socket.io and MQTT bridge tunnels actuator commands directly to your ESP32 even when your mobile phone is off the chamber's local Wi-Fi.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--color-surface-container)] space-y-1">
            <h4 className="font-bold text-[var(--color-on-surface)]">Can I cancel anytime?</h4>
            <p className="text-[var(--color-on-surface-variant)] leading-relaxed">
              Yes, you can cancel or switch back to the Free tier at any time without fees or hardware lockouts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
