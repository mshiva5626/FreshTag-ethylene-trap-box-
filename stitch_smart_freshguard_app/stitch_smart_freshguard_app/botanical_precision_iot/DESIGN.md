---
name: Botanical Precision IoT
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3d4a42'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#6d7a72'
  outline-variant: '#bccac0'
  surface-tint: '#006c4a'
  primary: '#006948'
  on-primary: '#ffffff'
  primary-container: '#00855d'
  on-primary-container: '#f5fff7'
  inverse-primary: '#68dba9'
  secondary: '#00687a'
  on-secondary: '#ffffff'
  secondary-container: '#57dffe'
  on-secondary-container: '#006172'
  tertiary: '#a33900'
  on-tertiary: '#ffffff'
  tertiary-container: '#cc4900'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#85f8c4'
  primary-fixed-dim: '#68dba9'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#005137'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#ffb599'
  on-tertiary-fixed: '#370e00'
  on-tertiary-fixed-variant: '#7f2b00'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.03em
  display-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  metric-xl:
    fontFamily: JetBrains Mono
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.02em
  metric-md:
    fontFamily: JetBrains Mono
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style
The design system embodies "Botanical Precision": the intersection of vital organic freshness and industrial IoT rigor. It caters to post-harvest operators, cold-chain logistics directors, and agronomists who demand laboratory-grade real-time monitoring without sacrificing visual vitality. 

The aesthetic synthesizes modern high-clarity data ergonomics with subtle glassmorphic atmospheric depth. The interface feels airy, hyper-clean, and responsive, balancing sterile technical dark slate housings against radiant biophilic emeralds, warning citruses, and atmospheric cyan mists. Elements project precision through tight tolerances, micro-borders, and high-frequency telemetry counters, paired with smooth ambient glows indicating dynamic batch freshness and storage chamber viability.

## Colors
The color palette communicates biological health, cooling thermodynamics, and critical shelf-life metrics.

- **Primary (Botanical Emerald - `#059669` / `#10B981`):** Represents biological preservation, optimal shelf-life, and nominal chamber states. Used for primary calls-to-action, success confirmations, and optimal telemetry zones.
- **Secondary (Cooling Cyan / Mist - `#06B6D4`):** Governs atmospheric metrics, refrigeration status, humidity levels, and airflow vectors.
- **Tertiary (Citrus Ethylene & Alert - `#EA580C` / `#F59E0B`):** Highlights ripening acceleration, ethylene gas spikes, decay risk, and urgent intervention alerts.
- **Neutral (Deep Slate Tech - `#0F172A` / `#1E293B`):** Provides anchor structures, dense telemetry typography, and high-contrast control surfaces.
- **Canvas & Surface (Crisp Mist - `#F8FAFC` to `#FFFFFF`):** Creates an ultra-clean, clinical canvas that gives telemetry data maximum contrast and crispness.

## Typography
Typography is divided strictly between qualitative operational UI and quantitative sensor telemetry:
- **Inter** handles narrative clarity, headlines, interactive controls, and tabular descriptions with neutral, low-friction geometry.
- **JetBrains Mono** governs all numerical stream readouts, hardware UUIDs, gas parts-per-million (PPM), temperatures, relative humidity percentages, and delta indicators. The monospaced numerals prevent visual jitter during live WebSocket updates and high-frequency sensor refreshes.

## Layout & Spacing
The layout follows a fluid 12-column engineering grid structured for dense information architecture and modular data monitoring:
- **Desktop (>= 1280px):** 12 columns, 1.5rem (`24px`) gutters, 2rem (`32px`) margins. Sidebar navigation spans 2 columns or locks at 260px; chamber feeds, telemetry arrays, and multi-sensor overlays occupy fluid spans of 3, 4, 6, or 12 columns.
- **Tablet (768px - 1279px):** 8 columns, 1rem (`16px`) gutters, 1.5rem (`24px`) margins. Sensor graphs collapse to 4 or 8 columns.
- **Mobile (< 768px):** 4 columns, 0.75rem (`12px`) gutters, 1rem (`16px`) margins. Data cards stack to full-width (4 columns); live charts condense into swipeable KPI carousels.

