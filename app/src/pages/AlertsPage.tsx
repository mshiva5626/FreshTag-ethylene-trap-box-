import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { initSocket } from '../utils/socket';
import { getBackendUrl } from '../utils/backendUrl';

const BACKEND_URL = getBackendUrl();

export interface AlertItem {
  id: number;
  device_id: string;
  account_id: string;
  type: 'DOOR_OPEN_PROLONGED' | 'SENSOR_OFFLINE' | 'ETHYLENE_HIGH' | 'GRANULE_REPLACEMENT' | string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO' | string;
  title: string;
  message: string;
  resolved: boolean;
  created_at: string;
}

export default function AlertsPage() {
  const { token, user } = useAuthStore();

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');
  const [loading, setLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState<NotificationPermission>('default');
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);

  // Check initial Notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushStatus(Notification.permission);
    }
  }, []);

  // Fetch alerts from backend
  const fetchAlerts = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch (err: any) {
      console.warn('[Fetch Alerts Error]:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();

    // Listen to real-time alerts via Socket.io
    if (user?.account_id) {
      const socket = initSocket(user.account_id, token || undefined);
      socket.on('alert:new', (newAlert: AlertItem) => {
        setAlerts((prev) => [newAlert, ...prev]);

        // If Web Push or Browser Notification is granted, trigger desktop notification
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(newAlert.title, {
              body: newAlert.message,
              icon: '/pwa-192x192.png',
            });
          } catch (e) {
            console.warn('Native notification failed:', e);
          }
        }
      });
    }
  }, [token, user?.account_id]);

  // Resolve alert
  const handleResolveAlert = async (alertId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/alerts/${alertId}/resolve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === alertId ? { ...a, resolved: true } : a))
        );
      }
    } catch (err: any) {
      console.warn('[Resolve Alert Error]:', err.message);
    }
  };

  // Request Web Push Notification Permission
  const handleEnablePush = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPushFeedback('Push notifications are not supported in this browser environment.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setPushStatus(permission);

      if (permission === 'granted') {
        setPushFeedback('Push notifications enabled! You will receive instant safety alerts.');

        // Register push subscription with backend
        if (token && 'serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready.catch(() => null);
          if (reg && reg.pushManager) {
            // Get public VAPID key
            const keyRes = await fetch(`${BACKEND_URL}/api/alerts/vapid-key`).catch(() => null);
            const keyData = keyRes ? await keyRes.json().catch(() => null) : null;
            const publicKey = keyData?.publicKey || 'BC_demo_public_key';

            // Subscribe or send dummy subscription
            const sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: publicKey,
            }).catch(() => null);

            if (sub) {
              await fetch(`${BACKEND_URL}/api/alerts/subscribe`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ subscription: sub }),
              });
            }
          }
        }

        // Show immediate demo notification
        new Notification('FreshGuard System Alert', {
          body: 'Web Push alerts are now active for your FreshGuard Chambers.',
          icon: '/pwa-192x192.png',
        });
      } else {
        setPushFeedback('Notification permission was dismissed or denied.');
      }
    } catch (err: any) {
      setPushFeedback(`Could not request notifications: ${err.message}`);
    }
  };

  const filteredAlerts = alerts.filter((a) => {
    if (filter === 'unresolved') return !a.resolved;
    if (filter === 'resolved') return a.resolved;
    return true;
  });

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'DOOR_OPEN_PROLONGED':
        return 'sensor_door';
      case 'SENSOR_OFFLINE':
        return 'signal_disconnected';
      case 'ETHYLENE_HIGH':
        return 'science';
      case 'GRANULE_REPLACEMENT':
        return 'hourglass_top';
      default:
        return 'warning';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-300 dark:border-red-900';
      case 'WARNING':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-900';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-900';
    }
  };

  return (
    <div className="px-4 py-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-on-surface)] flex items-center gap-2">
            <span className="material-symbols-outlined text-red-500">notifications_active</span>
            System Safety & Maintenance Alerts
          </h1>
          <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">
            Automated alerts for prolonged open doors, offline hardware, ethylene spikes, and filter schedules
          </p>
        </div>

        {/* Web Push Notification Toggle */}
        <div className="self-start sm:self-auto">
          {pushStatus === 'granted' ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Web Push Alerts Active
            </div>
          ) : (
            <button
              onClick={handleEnablePush}
              className="btn-secondary py-2 px-4 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">notifications</span>
              Enable Push Notifications
            </button>
          )}
        </div>
      </div>

      {pushFeedback && (
        <div className="p-3 rounded-2xl bg-[var(--color-surface-container)] text-xs text-[var(--color-on-surface)] flex items-center justify-between">
          <span>{pushFeedback}</span>
          <button onClick={() => setPushFeedback(null)} className="hover:opacity-75">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 text-xs font-semibold border-b border-[var(--color-outline-variant)]/40 pb-3">
        <button
          onClick={() => setFilter('unresolved')}
          className={`px-3 py-1.5 rounded-full transition-all ${
            filter === 'unresolved'
              ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
              : 'text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)]'
          }`}
        >
          Active / Unresolved ({alerts.filter((a) => !a.resolved).length})
        </button>

        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-full transition-all ${
            filter === 'all'
              ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
              : 'text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)]'
          }`}
        >
          All Events ({alerts.length})
        </button>

        <button
          onClick={() => setFilter('resolved')}
          className={`px-3 py-1.5 rounded-full transition-all ${
            filter === 'resolved'
              ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)]'
              : 'text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container)]'
          }`}
        >
          Resolved ({alerts.filter((a) => a.resolved).length})
        </button>
      </div>

      {/* Alerts Listing */}
      {filteredAlerts.length === 0 ? (
        <div className="card p-12 flex flex-col items-center text-center gap-3 text-[var(--color-on-surface-variant)]">
          <span className="material-symbols-outlined text-5xl text-emerald-500">verified</span>
          <h3 className="text-base font-bold text-[var(--color-on-surface)]">All Clear — No Alerts</h3>
          <p className="text-xs max-w-sm">
            All botanical storage chambers are operating within safe climate thresholds, doors are secured, and sensor hardware is fully online.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`card p-4 sm:p-5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 border ${
                alert.resolved
                  ? 'opacity-60 border-[var(--color-outline-variant)]/40 bg-[var(--color-surface)]'
                  : 'border-[var(--color-outline-variant)]/60 bg-[var(--color-surface-container-low)] shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    alert.severity === 'CRITICAL'
                      ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400'
                      : alert.severity === 'WARNING'
                      ? 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400'
                      : 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                  }`}
                >
                  <span className="material-symbols-outlined text-xl">{getAlertIcon(alert.type)}</span>
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getSeverityBadge(
                        alert.severity
                      )}`}
                    >
                      {alert.severity}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-[var(--color-on-surface-variant)]">
                      {alert.device_id}
                    </span>
                    <span className="text-[10px] text-[var(--color-on-surface-variant)]">
                      {new Date(alert.created_at).toLocaleString()}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-[var(--color-on-surface)]">{alert.title}</h4>
                  <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5 leading-relaxed">
                    {alert.message}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                {alert.resolved ? (
                  <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    Resolved
                  </span>
                ) : (
                  <button
                    onClick={() => handleResolveAlert(alert.id)}
                    className="btn-secondary py-1.5 px-3.5 rounded-full text-xs font-semibold flex items-center gap-1 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">done</span>
                    Mark Resolved
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
