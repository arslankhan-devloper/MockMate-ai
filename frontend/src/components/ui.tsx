import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type AnchorHTMLAttributes } from 'react'

// ── Shared UI Primitives ─────────────────────────────────────────

interface CardProps {
  children: ReactNode
  className?: string
  glass?: boolean
  onClick?: () => void
}

export function Card({ children, className = '', glass = false, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-[var(--radius-lg)] border transition-all-smooth ${glass ? 'glass' : 'bg-[var(--surface-raised)]'} border-[var(--border)] shadow-[var(--shadow-md)] ${onClick ? 'cursor-pointer hover:shadow-[var(--shadow-lg)] hover:scale-[1.01]' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', children, loading, className = '', ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-[var(--radius-md)] transition-all-smooth cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-5 py-2.5 text-sm', lg: 'px-7 py-3.5 text-base' }
  const variants = {
    primary: 'gradient-bg text-white shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-glow)] hover:opacity-90 active:scale-[0.98]',
    secondary: 'bg-[var(--accent-soft)] text-[var(--accent-from)] border border-[var(--border)] hover:bg-[var(--accent-from)] hover:text-white',
    ghost: 'text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-from)]',
    danger: 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white',
  }
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {loading && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

// Anchor styled like Button, for external links (opens in a new tab).
export function LinkButton({ variant = 'primary', size = 'md', children, className = '', ...props }: LinkButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-[var(--radius-md)] transition-all-smooth cursor-pointer'
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-5 py-2.5 text-sm', lg: 'px-7 py-3.5 text-base' }
  const variants = {
    primary: 'gradient-bg text-white shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-glow)] hover:opacity-90 active:scale-[0.98]',
    secondary: 'bg-[var(--accent-soft)] text-[var(--accent-from)] border border-[var(--border)] hover:bg-[var(--accent-from)] hover:text-white',
    ghost: 'text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-from)]',
    danger: 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white',
  }
  return (
    <a className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </a>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export function Input({ label, error, leftIcon, rightIcon, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-[var(--text-secondary)]">{label}</label>}
      <div className="relative">
        {leftIcon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">{leftIcon}</span>}
        <input
          className={`w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent-from)] focus:ring-2 focus:ring-[var(--accent-from)]/20 transition-all-smooth ${leftIcon ? 'pl-10' : ''} ${rightIcon ? 'pr-10' : ''} ${className}`}
          {...props}
        />
        {rightIcon && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">{rightIcon}</span>}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

interface BadgeProps { children: ReactNode; variant?: 'default' | 'success' | 'warning' | 'error' | 'info'; className?: string }

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variants = {
    default: 'bg-[var(--accent-soft)] text-[var(--accent-from)]',
    success: 'bg-emerald-500/10 text-emerald-500',
    warning: 'bg-amber-500/10 text-amber-600',
    error: 'bg-red-500/10 text-red-500',
    info: 'bg-blue-500/10 text-blue-500',
  }
  return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${variants[variant]} ${className}`}>{children}</span>
}

interface ProgressBarProps { value: number; max?: number; color?: string; size?: 'sm' | 'md'; label?: string; showValue?: boolean }

export function ProgressBar({ value, max = 100, color, size = 'md', label, showValue = false }: ProgressBarProps) {
  const pct = Math.min(100, (value / max) * 100)
  const heights = { sm: 'h-1.5', md: 'h-2.5' }
  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-1.5">
          {label && <span className="text-xs text-[var(--text-secondary)]">{label}</span>}
          {showValue && <span className="text-xs font-semibold text-[var(--text-primary)]">{value}%</span>}
        </div>
      )}
      <div className={`w-full bg-[var(--accent-soft)] rounded-full ${heights[size]}`}>
        <div
          className={`${heights[size]} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${pct}%`, background: color ?? 'linear-gradient(90deg, var(--accent-from), var(--accent-to))' }}
        />
      </div>
    </div>
  )
}

interface AvatarProps { src?: string; name: string; size?: 'sm' | 'md' | 'lg' | 'xl' }

export function Avatar({ src, name, size = 'md' }: AvatarProps) {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base', xl: 'w-16 h-16 text-xl' }
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return src ? (
    <img src={src} alt={name} className={`${sizes[size]} rounded-full object-cover border-2 border-[var(--border)]`} />
  ) : (
    <div className={`${sizes[size]} rounded-full gradient-bg flex items-center justify-center font-bold text-white border-2 border-[var(--border)]`}>{initials}</div>
  )
}

interface StatCardProps { label: string; value: string; sub?: string; icon?: ReactNode; trend?: number; color?: string }

export function StatCard({ label, value, sub, icon, trend, color }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{label}</p>
        {icon && <div className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center" style={{ background: color ? `${color}20` : 'var(--accent-soft)', color: color ?? 'var(--accent-from)' }}>{icon}</div>}
      </div>
      <p className="text-2xl font-extrabold text-[var(--text-primary)] mb-0.5">{value}</p>
      <div className="flex items-center gap-2">
        {sub && <p className="text-xs text-[var(--text-muted)]">{sub}</p>}
        {trend !== undefined && (
          <span className={`text-xs font-semibold ${trend >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
    </Card>
  )
}

export function TabBar({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="flex gap-1 p-1 bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--border)] w-fit">
      {tabs.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-4 py-1.5 rounded-[var(--radius-sm)] text-sm font-semibold transition-all-smooth cursor-pointer ${active === t ? 'gradient-bg text-white shadow-[var(--shadow-sm)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

export function SelectField({ label, options, value, onChange }: { label?: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-[var(--text-secondary)]">{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-from)] focus:ring-2 focus:ring-[var(--accent-from)]/20 transition-all-smooth cursor-pointer"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