Spacing strictly follows a 4px modular base scale (`space-xs` to `space-xl`) to preserve tight mechanical alignment across telemetry meters and modular rack layouts.

## Elevation & Depth
Elevation is achieved using translucent glass planes, ultra-crisp micro-borders, and subtle ambient glows that represent environmental stability:

- **Level 0 (Base Canvas):** Solid `#F8FAFC` background with a microscopic radial grid pattern (0.5px slate dot array) to denote a calibrated plotting field.
- **Level 1 (Sensor Panels & Modules):** Pure white `#FFFFFF` or translucent white (`rgba(255, 255, 255, 0.85)`) with `backdrop-filter: blur(12px)`. Enclosed by a crisp 1px border (`rgba(226, 232, 240, 0.8)`). Casts a faint, highly diffused ambient shadow: `0 4px 20px -2px rgba(15, 23, 42, 0.04)`.
- **Level 2 (Active Control Cards & Modals):** Translucent `#FFFFFF` layered above Level 1 with an increased shadow: `0 12px 32px -4px rgba(15, 23, 42, 0.08)`. Outlined with a high-precision edge (`1px solid rgba(16, 185, 129, 0.2)` on healthy nodes, or `rgba(234, 88, 12, 0.25)` on warning chambers).
- **Level 3 (Hardware Calibration Overlays & Alerts):** Crisp dark slate floating panels (`#0F172A`) with emerald or amber edge-lighting (`box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1), 0 20px 40px -8px rgba(15, 23, 42, 0.35)`).

## Shapes
The shape language uses `roundedness: 2` (base `0.5rem` / `8px`, `rounded-lg: 1rem` / `16px`, `rounded-xl: 1.5rem` / `24px`). This level balances friendly organic produce vitality with modern technical chassis ergonomics. Standard cards, inputs, and action buttons utilize `0.5rem` borders for architectural cohesion, while ambient telemetry pills, freshness badges, and floating status tags use fully rounded pill silhouettes (`9999px`) to visually signal consumable or variable biological metrics.

## Components

- **Buttons:**
  - *Primary (Harvest Run / Action):* Filled `#059669` emerald with high-contrast `#FFFFFF` text, 0.5rem radius, and an inset top highlight (`box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2)`).
  - *Secondary / Control:* High-translucency slate tint (`background: rgba(241, 245, 249, 0.8)`), border: `1px solid #E2E8F0`, text: `#0F172A`.
  - *Hazard / Purge:* Filled `#EA580C` with subtle warning pulse states.
- **Chips & Badges:**
  - Compact pill shape (`roundedness: 9999px`), tracking live telemetry.
  - Status indicators feature an active blinking micro-LED dot (4px circle) paired with uppercase `label-sm` monospaced tags (`OPTIMAL`, `ETHYLENE SPIKE`, `DEFROST ACTIVE`).
- **Cards & Sensor Containers:**
  - Minimum padding `space-md` to `space-lg`.
  - Structured into a three-tier vertical stack: top header with hardware UUID and live connectivity beacon; body displaying `metric-xl` readings with trend micro-sparklines; footer containing delta thresholds and calibration timestamps.
- **Form Inputs & Calibrators:**
  - Inset neutral fields (`background: #FFFFFF`, border: `1px solid #CBD5E1`) focusing to a 1.5px emerald ring with `0 0 0 3px rgba(16, 185, 129, 0.15)`. Numeric scrubbers and threshold inputs use `JetBrains Mono` values.
- **Checkboxes & Radios:**
  - Geometric squares and rounds with 0.25rem corner radii. Unchecked: `1.5px solid #CBD5E1`. Checked: filled `#059669` with crisp micro-tick mark.
- **Lists & Sensor Feed Tables:**
  - Alternating rows with ultra-subtle slate hover states (`rgba(248, 250, 252, 0.8)`). 
  - Data columns align strictly right for `JetBrains Mono` telemetry values and left for produce commodity descriptions.
- **Specialized Agro-Tech Components:**
  - *Freshness Decay Radial:* Dual-ring circular gauge visualizing current shelf-life velocity against predicted bio-loss.
  - *Gas Dispersion Heatmap Bar:* Segmented linear multi-color micro-bar tracking O2, CO2, and C2H4 (ethylene) tolerances simultaneously.