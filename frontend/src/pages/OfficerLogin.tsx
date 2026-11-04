import { useState, useEffect } from 'react'
import {
  Building2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowLeftRight,
  Zap,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  UserPlus,
  Phone,
} from 'lucide-react'
import { Button, Input, Card, Badge } from '../components/ui'
import { useAuth, SUPABASE_UNCONFIGURED_MESSAGE } from '../lib/auth'
import {
  listPublicColleges,
  registerPlacementOfficer,
} from '../lib/adminApi'
import { isLocalhost, setPresentationRole } from '../lib/presentationMode'

type Page =
  | 'landing'
  | 'login-selection'
  | 'login'
  | 'signup'
  | 'forgot'
  | 'dashboard'
  | 'officer-login'
  | 'placement-cell'

interface OfficerLoginProps {
  onNavigate: (p: Page) => void
}

export default function OfficerLogin({ onNavigate }: OfficerLoginProps) {
  const { configured, signIn, signOut } = useAuth()

  // Mode: 'signin' | 'register'
  const [mode, setMode] = useState<'signin' | 'register'>('signin')

  // Sign in form state
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Register form state
  const [regFullName, setRegFullName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regCollegeId, setRegCollegeId] = useState('')
  const [regDesignation, setRegDesignation] = useState('')
  const [regDepartment, setRegDepartment] = useState('')
  const [regLoading, setRegLoading] = useState(false)
  const [regSuccess, setRegSuccess] = useState<string | null>(null)
  const [regError, setRegError] = useState<string | null>(null)

  // College dropdown list for registration
  const [colleges, setColleges] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    listPublicColleges()
      .then(data => setColleges(data))
      .catch(err => console.error('[OfficerLogin] Failed to load colleges:', err))
  }, [])

  // Handle Officer Sign In
  const handleSignIn = async (e: React.FormEvent) => {
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

      // Check role
      if (!profile || profile.role !== 'placement-officer') {
        await signOut()
        setError(
          'This account is not a placement officer. Officer access is granted by an ' +
            'administrator, not chosen at sign-in. Please use the student sign-in instead.',
        )
        return
      }

      // Enforce approval status strictly
      if (profile.approvalStatus === 'pending') {
        await signOut()
        setError(
          'Account Pending Approval: Your placement officer registration has been submitted and is currently awaiting Super Admin review. You will be able to access the placement cell once approved.',
        )
        return
      }

      if (profile.approvalStatus === 'rejected') {
        await signOut()
        setError(
          `Application Rejected: Your officer application was rejected by the administrator. ${
            profile.rejectionReason ? `Reason: "${profile.rejectionReason}"` : ''
          }`,
        )
        return
      }

      if (profile.approvalStatus === 'suspended') {
        await signOut()
        setError(
          `Account Suspended: Your placement officer access has been suspended by the administrator. ${
            profile.rejectionReason ? `Reason: "${profile.rejectionReason}"` : ''
          }`,
        )
        return
      }

      onNavigate('placement-cell')
    } finally {
      setLoading(false)
    }
  }

  // Handle Officer Registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError(null)
    setRegSuccess(null)

    if (!regFullName.trim()) {
      setRegError('Full Name is required.')
      return
    }
    if (!regEmail.trim()) {
      setRegError('Official College Email is required.')
      return
    }
    if (regPassword.length < 8) {
      setRegError('Password must be at least 8 characters long.')
      return
    }
    if (!regCollegeId) {
      setRegError('Please select your institution from the college list.')
      return
    }
    if (!regDesignation.trim()) {
      setRegError('Official designation is required.')
      return
    }

    setRegLoading(true)
    try {
      const res = await registerPlacementOfficer({
        fullName: regFullName.trim(),
        email: regEmail.trim(),
        password: regPassword,
        phone: regPhone.trim() || undefined,
        collegeId: regCollegeId,
        designation: regDesignation.trim(),
        department: regDepartment.trim() || undefined,
      })

      setRegSuccess(res.message)
      setRegFullName('')
      setRegEmail('')
      setRegPassword('')
      setRegPhone('')
      setRegCollegeId('')
      setRegDesignation('')
      setRegDepartment('')
    } catch (err: unknown) {
      console.error('[OfficerLogin] Registration failed:', err)
      setRegError(err instanceof Error ? err.message : 'Registration failed. Please try again.')
    } finally {
      setRegLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex"
      style={{ background: 'var(--bg)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Left panel */}
      <div
        className="hidden lg:flex flex-col justify-between w-[480px] flex-shrink-0 p-10 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #7c5cfc 0%, #3b82f6 100%)' }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-16">
            <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-white/20 flex items-center justify-center">
              <Building2 size={18} className="text-white" />
            </div>
            <span className="text-base font-extrabold text-white">MockMate · Officer Portal</span>
          </div>
          <h2 className="text-3xl font-extrabold text-white mb-4 leading-tight">
            Your college's campus placement hub
          </h2>
          <p className="text-white/75 mb-8 leading-relaxed text-sm">
            Publish and manage campus placement drives for your institution from a dedicated officer dashboard.
          </p>
          <div className="space-y-3">
            {[
              'Publish and manage campus job postings',
              'Strict college-wise candidate data isolation',
              'Post Off-Campus drives visible to all colleges',
              'Review and manage student applications',
              'Verified officer credentials & admin approval',
            ].map(f => (
              <div key={f} className="flex items-center gap-2.5">
                <CheckCircle2 size={15} className="text-white flex-shrink-0" />
                <span className="text-white/85 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
        <div
          className="relative z-10 rounded-[var(--radius-xl)] p-5"
          style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={15} className="text-white" />
            <span className="text-white text-xs font-bold uppercase tracking-wider">
              Server-Verified Access
            </span>
          </div>
          <p className="text-white/80 text-xs leading-relaxed">
            Officer applications undergo Super Admin verification. Unapproved, suspended or rejected accounts cannot access placement management endpoints.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-md">
          {/* Back */}
          <button
            onClick={() => onNavigate('landing')}
            className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--accent-from)] transition-all-smooth mb-6 cursor-pointer"
          >
            <ArrowLeft size={15} />
            Back to home
          </button>

          {/* Logo (mobile) */}
          <div className="flex items-center gap-2 mb-6 lg:hidden">
            <div className="w-7 h-7 rounded-[var(--radius-sm)] gradient-bg flex items-center justify-center">
              <Building2 size={15} className="text-white" />
            </div>
            <span className="text-sm font-extrabold text-[var(--text-primary)]">
              MockMate · Officer Portal
            </span>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex rounded-[var(--radius-md)] bg-[var(--surface)] p-1 border border-[var(--border)] mb-6">
            <button
              onClick={() => {
                setMode('signin')
                setError(null)
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-[var(--radius-sm)] transition-all cursor-pointer ${
                mode === 'signin'
                  ? 'gradient-bg text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Officer Sign In
            </button>
            <button
              onClick={() => {
                setMode('register')
                setRegError(null)
                setRegSuccess(null)
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-[var(--radius-sm)] transition-all cursor-pointer ${
                mode === 'register'
                  ? 'gradient-bg text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Register as Officer
            </button>
          </div>

          {/* Unconfigured Alert */}
          {!configured && (
            <Card className="p-4 mb-6 flex items-start gap-3 border-amber-500/30">
              <ShieldAlert size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                <strong className="text-[var(--text-primary)]">Cloud accounts are not configured.</strong>{' '}
                {SUPABASE_UNCONFIGURED_MESSAGE}
              </p>
            </Card>
          )}

          {/* SIGN IN FORM */}
          {mode === 'signin' && (
            <div>
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="info">College Placement Officer</Badge>
                  <Badge variant="success">Admin-approved</Badge>
                </div>
                <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mb-1">
                  Placement Officer Sign In
                </h1>
                <p className="text-sm text-[var(--text-secondary)]">
                  Access your college's placement readiness dashboard.
                </p>
              </div>

              {error && (
                <Card className="p-4 mb-6 flex items-start gap-3 border-red-500/30">
                  <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-500 leading-relaxed font-medium" role="alert">
                    {error}
                  </p>
                </Card>
              )}

              <form onSubmit={handleSignIn} className="space-y-4">
                <Input
                  label="Official Email Address"
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
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  leftIcon={<Lock size={14} />}
                  autoComplete="current-password"
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      className="cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  }
                />
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  loading={loading}
                  disabled={!configured || loading}
                >
                  <Zap size={15} />
                  Sign in to Officer Portal
                </Button>

                {isLocalhost() && (
                  <div className="mt-4 p-3 rounded bg-amber-500/10 border border-amber-500/20 text-center">
                    <p className="text-[11px] text-amber-800 dark:text-amber-200 mb-2">
                      Faculty Presentation Mode (Localhost Only)
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setPresentationRole('placement-officer')
                        onNavigate('placement-cell')
                      }}
                      className="w-full py-2 px-3 rounded text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer shadow-sm"
                    >
                      Enter Placement Cell via Faculty Demo →
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* REGISTRATION FORM */}
          {mode === 'register' && (
            <div>
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge variant="info">New Officer Application</Badge>
                  <Badge variant="warning">Requires Approval</Badge>
                </div>
                <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mb-1">
                  Register as Placement Officer
                </h1>
                <p className="text-xs text-[var(--text-secondary)]">
                  Submit your institutional credentials for Super Admin review.
                </p>
              </div>

              {regSuccess && (
                <Card className="p-5 mb-5 border-emerald-500/30 bg-emerald-500/5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 size={20} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-emerald-600 mb-1">Application Submitted</h4>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3">
                        {regSuccess}
                      </p>
                      <Button size="sm" onClick={() => setMode('signin')}>
                        Go to Sign In
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {regError && (
                <Card className="p-4 mb-5 flex items-start gap-3 border-red-500/30">
                  <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-500 leading-relaxed font-medium" role="alert">
                    {regError}
                  </p>
                </Card>
              )}

              {!regSuccess && (
                <form onSubmit={handleRegister} className="space-y-3.5">
                  <Input
                    label="Full Name *"
                    placeholder="e.g. Dr. Rajesh Kumar"
                    required
                    value={regFullName}
                    onChange={e => setRegFullName(e.target.value)}
                  />

                  <Input
                    label="Official Institutional Email *"
                    type="email"
                    placeholder="r.kumar@institution.edu"
                    required
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    leftIcon={<Mail size={14} />}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Contact Number"
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={regPhone}
                      onChange={e => setRegPhone(e.target.value)}
                      leftIcon={<Phone size={14} />}
                    />

                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-[var(--text-secondary)]">
                        Institution / College *
                      </label>
                      <select
                        required
                        value={regCollegeId}
                        onChange={e => setRegCollegeId(e.target.value)}
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-from)] cursor-pointer"
                      >
                        <option value="">-- Select College --</option>
                        {colleges.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Official Designation *"
                      placeholder="e.g. Placement Officer"
                      required
                      value={regDesignation}
                      onChange={e => setRegDesignation(e.target.value)}
                    />
                    <Input
                      label="Department"
                      placeholder="e.g. Training & Placement"
                      value={regDepartment}
                      onChange={e => setRegDepartment(e.target.value)}
                    />
                  </div>

                  <Input
                    label="Account Password *"
                    type="password"
                    placeholder="At least 8 characters"
                    required
                    value={regPassword}
                    onChange={e => setRegPassword(e.target.value)}
                    leftIcon={<Lock size={14} />}
                  />

                  <Button
                    type="submit"
                    className="w-full mt-2"
                    size="lg"
                    loading={regLoading}
                    disabled={!configured || regLoading}
                  >
                    <UserPlus size={15} />
                    Submit Registration Application
                  </Button>
                </form>
              )}
            </div>
          )}

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
