import { useState, useEffect } from 'react'
import {
  BrainCircuit, Mail, Lock, User, Eye, EyeOff, ArrowLeft, Zap, CheckCircle2,
  ArrowLeftRight, ShieldAlert, AlertTriangle, MailCheck, Hash,
} from 'lucide-react'
import { Button, Input, Card } from '../components/ui'
import { useAuth, SUPABASE_UNCONFIGURED_MESSAGE } from '../lib/auth'

type AuthMode = 'login' | 'signup' | 'forgot'
type Page = 'landing' | 'login-selection' | 'login' | 'signup' | 'forgot' | 'dashboard' | 'officer-login'

interface AuthProps {
  mode: AuthMode
  onNavigate: (p: Page) => void
}

type Notice = 'reset-sent' | 'confirm-email'

export default function Auth({ mode, onNavigate }: AuthProps) {
  const { configured, signIn, signUp, sendPasswordReset } = useAuth()

  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [colleges, setColleges] = useState<Array<{ id: string; name: string }>>([])
  const [collegeId, setCollegeId] = useState('')
  const [rollNumber, setRollNumber] = useState('')

  useEffect(() => {
    if (mode !== 'signup') return
    let active = true
    fetch('/api/officer-auth/colleges')
      .then(res => res.json())
      .then(data => {
        if (active && Array.isArray(data)) {
          setColleges(data)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [mode])

  const resetMessages = () => {
    setError(null)
    setNotice(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    resetMessages()

    if (!configured) {
      setError(SUPABASE_UNCONFIGURED_MESSAGE)
      return
    }
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }
    if (mode !== 'forgot' && !password) {
      setError('Please enter your password.')
      return
    }
    if (mode === 'signup' && !fullName.trim()) {
      setError('Please enter your full name.')
      return
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        // On success the app detects the new session and routes by the role
        // stored in the database — no client-side role switching.
        const { error: signInError } = await signIn(email.trim(), password)
        if (signInError) setError(signInError)
      } else if (mode === 'signup') {
        const { error: signUpError, needsEmailConfirmation } = await signUp(
          email.trim(),
          password,
          fullName.trim(),
          collegeId || undefined,
          rollNumber.trim() || undefined,
        )
        if (signUpError) setError(signUpError)
        else if (needsEmailConfirmation) setNotice('confirm-email')
      } else {
        const { error: resetError } = await sendPasswordReset(email.trim())
        if (resetError) setError(resetError)
        else setNotice('reset-sent')
      }
    } finally {
      setLoading(false)
    }
  }

  // Success card shown in place of the form (password reset requested /
  // email confirmation required). Rendered inside the normal two-panel layout.
  const noticeCard = (
    <Card className="p-8 text-center">
      <div className="w-14 h-14 rounded-full gradient-bg-soft border border-[var(--border)] flex items-center justify-center mx-auto mb-4">
        {notice === 'confirm-email' ? (
          <MailCheck size={26} className="text-[var(--accent-from)]" />
        ) : (
          <Mail size={26} className="text-[var(--accent-from)]" />
        )}
      </div>
      <h2 className="text-xl font-extrabold text-[var(--text-primary)] mb-2">
        {notice === 'confirm-email' ? 'Confirm your email' : 'Check your email'}
      </h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        {notice === 'confirm-email'
          ? `We've sent a confirmation link to ${email.trim()}. Open it to activate your account, then sign in.`
          : `We've sent a password reset link to ${email.trim()}. Please check your inbox and spam folder.`}
      </p>
      <Button variant="secondary" className="w-full" onClick={() => { resetMessages(); onNavigate('login') }}>
        Back to Login
      </Button>
    </Card>
  )

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] flex-shrink-0 p-10 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #7c5cfc 0%, #3b82f6 100%)' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-16">
            <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-white/20 flex items-center justify-center">
              <BrainCircuit size={18} className="text-white" />
            </div>
            <span className="text-base font-extrabold text-white">MockMate</span>
          </div>
          <h2 className="text-3xl font-extrabold text-white mb-4 leading-tight">Practise for your next interview</h2>
          <p className="text-white/75 mb-8 leading-relaxed text-sm">Practise mock interviews, review your resume, and track your placement readiness.</p>
          <div className="space-y-3">
            {['Mock interviews with prepared question sets', 'Resume review & skill-gap preview', 'Structured weekly roadmap to placement', 'Problem-solving practice environment'].map(f => (
              <div key={f} className="flex items-center gap-2.5">
                <CheckCircle2 size={15} className="text-white flex-shrink-0" />
                <span className="text-white/85 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 glass rounded-[var(--radius-xl)] p-5" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={15} className="text-yellow-300" />
            <p className="text-white text-xs font-bold uppercase tracking-wider">Secure accounts</p>
          </div>
          <p className="text-white text-sm leading-relaxed">
            Accounts are protected by Supabase Auth. Your role is issued by the server, never chosen in the browser.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-md">
          {/* Back */}
          <button onClick={() => onNavigate('landing')} className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--accent-from)] transition-all-smooth mb-8">
            <ArrowLeft size={15} />
            Back to home
          </button>

          {/* Logo (mobile) */}
          <div className="flex items-center gap-2 mb-6 lg:hidden">
            <div className="w-7 h-7 rounded-[var(--radius-sm)] gradient-bg flex items-center justify-center">
              <BrainCircuit size={15} className="text-white" />
            </div>
            <span className="text-sm font-extrabold text-[var(--text-primary)]">MockMate</span>
          </div>

          {notice ? noticeCard : (
          <>
          <div className="mb-8">
            <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mb-1">
              {mode === 'login' && 'Welcome back'}
              {mode === 'signup' && 'Create your account'}
              {mode === 'forgot' && 'Reset your password'}
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {mode === 'login' && "New to MockMate? "}
              {mode === 'signup' && "Already have an account? "}
              {mode === 'forgot' && "Remembered it? "}
              <button onClick={() => { resetMessages(); onNavigate(mode === 'login' ? 'signup' : 'login') }} className="text-[var(--accent-from)] font-semibold hover:underline">
                {mode === 'login' ? 'Create account' : 'Log in'}
              </button>
            </p>
          </div>

          {!configured && (
            <Card className="p-4 mb-6 flex items-start gap-3 border-amber-500/30">
              <ShieldAlert size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                <strong className="text-[var(--text-primary)]">Cloud accounts are not configured.</strong>{' '}
                {SUPABASE_UNCONFIGURED_MESSAGE}
              </p>
            </Card>
          )}

          {error && (
            <div className="mb-5 flex items-start gap-2.5 p-3 rounded-[var(--radius-md)] bg-red-500/10 border border-red-500/20" role="alert">
              <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-500 leading-relaxed">{error}</p>
            </div>
          )}

          {/* Social login */}
          {mode !== 'forgot' && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              {['Google', 'GitHub'].map(p => (
                <button
                  key={p}
                  type="button"
                  disabled
                  title="Social sign-in is not enabled in this build"
                  className="flex items-center justify-center gap-2 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-sm font-semibold text-[var(--text-primary)] opacity-60 cursor-not-allowed"
                >
                  {p === 'Google' ? (
                    <svg width="15" height="15" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12"/></svg>
                  )}
                  {p}
                </button>
              ))}
            </div>
          )}

          {mode !== 'forgot' && (
            <div className="relative flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-[var(--border-subtle)]" />
              <span className="text-xs text-[var(--text-muted)] font-medium">or continue with email</span>
              <div className="flex-1 h-px bg-[var(--border-subtle)]" />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <Input
                  label="Full Name"
                  placeholder="Your name"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  leftIcon={<User size={14} />}
                  autoComplete="name"
                />

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--text-secondary)]">
                    College / University (for Campus Placements)
                  </label>
                  <select
                    value={collegeId}
                    onChange={e => setCollegeId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-from)]"
                  >
                    <option value="">-- Independent Student / No College --</option>
                    {colleges.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {collegeId && (
                  <div>
                    <Input
                      label="College Roll / Registration Number"
                      placeholder="e.g. 21CS042"
                      value={rollNumber}
                      onChange={e => setRollNumber(e.target.value)}
                      leftIcon={<Hash size={14} />}
                    />
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      Used by your placement cell to verify campus drive eligibility.
                    </p>
                  </div>
                )}
              </>
            )}
            <Input
              label="Email Address"
              type="email"
              placeholder="you@college.edu"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              leftIcon={<Mail size={14} />}
              autoComplete="email"
            />
            {mode === 'forgot' && (
              <p className="text-xs text-[var(--text-muted)] -mt-2">Enter the email address associated with your account and we'll send you a reset link.</p>
            )}
            {mode !== 'forgot' && (
              <Input
                label="Password"
                type={show ? 'text' : 'password'}
                placeholder="Enter your password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                leftIcon={<Lock size={14} />}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                rightIcon={
                  <button type="button" onClick={() => setShow(s => !s)} className="cursor-pointer" aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                }
              />
            )}
            {mode === 'login' && (
              <div className="flex justify-end">
                <button type="button" onClick={() => { resetMessages(); onNavigate('forgot') }} className="text-xs text-[var(--accent-from)] hover:underline font-medium">
                  Forgot password?
                </button>
              </div>
            )}
            {mode === 'signup' && (
              <div className="flex items-start gap-2">
                <input type="checkbox" id="terms" required className="mt-0.5 accent-[#7c5cfc]" />
                <label htmlFor="terms" className="text-xs text-[var(--text-secondary)]">
                  I agree to the <a href="#" className="text-[var(--accent-from)] hover:underline">Terms of Service</a> and <a href="#" className="text-[var(--accent-from)] hover:underline">Privacy Policy</a>
                </label>
              </div>
            )}
            <Button type="submit" className="w-full" size="lg" loading={loading} disabled={!configured || loading}>
              <Zap size={15} />
              {mode === 'login' && 'Sign in to MockMate'}
              {mode === 'signup' && 'Create Account'}
              {mode === 'forgot' && 'Send Reset Link'}
            </Button>
          </form>

          {mode !== 'forgot' && (
            <>
              <div className="relative flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-[var(--border-subtle)]" />
                <span className="text-xs text-[var(--text-muted)] font-medium">or</span>
                <div className="flex-1 h-px bg-[var(--border-subtle)]" />
              </div>
              <button
                onClick={() => onNavigate('login-selection')}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:border-[var(--accent-from)] transition-all-smooth cursor-pointer"
              >
                <ArrowLeftRight size={15} className="text-[var(--accent-from)]" />
                Switch account type
              </button>
            </>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  )
}
