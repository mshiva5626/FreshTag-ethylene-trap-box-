import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const SLIDES = [
  {
    icon: 'eco',
    iconColor: 'var(--color-secondary)',
    bgColor: 'var(--color-secondary-container)',
    headline: 'Ethylene Trap Technology',
    body: 'Activated carbon and KMnO₄ granules absorb the ethylene gas that ripens fruit — keeping bananas, mangoes and more fresh up to 3× longer without refrigeration.',
    badge: '3× Longer Freshness',
  },
  {
    icon: 'sensors',
    iconColor: 'var(--color-primary)',
    bgColor: 'var(--color-primary-fixed)',
    headline: 'Live Environmental Telemetry',
    body: 'Real-time temperature, humidity, and VOC index readings every 2.5 seconds — streamed from your FreshGuard vault directly to your phone via Wi-Fi.',
    badge: 'Every 2.5s Live Updates',
  },
  {
    icon: 'tune',
    iconColor: 'var(--color-tertiary)',
    bgColor: 'var(--color-tertiary-fixed)',
    headline: 'Smart Auto & Manual Control',
    body: 'Set AUTO mode for hands-free fan & humidifier management, or switch to MANUAL for full control of the inlet fan, outlet fan, and LEDs.',
    badge: 'AUTO + MANUAL Modes',
  },
  {
    icon: 'qr_code_scanner',
    iconColor: 'var(--color-secondary)',
    bgColor: 'var(--color-secondary-container)',
    headline: 'Instant QR & Wi-Fi Pairing',
    body: 'Pair your FreshGuard vault in seconds via QR code. Scan the code on your chamber or connect via Wi-Fi to link your device instantly. Works on all modern browsers and smartphones.',
    badge: 'Fast QR Setup',
  },
]

export default function OnboardingCarousel() {
  const [slide, setSlide] = useState(0)
  const { setOnboardingSeen } = useAuthStore()
  const navigate = useNavigate()

  const isLast = slide === SLIDES.length - 1

  const handleNext = () => {
    if (isLast) {
      setOnboardingSeen()
      navigate('/login')
    } else {
      setSlide(s => s + 1)
    }
  }

  const handleSkip = () => {
    setOnboardingSeen()
    navigate('/login')
  }

  const s = SLIDES[slide]

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-surface)] overflow-hidden relative">
      {/* Skip button */}
      <button
        onClick={handleSkip}
        className="absolute top-4 right-4 z-10 px-4 py-1.5 rounded-full bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)] text-sm font-semibold"
      >
        Skip
      </button>

      {/* Illustration area */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 pt-16 pb-8">
        {/* Icon circle */}
        <div
          className="w-40 h-40 rounded-3xl flex items-center justify-center mb-8 shadow-[var(--shadow-raised)] transition-all duration-500"
          style={{ background: s.bgColor }}
        >
          <span
            className="material-symbols-outlined text-7xl transition-all duration-300"
            style={{ color: s.iconColor, fontVariationSettings: "'FILL' 1" }}
          >
            {s.icon}
          </span>
        </div>

        {/* Badge */}
        <div
          className="mb-5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border transition-all duration-300"
          style={{
            background: s.bgColor,
            color: s.iconColor,
            borderColor: s.iconColor + '40',
          }}
        >
          {s.badge}
        </div>

        {/* Headline */}
        <h2 className="text-2xl font-bold text-center text-[var(--color-on-surface)] mb-3 leading-tight max-w-xs transition-all duration-300">
          {s.headline}
        </h2>

        {/* Body */}
        <p className="text-sm text-center text-[var(--color-on-surface-variant)] leading-relaxed max-w-sm transition-all duration-300">
          {s.body}
        </p>
      </div>

      {/* Bottom area */}
      <div className="px-6 pb-safe pb-8 flex flex-col items-center gap-6">
        {/* Dots */}
        <div className="flex gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              className="transition-all duration-300 rounded-full"
              style={{
                width: i === slide ? '24px' : '8px',
                height: '8px',
                background: i === slide
                  ? 'var(--color-primary-container)'
                  : 'var(--color-surface-container-highest)',
              }}
            />
          ))}
        </div>

        {/* CTA */}
        <button onClick={handleNext} className="btn-primary max-w-sm mx-auto">
          <span>{isLast ? 'Get Started' : 'Next'}</span>
          <span className="material-symbols-outlined text-xl">arrow_forward</span>
        </button>

        {!isLast && (
          <button onClick={handleSkip} className="text-sm text-[var(--color-on-surface-variant)] font-medium">
            Skip intro
          </button>
        )}
      </div>
    </div>
  )
}
