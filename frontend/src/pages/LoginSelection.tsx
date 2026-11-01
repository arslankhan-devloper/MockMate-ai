import { BrainCircuit, GraduationCap, Building2, ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react'
import { Card, Button, Badge } from '../components/ui'

type Page = 'landing' | 'login' | 'officer-login' | 'login-selection'

interface LoginSelectionProps {
  onNavigate: (p: Page) => void
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

export default function LoginSelection({ onNavigate }: LoginSelectionProps) {
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

        {/* Sign-in notice */}
        <div className="mt-8 flex items-start gap-3 p-4 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--border)] max-w-2xl mx-auto">
          <ShieldCheck size={16} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            <strong className="text-[var(--text-primary)]">Secure sign-in.</strong> Accounts are protected by Supabase Auth. Your role (student or placement officer) is issued by the server and cannot be chosen in the browser.
          </p>
        </div>

        <div className="flex justify-center mt-6">
          <Badge variant="info">Accounts secured by Supabase Auth</Badge>
        </div>
      </div>
    </div>
  )
}
