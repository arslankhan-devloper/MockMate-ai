import { ShieldAlert, ArrowLeftRight, LogOut } from 'lucide-react'
import {
  type PresentationRole,
  setPresentationRole,
} from '../lib/presentationMode'

interface PresentationBannerProps {
  currentRole: PresentationRole
  onRoleChange: (newRole: PresentationRole) => void
  onExit: () => void
}

export default function PresentationBanner({
  currentRole,
  onRoleChange,
  onExit,
}: PresentationBannerProps) {
  const isSuperAdmin = currentRole === 'super_admin'

  return (
    <div className="bg-amber-500/10 dark:bg-amber-950/40 border-b border-amber-500/30 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded bg-amber-500 text-white uppercase text-[10px] tracking-wider">
            <ShieldAlert size={12} />
            Localhost Only
          </span>
          <span className="font-semibold text-amber-800 dark:text-amber-100">
            Faculty Presentation Mode Active:
          </span>
          <span className="hidden sm:inline text-amber-700 dark:text-amber-300">
            Viewing interface as{' '}
            <strong className="underline decoration-amber-500/50">
              {isSuperAdmin ? 'Super Administrator' : 'College Placement Officer'}
            </strong>
            . Live database RLS & backend auth remain untouched.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const target = isSuperAdmin ? 'placement-officer' : 'super_admin'
              setPresentationRole(target)
              onRoleChange(target)
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 font-medium transition-colors cursor-pointer"
          >
            <ArrowLeftRight size={12} />
            Switch to {isSuperAdmin ? 'Placement Officer' : 'Super Admin'}
          </button>

          <button
            onClick={() => {
              setPresentationRole(null)
              onExit()
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 font-medium transition-colors cursor-pointer"
          >
            <LogOut size={12} />
            Exit Demo
          </button>
        </div>
      </div>
    </div>
  )
}
