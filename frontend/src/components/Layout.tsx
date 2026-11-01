import { type ReactNode } from 'react'
import {
  LayoutDashboard, FileText, Mic, Code2, BarChart3, Map, User, Settings,
  BrainCircuit, Sun, Moon, Bell, LogOut, ChevronRight, Menu, X,
  Building2, Briefcase, UserCircle
} from 'lucide-react'
import { useState } from 'react'
import { Avatar } from './ui'

type Page =
  | 'landing' | 'login' | 'signup' | 'forgot'
  | 'dashboard' | 'resume' | 'interview-setup' | 'ai-interview'
  | 'coding-interview' | 'problem-solving' | 'practice'
  | 'report' | 'roadmap' | 'analytics'
  | 'placement-cell' | 'job-posting' | 'job-portal'
  | 'profile-setup' | 'officer-profile' | 'profile' | 'settings'

// Role model. The role comes from the signed-in user's `profiles` row (derived
// server-side from the verified token); the backend re-checks it on every
// request, so this value only drives which navigation the UI shows.
export type Role = 'student' | 'placement-officer'

interface LayoutProps {
  children: ReactNode
  page: Page
  onNavigate: (p: Page) => void
  dark: boolean
  onToggleDark: () => void
  role: Role
  onLogout: () => void
  userName: string
  userEmail: string
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'resume', label: 'Resume Analysis', icon: FileText },
  { id: 'interview-setup', label: 'Interview Setup', icon: Mic },
  { id: 'problem-solving', label: 'Practice Hub', icon: Code2 },
  { id: 'report', label: 'Interview Report', icon: BarChart3 },
  { id: 'roadmap', label: 'Roadmap', icon: Map },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'placement-cell', label: 'Placement Cell', icon: Building2 },
  { id: 'job-portal', label: 'Job Portal', icon: Briefcase },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const

// Officer-specific navigation: only workflow-relevant items.
const officerNavItems = [
  { id: 'placement-cell', label: 'Officer Dashboard', icon: Building2 },
  { id: 'job-posting', label: 'Job Posting', icon: Briefcase },
  { id: 'officer-profile', label: 'Profile', icon: UserCircle },
] as const

export default function Layout({ children, page, onNavigate, dark, onToggleDark, role, onLogout, userName, userEmail }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isOfficer = role === 'placement-officer'

  // Students never see Placement Cell; officers only see officer-relevant items.
  const visibleNav: { id: Page; label: string; icon: typeof LayoutDashboard }[] = isOfficer
    ? [...officerNavItems]
    : navItems.filter(item => item.id !== 'placement-cell')

  // Display details come from the signed-in user's own profile (empty until
  // they complete it) — never seeded names.
  const persona = { name: userName || (isOfficer ? 'Placement Officer' : 'Student'), email: userEmail || 'No email set' }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 md:static md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{
          width: 240,
          background: 'var(--sidebar-bg)',
          backdropFilter: 'blur(24px)',
          borderRight: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[var(--border)]">
          <div className="w-8 h-8 rounded-[var(--radius-sm)] gradient-bg flex items-center justify-center shadow-[var(--shadow-sm)]">
            <BrainCircuit size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-[var(--text-primary)] leading-none">MockMate</p>
            <p className="text-[10px] text-[var(--text-muted)] font-medium mt-0.5">Interview Practice</p>
          </div>
          <button className="ml-auto md:hidden p-1 text-[var(--text-muted)]" onClick={() => setSidebarOpen(false)}>
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-0.5">
          {visibleNav.map(({ id, label, icon: Icon }) => {
            const active = page === id
            return (
              <button
                key={id}
                onClick={() => { onNavigate(id as Page); setSidebarOpen(false) }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm font-semibold transition-all-smooth cursor-pointer w-full text-left group ${active ? 'gradient-bg text-white shadow-[var(--shadow-sm)]' : 'text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-from)]'}`}
              >
                <Icon size={17} className={active ? 'text-white' : 'text-[var(--text-muted)] group-hover:text-[var(--accent-from)]'} />
                {label}
                {active && <ChevronRight size={14} className="ml-auto opacity-70" />}
              </button>
            )
          })}
        </nav>

        {/* User */}
        <div className="px-3 pb-4 pt-3 border-t border-[var(--border)]">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--radius-md)] hover:bg-[var(--accent-soft)] transition-all-smooth cursor-pointer">
            <Avatar name={persona.name} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{persona.name}</p>
              <p className="text-[10px] text-[var(--text-muted)] truncate">{persona.email}</p>
            </div>
            <LogOut size={14} className="text-[var(--text-muted)] flex-shrink-0" onClick={onLogout} />
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center gap-4 px-6 py-4 border-b border-[var(--border)] glass flex-shrink-0">
          <button className="md:hidden p-2 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--accent-soft)]" onClick={() => setSidebarOpen(true)}>
            <Menu size={18} />
          </button>
          <div className="flex-1">
            <p className="text-xs text-[var(--text-muted)]">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleDark}
              className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-from)] transition-all-smooth"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="relative">
              <button className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-from)] transition-all-smooth">
                <Bell size={16} />
              </button>
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-[var(--bg)]" />
            </div>
            {!isOfficer && (
              <button onClick={() => onNavigate('interview-setup')} className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] gradient-bg text-white text-xs font-semibold shadow-[var(--shadow-sm)] hover:opacity-90 transition-all-smooth">
                <Mic size={13} />
                Start Interview
              </button>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
