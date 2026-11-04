import { BrainCircuit, GraduationCap, Building2, ArrowLeft, ArrowRight, ShieldCheck, ShieldAlert, KeyRound } from 'lucide-react'
import { Card, Button, Badge } from '../components/ui'
import { isLocalhost, setPresentationRole, type PresentationRole } from '../lib/presentationMode'

type Page = 'landing' | 'login' | 'officer-login' | 'login-selection' | 'admin-dashboard' | 'placement-cell'

interface LoginSelectionProps {
  onNavigate: (p: Page) => void
  onSelectPresentationRole?: (role: PresentationRole) => void
}

const options = [
  {
    id: 'student' as const,
    page: 'login' as const,
    icon: GraduationCap,
    color: '#7c5cfc',
    title: 'Student Login',
    desc: 'Practise interviews, review your resume, track readiness and explore jobs.',
    cta: 'Continue as Student',
  },
  {
    id: 'officer' as const,
    page: 'officer-login' as const,
    icon: Building2,
    color: '#3b82f6',
    title: 'College Placement Officer Login',
    desc: 'Publish and manage campus job postings and placement drives for your college.',
    cta: 'Continue as Placement Officer',
  },
]

export default function LoginSelection({ onNavigate, onSelectPresentationRole }: LoginSelectionProps) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="max-w-4xl w-full mx-auto px-6 py-8">
        {/* Back to home */}
        <button
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--accent-from)] transition-all-smooth mb-10"
        >
          <ArrowLeft size={15} />
          Back to Home
        </button>

        {/* Heading */}
        <div className="text-center max-w-xl mx-auto mb-12">
          <div className="flex items-center justify-center gap-2.5 mb-5">
            <div className="w-9 h-9 rounded-[var(--radius-sm)] gradient-bg flex items-center justify-center shadow-[var(--shadow-sm)]">
              <BrainCircuit size={19} className="text-white" />
            </div>
            <span className="text-lg font-extrabold text-[var(--text-primary)]">MockMate</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-[var(--text-primary)] mb-3">How would you like to sign in?</h1>
          <p className="text-sm md:text-base text-[var(--text-secondary)]">Choose your account type to continue to the right dashboard.</p>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {options.map(o => (
            <Card key={o.id} className="p-6 md:p-7 flex flex-col">
              <div
                className="w-12 h-12 rounded-[var(--radius-md)] flex items-center justify-center mb-5"
                style={{ background: `${o.color}18`, color: o.color }}
              >
                <o.icon size={24} />
              </div>
              <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">{o.title}</h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6 flex-1">{o.desc}</p>
              <Button className="w-full" onClick={() => onNavigate(o.page)}>
                {o.cta}
                <ArrowRight size={15} />
              </Button>
            </Card>
          ))}
        </div>

        {/* Localhost Presentation Switcher */}
        {isLocalhost() && (
          <div className="mt-8 p-5 rounded-[var(--radius-md)] border border-amber-500/40 bg-amber-500/10 dark:bg-amber-950/20 max-w-2xl mx-auto shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded bg-amber-500 text-white uppercase text-[10px] tracking-wider">
                <ShieldAlert size={12} />
                Localhost Only
              </span>
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Faculty Presentation Mode
              </h3>
            </div>
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed mb-4">
              Directly preview the Super Admin or Placement Cell interfaces for faculty demonstration without waiting for account approval setup. Production authentication, RLS and database security are unaffected.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                variant="secondary"
                className="w-full justify-center text-xs py-2 border-amber-500/50 hover:bg-amber-500/20 text-amber-900 dark:text-amber-100"
                onClick={() => {
                  setPresentationRole('super_admin')
                  if (onSelectPresentationRole) onSelectPresentationRole('super_admin')
                  else onNavigate('admin-dashboard')
                }}
              >
                <KeyRound size={14} className="mr-1.5 text-amber-600 dark:text-amber-400" />
                Launch Super Admin Panel →
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-center text-xs py-2 border-amber-500/50 hover:bg-amber-500/20 text-amber-900 dark:text-amber-100"
                onClick={() => {
                  setPresentationRole('placement-officer')
                  if (onSelectPresentationRole) onSelectPresentationRole('placement-officer')
                  else onNavigate('placement-cell')
                }}
              >
                <Building2 size={14} className="mr-1.5 text-amber-600 dark:text-amber-400" />
                Launch Placement Cell →
              </Button>
            </div>
          </div>
        )}

        {/* Sign-in notice */}
        <div className="mt-8 flex items-start gap-3 p-4 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--border)] max-w-2xl mx-auto">
          <ShieldCheck size={16} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            <strong className="text-[var(--text-primary)]">Secure sign-in.</strong> Accounts are protected by Supabase Auth. Your role (student or placement officer) is issued by the server and cannot be chosen in the browser.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 mt-6">
          <Badge variant="info">Accounts secured by Supabase Auth</Badge>
          <button
            onClick={() => onNavigate('admin-login' as any)}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            Super Administrator Portal →
          </button>
        </div>
      </div>
    </div>
  )
}
