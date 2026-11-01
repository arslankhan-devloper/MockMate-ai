import { useState } from 'react'
import {
  Building2, Mail, Lock, Eye, EyeOff, ArrowLeft, ArrowLeftRight, Zap, CheckCircle2,
  ShieldCheck, ShieldAlert, AlertTriangle,
} from 'lucide-react'
import { Button, Input, Card, Badge } from '../components/ui'
import { useAuth, SUPABASE_UNCONFIGURED_MESSAGE } from '../lib/auth'

type Page = 'landing' | 'login-selection' | 'login' | 'signup' | 'forgot' | 'dashboard' | 'officer-login' | 'placement-cell'

interface OfficerLoginProps {
  onNavigate: (p: Page) => void
}

export default function OfficerLogin({ onNavigate }: OfficerLoginProps) {
  const { configured, signIn, signOut } = useAuth()

  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!configured) {
      setError(SUPABASE_UNCONFIGURED_MESSAGE)
      return
    }
    if (!email.trim() || !password) {
      setError('Enter your college email address and password.')
      return
    }

    setLoading(true)
    try {
      const { error: signInError, profile } = await signIn(email.trim(), password)
      if (signInError) {
        setError(signInError)
        return
      }
      // Authorisation comes from the database profile, never from this page.
      // A student account cannot open the officer dashboard.
      if (!profile || profile.role !== 'placement-officer') {
        await signOut()
        setError(
          'This account is not a placement officer. Officer access is granted by an ' +
            'administrator, not chosen at sign-in. Please use the student sign-in instead.',
        )
        return
      }
      onNavigate('placement-cell')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] flex-shrink-0 p-10 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #7c5cfc 0%, #3b82f6 100%)' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-16">
            <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-white/20 flex items-center justify-center">
              <Building2 size={18} className="text-white" />
            </div>
            <span className="text-base font-extrabold text-white">MockMate · Officer Portal</span>
          </div>
          <h2 className="text-3xl font-extrabold text-white mb-4 leading-tight">Your college's campus placement hub</h2>
          <p className="text-white/75 mb-8 leading-relaxed text-sm">Publish and manage campus placement drives for your institution from a dedicated officer dashboard.</p>
          <div className="space-y-3">
            {['Publish and manage campus job postings', 'Scope In-Campus drives to your own college', 'Post Off-Campus drives visible to all colleges', 'Track applications for your postings'].map(f => (
              <div key={f} className="flex items-center gap-2.5">
                <CheckCircle2 size={15} className="text-white flex-shrink-0" />
                <span className="text-white/85 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 rounded-[var(--radius-xl)] p-5" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={15} className="text-white" />
            <span className="text-white text-xs font-bold uppercase tracking-wider">Verified Access</span>
          </div>
          <p className="text-white/80 text-xs leading-relaxed">Officer accounts are created and approved by an administrator. Signing in only works for accounts already granted the placement-officer role.</p>
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
              <Building2 size={15} className="text-white" />
            </div>
            <span className="text-sm font-extrabold text-[var(--text-primary)]">MockMate · Officer Portal</span>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="info">College Placement Officer</Badge>
              <Badge variant="success">Admin-approved</Badge>
            </div>
            <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mb-1">Placement Officer Sign In</h1>
            <p className="text-sm text-[var(--text-secondary)]">Access your college's placement readiness dashboard.</p>
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
            <Card className="p-4 mb-6 flex items-start gap-3 border-red-500/30">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-500 leading-relaxed" role="alert">{error}</p>
            </Card>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="College Email Address"
              type="email"
              placeholder="officer@college.edu"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              leftIcon={<Mail size={14} />}
              autoComplete="email"
            />
            <Input
              label="Password"
              type={show ? 'text' : 'password'}
              placeholder="Enter your password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              leftIcon={<Lock size={14} />}
              autoComplete="current-password"
              rightIcon={
                <button type="button" onClick={() => setShow(s => !s)} className="cursor-pointer" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              }
            />
            <Button type="submit" className="w-full" size="lg" loading={loading} disabled={!configured || loading}>
              <Zap size={15} />
              Sign in to Officer Portal
            </Button>
          </form>

          {/* Student login link */}
          <div className="relative flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-[var(--border-subtle)]" />
            <span className="text-xs text-[var(--text-muted)] font-medium">not a placement officer?</span>
            <div className="flex-1 h-px bg-[var(--border-subtle)]" />
          </div>
          <button
            onClick={() => onNavigate('login-selection')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:border-[var(--accent-from)] transition-all-smooth cursor-pointer"
          >
            <ArrowLeftRight size={15} className="text-[var(--accent-from)]" />
            Switch account type
          </button>
        </div>
      </div>
    </div>
  )
}
