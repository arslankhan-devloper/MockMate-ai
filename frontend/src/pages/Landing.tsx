import { useState } from 'react'
import { BrainCircuit, Zap, Target, TrendingUp, Shield, ChevronDown, ArrowRight, Play, Users, GraduationCap, Building2, Code2, Sun, Moon } from 'lucide-react'
import { Button, Card, Badge } from '../components/ui'

type Page = 'landing' | 'login-selection' | 'login' | 'signup' | 'dashboard' | 'officer-login'

interface LandingProps {
  onNavigate: (p: Page) => void
  dark: boolean
  onToggleDark: () => void
}

const features = [
  { icon: BrainCircuit, title: 'Mock Interview Practice', desc: 'Work through role- and branch-specific question sets in a timed mock interview session.', color: '#7c5cfc' },
  { icon: Target, title: 'Resume Review', desc: 'Preview an ATS-style score, skill extraction and improvement tips in a simulated resume review.', color: '#3b82f6' },
  { icon: TrendingUp, title: 'Placement Readiness Index', desc: 'Track progress across communication, technical and aptitude skills as you practise.', color: '#10b981' },
  { icon: Zap, title: 'Learning Roadmap', desc: 'Follow a structured weekly study plan covering the core topics for your target role.', color: '#f59e0b' },
  { icon: Shield, title: 'Answer Delivery Practice', desc: 'Practise spoken answers with a live microphone level and browser speech-to-text — MockMate does not record or store your audio or video.', color: '#ef4444' },
  { icon: Code2, title: 'Problem Solving', desc: 'Practise DSA independently with AI-generated problems, sample tests, hints and adaptive difficulty.', color: '#8b5cf6' },
]

const steps = [
  { n: '01', title: 'Upload Your Resume', desc: 'Run a simulated resume review for ATS-style compatibility and skill-gap insights.' },
  { n: '02', title: 'Setup Your Interview', desc: 'Choose role, company, difficulty, and interview type — HR, Technical, Aptitude, Combined or Resume-based.' },
  { n: '03', title: 'Practise Your Answers', desc: 'Work through the question set and answer by speaking or typing at your own pace.' },
  { n: '04', title: 'Review Your Progress', desc: 'See your practice progress, strengths and improvement areas in one place.' },
]

const audience = [
  { icon: GraduationCap, title: 'Students', desc: 'Practise mock interviews, review your resume, and follow a weekly roadmap built for placement season.', color: '#7c5cfc' },
  { icon: Building2, title: 'Placement Cells', desc: 'Publish and manage campus placement drives for your college from a dedicated officer dashboard.', color: '#3b82f6' },
  { icon: Users, title: 'Educators', desc: 'Give cohorts structured interview practice and share a consistent preparation workflow.', color: '#10b981' },
]

const faqs = [
  { q: 'How do the mock interviews work?', a: 'Each session uses a prepared set of questions for your selected branch, role, company and difficulty. You answer by speaking or typing, and move through the questions at your own pace.' },
  { q: 'Does MockMate support problem solving?', a: 'Yes. Problem Solving is a standalone coding-practice workspace with AI-generated DSA problems, sample and hidden tests, hints and adaptive difficulty. It is separate from mock interviews, so you can practise without starting an interview.' },
  { q: 'How is the Placement Readiness Index (PRI) calculated?', a: "PRI is a composite score (0–100) that brings together resume strength, interview practice, technical skills, communication quality and consistency of practice." },
  { q: 'Can placement cells use MockMate?', a: 'Yes. Placement officers get a dedicated dashboard for publishing and managing campus job postings and drives for their college, at no cost.' },
]

