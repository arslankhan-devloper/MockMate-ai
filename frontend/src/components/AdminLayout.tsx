import { type ReactNode, useState } from 'react'
import {
  LayoutDashboard,
  Building2,
  Users,
  GraduationCap,
  Briefcase,
  ScrollText,
  BarChart3,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react'
import { Avatar, Badge, Button } from './ui'

export type AdminPage =
  | 'admin-dashboard'
  | 'admin-colleges'
  | 'admin-officers'
  | 'admin-students'
  | 'admin-drives'
  | 'admin-audit-logs'
  | 'admin-analytics'

interface AdminLayoutProps {
  children: ReactNode
  page: AdminPage
  onNavigate: (p: AdminPage) => void
  dark: boolean
  onToggleDark: () => void
  onLogout: () => void
  adminEmail: string
  adminName?: string
  pendingCount?: number
}

const adminNavItems = [
  { id: 'admin-dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'admin-colleges' as const, label: 'Colleges', icon: Building2 },
  { id: 'admin-officers' as const, label: 'Placement Officers', icon: Users, showBadge: true },
  { id: 'admin-students' as const, label: 'Students', icon: GraduationCap },
  { id: 'admin-drives' as const, label: 'Placement Drives', icon: Briefcase },
  { id: 'admin-audit-logs' as const, label: 'Audit Logs', icon: ScrollText },
  { id: 'admin-analytics' as const, label: 'Institutional Analytics', icon: BarChart3 },
]

export default function AdminLayout({
  children,
  page,
  onNavigate,
  dark,
  onToggleDark,
  onLogout,
  adminEmail,
  adminName = 'Super Admin',
  pendingCount = 0,
}: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        style={{
          width: 260,
          background: 'var(--sidebar-bg)',
          backdropFilter: 'blur(24px)',
          borderRight: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {/* Header Branding */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--border)]">
          <div className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center shadow-[var(--shadow-sm)] bg-gradient-to-br from-indigo-600 to-purple-600 text-white">
            <ShieldCheck size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-extrabold text-[var(--text-primary)]">MockMate</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-sm bg-purple-500/20 text-purple-400">
                Admin
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate">Institution Control Center</p>
          </div>
          <button
            className="md:hidden p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
          {adminNavItems.map(({ id, label, icon: Icon, showBadge }) => {
            const active = page === id
            return (
              <button
                key={id}
                onClick={() => {
                  onNavigate(id)
                  setSidebarOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-[var(--radius-md)] text-sm font-semibold transition-all-smooth cursor-pointer text-left ${
                  active
                    ? 'gradient-bg text-white shadow-[var(--shadow-sm)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon size={17} className={active ? 'text-white' : 'text-[var(--text-muted)]'} />
                <span className="flex-1 truncate">{label}</span>
                {showBadge && pendingCount > 0 && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      active
                        ? 'bg-white text-purple-700'
                        : 'bg-amber-500 text-white'
                    }`}
                  >
                    {pendingCount}
                  </span>
                )}
                {active && <ChevronRight size={14} className="opacity-80" />}
              </button>
            )
          })}
        </nav>

        {/* Footer Admin Persona */}
        <div className="p-3 border-t border-[var(--border)]">
          <div className="flex items-center gap-3 p-2 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)]">
            <Avatar name={adminName} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[var(--text-primary)] truncate">{adminName}</p>
              <p className="text-[11px] text-[var(--text-muted)] truncate">{adminEmail}</p>
            </div>
            <button
              onClick={onLogout}
              title="Sign Out"
              className="p-1.5 rounded-sm text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header
          className="h-16 flex items-center justify-between px-4 md:px-8 border-b border-[var(--border)]"
          style={{ background: 'var(--header-bg)', backdropFilter: 'blur(20px)' }}
        >
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-2 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] cursor-pointer"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <Badge variant="default" className="text-xs font-bold">
                Super Admin Access
              </Badge>
              <span className="text-xs text-[var(--text-muted)]">• Full Institution Control</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onToggleDark}
              className="p-2 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] transition-colors cursor-pointer"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div className="h-5 w-px bg-[var(--border)] mx-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="text-xs font-semibold text-red-500 hover:bg-red-500/10"
            >
              <LogOut size={14} />
              Sign Out
            </Button>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8" style={{ background: 'var(--bg)' }}>
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  )
}
