import { useState, useId } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { FreshGuardLogo } from '../components/FreshGuardLogo'

type Tab = 'login' | 'register' | 'forgot'

function EyeToggle({ targetId }: { targetId: string }) {
  const [shown, setShown] = useState(false)
  const toggle = () => {
    const el = document.getElementById(targetId) as HTMLInputElement | null
    if (el) el.type = shown ? 'password' : 'text'
    setShown(v => !v)
  }
  return (
    <button type="button" onClick={toggle} className="ml-2 text-[var(--color-outline)] hover:text-[var(--color-on-surface)] flex items-center">
      <span className="material-symbols-outlined text-xl">{shown ? 'visibility_off' : 'visibility'}</span>
    </button>
  )
}

export default function AuthPage() {
  const [tab, setTab] = useState<Tab>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [validErr, setValidErr] = useState<string | null>(null)
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')

  const { login, register, isLoading, error, clearError } = useAuthStore()
  const navigate = useNavigate()
  const pwId = useId()
  const confirmId = useId()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    await login(email, password)
    if (useAuthStore.getState().token) navigate('/app/dashboard', { replace: true })
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setValidErr(null)
    if (password !== confirm) { setValidErr('Passwords do not match'); return }
    if (password.length < 8) { setValidErr('Password must be at least 8 characters'); return }
    await register(name, email, phone, password)
    if (useAuthStore.getState().token) navigate('/app/dashboard', { replace: true })
  }

  const handleForgot = (e: React.FormEvent) => {
    e.preventDefault()
    setOtpSent(true)
  }

  const switchTab = (t: Tab) => {
    clearError()
    setValidErr(null)
    setOtpSent(false)
    setTab(t)
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-surface)] pt-safe pb-safe">
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-lg mx-auto w-full">
        {/* Brand header */}
        <div className="flex flex-col items-center mb-8">
          <div className="mb-3 shrink-0 rounded-[22px] p-0.5 bg-gradient-to-br from-white/80 to-transparent shadow-[0_8px_24px_rgba(24,63,39,0.22)]">
            <FreshGuardLogo size={64} />
          </div>
          <h1 className="text-xl font-bold text-[var(--color-on-surface)] tracking-tight">FreshGuard</h1>
          <p className="text-sm text-[var(--color-on-surface-variant)] mt-0.5">Smart produce storage & ethylene telemetry</p>
        </div>

        {/* Tab switcher — hidden on forgot */}
        {tab !== 'forgot' && (
          <div className="w-full bg-[var(--color-surface-container-high)] p-1 rounded-full flex items-center mb-6 shadow-sm">
            {(['login', 'register'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  tab === t
                    ? 'bg-[var(--color-surface-container-lowest)] text-[var(--color-on-surface)] shadow-sm'
                    : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
                }`}
              >
                <span className="material-symbols-outlined text-lg">{t === 'login' ? 'login' : 'person_add'}</span>
                {t === 'login' ? 'Log In' : 'Create Account'}
              </button>
            ))}
          </div>
        )}

        {/* Form card */}
        <div className="w-full bg-[var(--color-surface-container-lowest)] rounded-2xl p-6 shadow-[var(--shadow-raised)]">

          {/* ── LOGIN ── */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <Field label="Email or Phone" icon="mail">
                <input
                  type="text"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="w-full bg-transparent text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none"
                />
              </Field>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between px-1">
                  <LabelRow icon="lock" text="Password" />
                  <button type="button" onClick={() => switchTab('forgot')} className="text-xs font-semibold text-[var(--color-secondary)] hover:underline">
                    Forgot Password?
                  </button>
                </div>
                <div className="input-pill">
                  <span className="material-symbols-outlined text-base text-[var(--color-primary)]">lock</span>
                  <input
                    id={pwId}
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                  <EyeToggle targetId={pwId} />
                </div>
              </div>

              <ErrorBox msg={error} />

              <button type="submit" className="btn-primary mt-2" disabled={isLoading}>
                {isLoading
                  ? <><span className="material-symbols-outlined animate-spin text-xl">refresh</span> Signing In…</>
                  : <><span>Sign In</span><span className="material-symbols-outlined text-xl">arrow_forward</span></>
                }
              </button>

              <Divider />

              <SocialButtons />

              <p className="text-center text-xs text-[var(--color-on-surface-variant)] mt-2">
                <span className="material-symbols-outlined text-xs align-middle text-[var(--color-secondary)]">info</span>
                {' '}Demo: <code className="bg-[var(--color-surface-container-low)] px-1 rounded text-xs">demo@freshguard.app</code> / <code className="bg-[var(--color-surface-container-low)] px-1 rounded text-xs">password123</code>
              </p>
            </form>
          )}

          {/* ── REGISTER ── */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} className="flex flex-col gap-4">
              <Field label="Full Name" icon="badge">
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your Name" required autoComplete="name"
                  className="w-full bg-transparent text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none" />
              </Field>

              <Field label="Email Address" icon="mail">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email"
                  className="w-full bg-transparent text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none" />
              </Field>

              <Field label="Phone Number" icon="call">
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" autoComplete="tel"
                  className="w-full bg-transparent text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none" />
              </Field>

              <Field label="Password" icon="lock">
                <input id={pwId} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required autoComplete="new-password"
                  className="w-full bg-transparent text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none" />
                <EyeToggle targetId={pwId} />
              </Field>

              <Field label="Confirm Password" icon="lock_reset">
                <input id={confirmId} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" required autoComplete="new-password"
                  className="w-full bg-transparent text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none" />
                <EyeToggle targetId={confirmId} />
              </Field>

              <ErrorBox msg={validErr ?? error} />

              <button type="submit" className="btn-primary mt-1" disabled={isLoading}>
                {isLoading
                  ? <><span className="material-symbols-outlined animate-spin text-xl">refresh</span> Creating account…</>
                  : <><span>Create Account</span><span className="material-symbols-outlined text-xl">arrow_forward</span></>
                }
              </button>
            </form>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {tab === 'forgot' && (
            <form onSubmit={handleForgot} className="flex flex-col gap-4">
              <button type="button" onClick={() => switchTab('login')} className="flex items-center gap-1 text-sm text-[var(--color-on-surface-variant)] mb-2 self-start">
                <span className="material-symbols-outlined text-base">arrow_back</span>
                Back to Login
              </button>

              <h2 className="text-lg font-bold text-[var(--color-on-surface)]">Reset Password</h2>
              <p className="text-sm text-[var(--color-on-surface-variant)]">
                {otpSent
                  ? "We've sent a 6-digit OTP to your email. Enter it below."
                  : "Enter your email and we'll send you a reset OTP."}
              </p>

              {!otpSent ? (
                <Field label="Email Address" icon="mail">
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required
                    className="w-full bg-transparent text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none" />
                </Field>
              ) : (
                <Field label="OTP Code" icon="pin">
                  <input type="text" value={otp} onChange={e => setOtp(e.target.value)} placeholder="6-digit code" maxLength={6} required
                    className="w-full bg-transparent text-sm font-mono tracking-widest text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none" />
                </Field>
              )}

              <button type="submit" className="btn-primary">
                {otpSent ? 'Verify OTP' : 'Send Reset Code'}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-xs text-center text-[var(--color-on-surface-variant)]">
          By continuing you agree to our{' '}
          <Link to="#" className="text-[var(--color-secondary)] hover:underline">Terms</Link>
          {' '}and{' '}
          <Link to="#" className="text-[var(--color-secondary)] hover:underline">Privacy Policy</Link>
        </p>
      </main>
    </div>
  )
}

// ── Small helpers ──────────────────────────────────────────────────────────────
function LabelRow({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-on-surface-variant)]">
      <span className="material-symbols-outlined text-base text-[var(--color-primary)]">{icon}</span>
      {text}
    </span>
  )
}

function Field({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <LabelRow icon={icon} text={label} />
      <div className="input-pill">{children}</div>
    </div>
  )
}

function ErrorBox({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-[var(--color-error-container)] text-[var(--color-on-error-container)] text-sm">
      <span className="material-symbols-outlined text-base mt-0.5">error</span>
      {msg}
    </div>
  )
}

function Divider() {
  return (
    <div className="relative flex items-center">
      <div className="flex-grow h-px bg-[var(--color-surface-container-high)]" />
      <span className="mx-4 text-[11px] font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wider">Or continue with</span>
      <div className="flex-grow h-px bg-[var(--color-surface-container-high)]" />
    </div>
  )
}

function SocialButtons() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: 'Apple', icon: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.63-.76 1.05-1.81.93-2.87-.91.04-2.02.61-2.67 1.37-.58.67-1.09 1.74-.95 2.78 1.02.08 2.06-.52 2.69-1.28z"/></svg> },
        { label: 'Google', icon: <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M12 5c1.54 0 2.92.54 4.02 1.42l3.01-3.01C17.2 1.7 14.77 1 12 1 7.42 1 3.53 3.6 1.66 7.41l3.66 2.84C6.2 7.47 8.87 5 12 5z" fill="#EA4335"/><path d="M23.49 12.28c0-.79-.07-1.54-.19-2.28H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.71 2.88c2.16-1.99 3.71-4.92 3.71-8.69z" fill="#4285F4"/><path d="M5.32 14.75c-.24-.72-.38-1.49-.38-2.28 0-.79.14-1.56.38-2.28L1.66 7.35C.6 9.45 0 11.66 0 14s.6 4.55 1.66 6.65l3.66-2.9z" fill="#FBBC05"/><path d="M12 23c3.24 0 5.95-1.08 7.93-2.91l-3.71-2.88c-1.07.73-2.45 1.16-4.22 1.16-3.13 0-5.8-2.47-6.68-5.25L1.66 16.03C3.53 19.84 7.42 23 12 23z" fill="#34A853"/></svg> },
        { label: 'Passkey', icon: <span className="material-symbols-outlined text-xl text-[var(--color-primary)]">key</span> },
      ].map(({ label, icon }) => (
        <button key={label} type="button"
          className="py-2.5 px-3 rounded-full bg-[var(--color-surface-container-low)] hover:bg-[var(--color-surface-container)] text-[var(--color-on-surface)] flex flex-col items-center justify-center gap-1 transition-all text-xs font-semibold">
          {icon}
          {label}
        </button>
      ))}
    </div>
  )
}
