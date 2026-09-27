# SITE.md — FreshGuard Project Constitution

## 1. Core Identity

- **Project Name:** FreshGuard
- **Stitch Project ID:** [Stitch Project ID]
- **Mission:** FreshGuard is a smart mobile-first PWA companion for the FreshGuard ESP32 ethylene-trap fruit storage vault. It pairs devices via Web Bluetooth, monitors cold-storage conditions in real time via WebSocket telemetry, and lets users manage fruit presets, actuator controls, and multi-vault dashboards — all from their phone.
- **Target Audience:** Home fruit-storage enthusiasts and small produce vendors who own a FreshGuard hardware vault. Primary device: Android or desktop Chrome/Edge (Web Bluetooth constraint). Secondary: any browser for read-only monitoring.
- **Voice:** Calm, trustworthy, data-forward. Feels like a premium health-tracking app crossed with an industrial IoT dashboard — never clinical, always approachable.

---

## 2. Visual Language

- **Primary Vibe:** Fresh Precision — deep dark-green surfaces, clean data typography, gentle nature-forward accents
- **Secondary:** Premium IoT Dashboard — density 6/10, variance 6/10, motion 5/10
- **Tertiary:** Tactile Mobile-First — large touch targets, card-based layout, smooth spring transitions

---

## 3. Architecture & File Structure

```
freshguard/
├── client/                  # React + Vite + TypeScript PWA
│   ├── src/
│   │   ├── pages/           # Route-level screen components
│   │   ├── components/      # Shared UI components
│   │   ├── store/           # Zustand state slices
│   │   ├── hooks/           # BLE, WebSocket, LAN control hooks
│   │   └── lib/             # API client, BLE manager, constants
│   └── public/              # PWA manifest, icons
├── server/                  # Node.js + Express + PostgreSQL
│   ├── routes/              # REST API routes
│   ├── sockets/             # Socket.io handlers
│   └── db/                  # Migrations, schema, seed
└── .stitch/                 # Design loop artifacts
    ├── SITE.md
    ├── DESIGN.md
    ├── next-prompt.md
    ├── metadata.json
    └── designs/             # Stitch HTML/PNG outputs
```

- **Navigation Strategy:** Bottom tab bar on mobile (Home, Vaults, History, Settings). Top nav on desktop. Shared floating status bar shows live connectivity mode.

---

## 4. Live Sitemap

- [ ] onboarding — Welcome / first-run screen with value prop and "Add Vault" CTA
- [ ] ble-pair — Web Bluetooth pairing flow (scan → connect → configure Wi-Fi → confirm)
- [ ] dashboard — Main vault dashboard: live telemetry cards, actuator controls, fruit preset selector
- [ ] vault-list — Multi-vault overview
- [ ] history — Time-series charts (Recharts)
- [ ] settings — Account info, vault rename, factory reset / unpair
- [ ] auth-login — Email + password login with OTP option
- [ ] auth-register — Registration form
- [ ] ble-unsupported — Fallback screen for iOS/Safari

---

## 5. Roadmap (Backlog)

### High Priority
- [ ] onboarding screen
- [ ] ble-pair screen — full BLE pairing flow
- [ ] ble-unsupported screen — graceful fallback
- [ ] dashboard screen — live telemetry + controls
- [ ] auth-login + auth-register screens

### Medium Priority
- [ ] vault-list screen
- [ ] history screen — Recharts time-series
- [ ] settings screen

### Low Priority
- [ ] PWA install prompt
- [ ] Offline empty state illustrations
- [ ] Dark/light mode toggle

---

## 6. Creative Freedom Guidelines

- Fruit presets displayed as illustrated cards with color-coded freshness bands
- BLE pairing flow uses a radar/pulse animation while scanning
- Dashboard ALERT state visually pulses the ethylene/VOC card
- Status badges: NORMAL = forest green, DOOR_OPEN = amber, ALERT = deep red
- Always label gas readings as "Ethylene / VOC Index" — NEVER "ppm"
- When sensor offline (dht_exists/gas_exists/door_exists = false), show "Sensor offline" chip
