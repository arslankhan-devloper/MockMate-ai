import { useState } from 'react'
import {
  User, Mail, Phone, Building2, GraduationCap, Save, SkipForward, X,
  Info, ShieldCheck, Briefcase, AlertCircle
} from 'lucide-react'
import { Card, Button, Badge, Input, SelectField } from '../components/ui'
import type { Role } from '../components/Layout'
import { type ProfileData, type ProfileStatus } from '../data/profiles'
import { engineeringBranches } from '../data/campusJobs'

interface ProfileSetupProps {
  role: Role
  status: ProfileStatus
  initial: ProfileData
  saving?: boolean
  saveError?: string | null
  onSave: (data: ProfileData) => void | Promise<void>
  onSkip: () => void
  onCancel: () => void
}

const yearOptions = ['2026', '2027', '2028', '2029']

export default function ProfileSetup({
  role, status, initial, saving = false, saveError = null, onSave, onSkip, onCancel,
}: ProfileSetupProps) {
  const [data, setData] = useState<ProfileData>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isStudent = role === 'student'

  const set = (key: keyof ProfileData, value: string) => {
    setData(d => ({ ...d, [key]: value }))
    setErrors(e => (e[key] ? { ...e, [key]: '' } : e))
  }

  // Validation runs only when the user chooses to save. Email and college are
  // not validated here: email is owned by the account and college membership is
  // assigned by an administrator, so neither is editable in this form.
  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (!data.fullName.trim()) e.fullName = 'Full name is required.'
    if (isStudent) {
      if (!data.branch.trim()) e.branch = 'Select your branch.'
      if (!data.gradYear.trim()) e.gradYear = 'Select your graduation year.'
    } else {
      if (!data.designation.trim()) e.designation = 'Designation is required.'
      if (!data.department.trim()) e.department = 'Department is required.'
    }
    return e
  }

  const handleSave = () => {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length > 0) return
    void onSave({ ...data })
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mb-1">Complete your profile</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {isStudent
              ? 'Add a few details so MockMate can tailor practice and campus drives to you. This step is optional.'
              : 'Add your officer details. This step is optional and can be completed later.'}
          </p>
        </div>
        <Badge variant={status === 'complete' ? 'success' : 'warning'}>
          {status === 'complete' ? 'Saved to your account' : 'Not saved yet'}
        </Badge>
      </div>

      {/* Profile form */}
      <Card className="p-6 space-y-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Profile details</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Full name"
            value={data.fullName}
            onChange={e => set('fullName', e.target.value)}
            placeholder="e.g. Your name"
            leftIcon={<User size={14} />}
            error={errors.fullName}
          />
          <Input
            label="Email"
            type="email"
            value={data.email}
            readOnly
            placeholder="Managed by your account"
            leftIcon={<Mail size={14} />}
            className="opacity-70 cursor-not-allowed"
          />
          <Input
            label="Phone (optional)"
            value={data.phone}
            onChange={e => set('phone', e.target.value)}
            placeholder="+91 90000 00000"
            leftIcon={<Phone size={14} />}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-secondary)]">College / Institution</label>
            <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-4 py-2.5 text-sm text-[var(--text-secondary)] flex items-center gap-2 opacity-90">
              <Building2 size={14} className="text-[var(--text-muted)]" />
              <span>{data.collegeName || 'Not assigned yet'}</span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          Your college is assigned by an administrator and can’t be changed here. It scopes which In-Campus drives you can see.
        </p>

        {isStudent ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label="Branch"
              options={['Select a branch', ...engineeringBranches]}
              value={data.branch || 'Select a branch'}
              onChange={v => set('branch', v === 'Select a branch' ? '' : v)}
            />
            <SelectField
              label="Graduation year"
              options={['Select a year', ...yearOptions]}
              value={data.gradYear || 'Select a year'}
              onChange={v => set('gradYear', v === 'Select a year' ? '' : v)}
            />
            {(errors.branch || errors.gradYear) && (
              <p className="text-xs text-red-500 sm:col-span-2 -mt-2">{errors.branch || errors.gradYear}</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Designation"
              value={data.designation}
              onChange={e => set('designation', e.target.value)}
              placeholder="e.g. Placement Officer"
              leftIcon={<Briefcase size={14} />}
              error={errors.designation}
            />
            <Input
              label="Department"
              value={data.department}
              onChange={e => set('department', e.target.value)}
              placeholder="e.g. Training & Placement Cell"
              error={errors.department}
            />
          </div>
        )}

        {saveError && (
          <div className="flex items-start gap-2.5 p-3 rounded-[var(--radius-md)] bg-red-500/10 border border-red-500/20">
            <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-500 leading-relaxed">{saveError}</p>
          </div>
        )}

        <div className="flex items-start gap-2.5 p-3 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--border)]">
          <ShieldCheck size={14} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            <strong className="text-[var(--text-primary)]">Saved to your account.</strong> Your name, phone and {isStudent ? 'course' : 'role'} details are stored securely and linked to your sign-in. Your role and college can only be changed by an administrator.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
          {status === 'complete' ? (
            <Button variant="ghost" onClick={onCancel} disabled={saving}>
              <X size={14} /> Cancel
            </Button>
          ) : (
            <Button variant="ghost" onClick={onSkip} disabled={saving}>
              <SkipForward size={14} /> Skip for Now
            </Button>
          )}
          <div className="flex items-center gap-2">
            {status !== 'complete' && (
              <p className="text-[11px] text-[var(--text-muted)] hidden sm:flex items-center gap-1.5">
                <Info size={12} /> You can complete this later from your dashboard.
              </p>
            )}
            <Button onClick={handleSave} loading={saving} disabled={saving}>
              <Save size={14} /> {saving ? 'Saving…' : 'Save Profile'}
            </Button>
          </div>
        </div>
      </Card>

      <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
        <GraduationCap size={12} /> Skipping does not create or save any profile data.
      </p>
    </div>
  )
}
