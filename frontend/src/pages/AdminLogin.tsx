import { useState } from 'react'
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowLeft,
  KeyRound,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { Button, Input, Card } from '../components/ui'
import { useAuth, SUPABASE_UNCONFIGURED_MESSAGE } from '../lib/auth'
import { getAdminDashboard } from '../lib/adminApi'
import { isLocalhost, setPresentationRole } from '../lib/presentationMode'

interface AdminLoginProps {
  onLoginSuccess: () => void
  onNavigateHome: () => void
}

export default function AdminLogin({ onLoginSuccess, onNavigateHome }: AdminLoginProps) {
  const { configured, signIn, signOut } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!configured) {
      setError(SUPABASE_UNCONFIGURED_MESSAGE)
      return
    }

    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || !password) {
      setError('Please provide both administrator email and password.')
      return
    }

    setLoading(true)
    try {
      const { error: signInError, profile } = await signIn(trimmedEmail, password)
      if (signInError) {
        setError(signInError)
        return
      }

      // Check client-side profile role first
      if (!profile || profile.role !== 'super_admin') {
        await signOut()
        setError(
          'Access Denied: This account does not possess Super Administrator privileges. Placement officers and students are strictly restricted from the administrative control plane.',
        )
        return
      }

      // Re-verify strictly with server-side admin API to ensure token and role are valid on the backend
      // This ensures we never trust local state alone!
      try {
        const { getSupabaseClient } = await import('../lib/supabase')
        const client = getSupabaseClient()
        const sessionData = await client?.auth.getSession()
        const token = sessionData?.data.session?.access_token

        if (!token) {
          throw new Error('Authentication session token is missing')
        }

        // Test backend authorization middleware
        await getAdminDashboard(token)
      } catch (backendErr: unknown) {
        await signOut()
        console.error('[admin.login] Backend authorization verification failed:', backendErr)
        setError(
          'Authorization Verification Failed: The backend server rejected administrative authorization for this session.',
        )
        return
      }

      onLoginSuccess()
    } catch (err: unknown) {
      console.error('[admin.login] Unexpected sign-in error:', err)
      setError('An unexpected error occurred during administrative authentication.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center p-4 md:p-8"
      style={{ background: 'var(--bg)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <div className="w-full max-w-md">
        {/* Back Link */}
        <button
          onClick={onNavigateHome}
          className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--accent-from)] transition-all-smooth mb-6 cursor-pointer"
        >
          <ArrowLeft size={15} />
          Back to MockMate
        </button>

        {/* Card */}
        <Card className="p-7 md:p-8 border-[var(--border)] shadow-xl relative overflow-hidden">
          {/* Accent Glow */}
          <div
            className="absolute top-0 left-0 right-0 h-1.5"
            style={{ background: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899)' }}
          />

          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-13 h-13 rounded-2xl mx-auto mb-3 flex items-center justify-center shadow-lg bg-gradient-to-br from-indigo-600 to-purple-600 text-white">
              <ShieldCheck size={28} />
            </div>
            <div className="flex items-center justify-center gap-2 mb-1.5">
              <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">
                Super Admin Portal
              </h1>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Authorized personnel only. All access attempts are recorded in immutable audit logs.
            </p>
          </div>

          {!configured && (
            <div className="p-3.5 mb-5 rounded-[var(--radius-md)] bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5">
              <ShieldAlert size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                <strong className="text-[var(--text-primary)]">Cloud accounts unconfigured.</strong>{' '}
                {SUPABASE_UNCONFIGURED_MESSAGE}
              </p>
            </div>
          )}

          {error && (
            <div
              className="p-3.5 mb-5 rounded-[var(--radius-md)] bg-red-500/10 border border-red-500/20 flex items-start gap-2.5"
              role="alert"
            >
              <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-500 leading-relaxed font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Admin Email Address"
              type="email"
              placeholder="admin@mockmate.ai"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              leftIcon={<Mail size={15} />}
              autoComplete="username"
            />

            <Input
              label="Security Key / Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••••••"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              leftIcon={<Lock size={15} />}
              autoComplete="current-password"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
            />

            <Button
              type="submit"
              size="lg"
              className="w-full mt-2 font-bold"
              loading={loading}
              disabled={!configured || loading}
            >
              <KeyRound size={16} />
              Verify & Enter Control Plane
            </Button>
          </form>

          {/* Security Notice */}
          <div className="mt-6 pt-5 border-t border-[var(--border)] text-center">
            {isLocalhost() && (
              <div className="mb-4 p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-center">
                <p className="text-[11px] text-amber-800 dark:text-amber-200 mb-2">
                  Faculty Presentation Mode (Localhost Only)
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPresentationRole('super_admin')
                    onLoginSuccess()
                  }}
                  className="w-full py-1.5 px-3 rounded text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer shadow-sm"
                >
                  Enter Admin Panel via Faculty Demo →
                </button>
              </div>
            )}
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <CheckCircle2 size={13} className="text-emerald-500" />
              <span>Multi-tier Server Verification & Row Level Security</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