export default function Landing({ onNavigate, dark, onToggleDark }: LandingProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Navbar */}
      <nav className="sticky top-0 z-50 glass border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[var(--radius-sm)] gradient-bg flex items-center justify-center">
              <BrainCircuit size={18} className="text-white" />
            </div>
            <span className="text-base font-extrabold" style={{ color: 'var(--text-primary)' }}>MockMate</span>
          </div>
          <div className="hidden md:flex items-center gap-6 flex-1 justify-center">
            {['Features', 'How it Works', 'FAQ'].map(l => (
              <a key={l} href={`#${l.toLowerCase().replace(' ', '-')}`} className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--accent-from)] transition-all-smooth">{l}</a>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onToggleDark} className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-from)] transition-all-smooth">
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('login-selection')}>Log in</Button>
            <Button size="sm" onClick={() => onNavigate('login-selection')}>Get Started</Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden min-h-[88vh] flex items-center">
        {/* Background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full opacity-20" style={{ background: 'radial-gradient(circle, var(--accent-from) 0%, transparent 70%)', filter: 'blur(60px)' }} />
          <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full opacity-15" style={{ background: 'radial-gradient(circle, var(--accent-to) 0%, transparent 70%)', filter: 'blur(60px)' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-5" style={{ background: 'radial-gradient(circle, var(--accent-from) 0%, transparent 60%)', filter: 'blur(80px)' }} />
        </div>

        <div className="max-w-6xl mx-auto px-6 py-24 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--accent-soft)] border border-[var(--border)] mb-6">
              <Zap size={13} className="text-[var(--accent-from)]" />
              <span className="text-xs font-semibold text-[var(--accent-from)]">Smart Interview Assessment &amp; Placement Readiness System</span>
            </div>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] mb-6 tracking-tight">
              Ace Every Interview,{' '}
              <span className="gradient-text">Land Your Dream Job</span>
            </h1>
            <p className="text-lg text-[var(--text-secondary)] mb-10 leading-relaxed max-w-xl mx-auto">
              MockMate brings mock interview practice, resume review, placement readiness tracking and a guided learning roadmap together in one place.
            </p>
            <div className="flex items-center gap-4 justify-center flex-wrap">
              <Button size="lg" onClick={() => onNavigate('login-selection')}>
                Start for Free <ArrowRight size={17} />
              </Button>
              <Button variant="secondary" size="lg">
                <Play size={15} />
                Watch Demo
              </Button>
            </div>
            <div className="flex items-center gap-8 justify-center mt-10 text-sm text-[var(--text-muted)] flex-wrap">
              <span className="flex items-center gap-1.5"><BrainCircuit size={14} className="text-[var(--accent-from)]" />Mock Interview Practice</span>
              <span className="flex items-center gap-1.5"><Target size={14} className="text-[var(--accent-from)]" />Resume Review</span>
              <span className="flex items-center gap-1.5"><Building2 size={14} className="text-[var(--accent-from)]" />Placement Cell Tools</span>
            </div>
          </div>

          {/* Hero mockup */}
          <div className="mt-16 relative">
            <div className="glass rounded-[var(--radius-xl)] border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden max-w-4xl mx-auto" style={{ boxShadow: '0 24px 80px rgba(124,92,252,0.2), 0 8px 32px rgba(0,0,0,0.15)' }}>
              {/* Mock browser bar */}
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="w-3 h-3 rounded-full bg-green-400" />
                <div className="ml-3 flex-1 h-5 rounded-full bg-[var(--accent-soft)] text-[10px] text-[var(--text-muted)] flex items-center px-3">app.mockmate.app/dashboard</div>
              </div>
              {/* Mock dashboard preview */}
              <div className="p-6 bg-[var(--bg-subtle)] grid grid-cols-3 gap-4">
                {[{ l: 'PRI Score', v: '—', c: '#7c5cfc' }, { l: 'Interviews Done', v: '0', c: '#3b82f6' }, { l: 'Resume Score', v: '—', c: '#10b981' }].map(s => (
                  <div key={s.l} className="glass rounded-[var(--radius-md)] p-4 border border-[var(--border)]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{s.l}</p>
                    <p className="text-2xl font-extrabold mt-1" style={{ color: s.c }}>{s.v}</p>
                  </div>
                ))}
                <div className="col-span-3 glass rounded-[var(--radius-md)] p-4 border border-[var(--border)]">
                  <p className="text-xs font-semibold text-[var(--text-muted)] mb-3">Skill Progress</p>
                  <div className="space-y-2">
                    {[{ l: 'Data Structures', v: 0 }, { l: 'System Design', v: 0 }, { l: 'Communication', v: 0 }].map(s => (
                      <div key={s.l} className="flex items-center gap-3">
                        <span className="text-xs text-[var(--text-secondary)] w-32">{s.l}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-[var(--accent-soft)]">
                          <div className="h-1.5 rounded-full gradient-bg" style={{ width: `${s.v}%` }} />
                        </div>
                        <span className="text-xs font-bold text-[var(--text-primary)] w-8 text-right">{s.v}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <Badge>Features</Badge>
            <h2 className="text-4xl font-extrabold mt-4 mb-4">Everything you need to get placed</h2>
            <p className="text-[var(--text-secondary)] max-w-xl mx-auto">From resume to offer letter — MockMate covers every step of your placement journey.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(f => (
              <Card key={f.title} className="p-6 hover:shadow-[var(--shadow-lg)] cursor-default group">
                <div className="w-11 h-11 rounded-[var(--radius-md)] flex items-center justify-center mb-4 transition-all-smooth group-hover:scale-110" style={{ background: `${f.color}18`, color: f.color }}>
                  <f.icon size={22} />
                </div>
                <h3 className="font-bold mb-2 text-[var(--text-primary)]">{f.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{f.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-24 px-6" style={{ background: 'var(--bg-subtle)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <Badge variant="info">Process</Badge>
            <h2 className="text-4xl font-extrabold mt-4 mb-4">How MockMate Works</h2>
            <p className="text-[var(--text-secondary)] max-w-xl mx-auto">Four simple steps from signup to your dream placement.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            {steps.map((s, i) => (
              <div key={s.n} className="relative">
                <div className="glass rounded-[var(--radius-xl)] p-6 border border-[var(--border)] h-full">
                  <div className="text-4xl font-extrabold gradient-text mb-4 leading-none">{s.n}</div>
                  <h3 className="font-bold text-[var(--text-primary)] mb-2">{s.title}</h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{s.desc}</p>
                </div>
                {i < steps.length - 1 && (
                  <ArrowRight size={20} className="absolute top-8 -right-3 text-[var(--accent-from)] hidden lg:block z-10" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <Badge variant="success">Who it's for</Badge>
            <h2 className="text-4xl font-extrabold mt-4 mb-4">Built for Students & Institutions</h2>
            <p className="text-[var(--text-secondary)] max-w-xl mx-auto">MockMate supports learners and the placement teams who guide them.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {audience.map(a => (
              <Card key={a.title} glass className="p-6">
                <div className="w-11 h-11 rounded-[var(--radius-md)] flex items-center justify-center mb-4" style={{ background: `${a.color}18`, color: a.color }}>
                  <a.icon size={22} />
                </div>
                <h3 className="font-bold mb-2 text-[var(--text-primary)]">{a.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{a.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <Badge variant="info">FAQ</Badge>
            <h2 className="text-4xl font-extrabold mt-4 mb-4">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <div key={i} className="glass rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left gap-4 cursor-pointer"
                >
                  <span className="font-semibold text-[var(--text-primary)] text-sm">{f.q}</span>
                  <ChevronDown size={16} className={`text-[var(--accent-from)] flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4">
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{f.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6" style={{ background: 'var(--bg-subtle)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <div className="glass rounded-[var(--radius-xl)] p-12 border border-[var(--border)]" style={{ boxShadow: '0 0 80px rgba(124,92,252,0.15)' }}>
            <div className="w-14 h-14 rounded-[var(--radius-lg)] gradient-bg flex items-center justify-center mx-auto mb-6 shadow-[var(--shadow-glow)]">
              <BrainCircuit size={28} className="text-white" />
            </div>
            <h2 className="text-4xl font-extrabold mb-4">Ready to ace your next interview?</h2>
            <p className="text-[var(--text-secondary)] mb-8 leading-relaxed">Explore mock interviews, resume review and campus job tools — all free to use.</p>
            <Button size="lg" onClick={() => onNavigate('login-selection')}>
              Create Free Account <ArrowRight size={17} />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded gradient-bg flex items-center justify-center">
              <BrainCircuit size={13} className="text-white" />
            </div>
            <span className="text-sm font-bold text-[var(--text-primary)]">MockMate</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">© 2025 MockMate. All rights reserved.</p>
          <div className="flex gap-4 text-xs text-[var(--text-muted)]">
            <button onClick={() => onNavigate('officer-login')} className="hover:text-[var(--accent-from)] transition-all-smooth cursor-pointer">Placement Officer Login</button>
            <a href="#" className="hover:text-[var(--accent-from)] transition-all-smooth">Privacy</a>
            <a href="#" className="hover:text-[var(--accent-from)] transition-all-smooth">Terms</a>
            <a href="#" className="hover:text-[var(--accent-from)] transition-all-smooth">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
