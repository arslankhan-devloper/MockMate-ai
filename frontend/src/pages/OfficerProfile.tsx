import { useEffect, useState } from 'react'
import {
  UserCircle, Mail, Phone, Building2, Briefcase, Save, X, Edit3, ShieldCheck, CheckCircle2, AlertCircle, Info,
} from 'lucide-react'
import { Card, Button, Badge, Input, Avatar } from '../components/ui'
import type { ProfileData, ProfileStatus } from '../data/profiles'

interface OfficerProfileProps {
  name: string
  collegeName: string
  status: ProfileStatus
  initial: ProfileData
  saving?: boolean
  saveError?: string | null
  onSave: (data: ProfileData) => Promise<boolean> | boolean
}

const statusMeta: Record<ProfileStatus, { label: string; variant: 'success' | 'warning' | 'info' }> = {
  complete: { label: 'Profile complete', variant: 'success' },
  skipped: { label: 'Profile not completed', variant: 'warning' },
  incomplete: { label: 'Profile incomplete', variant: 'info' },
}

export default function OfficerProfile({ name, collegeName, status, initial, saving = false, saveError = null, onSave }: OfficerProfileProps) {
  const [editing, setEditing] = useState(false)
  const [data, setData] = useState<ProfileData>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  // Keep the form in sync with reloaded/saved profile data while not editing.
  useEffect(() => {
    if (!editing) setData(initial)
  }, [initial, editing])

  const set = (key: keyof ProfileData, value: string) => {
    setData(d => ({ ...d, [key]: value }))
    setErrors(e => (e[key] ? { ...e, [key]: '' } : e))
    setSaved(false)
  }

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (!data.fullName.trim()) e.fullName = 'Full name is required.'
    if (!data.designation.trim()) e.designation = 'Designation is required.'
    if (!data.department.trim()) e.department = 'Department is required.'
    return e
  }

  const handleSave = async () => {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length > 0) return
    const ok = await onSave({ ...data })
    if (ok) {
      setEditing(false)
      setSaved(true)
    }
  }

  const cancelEdit = () => {
    setData(initial)
    setErrors({})
    setEditing(false)
  }

  const contactRows = [
    { icon: Mail, label: 'Email', value: data.email || '—' },
    { icon: Phone, label: 'Phone', value: data.phone || '—' },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)] mb-1">Profile</h1>
          <p className="text-sm text-[var(--text-secondary)]">Your placement officer details.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={statusMeta[status].variant}>{statusMeta[status].label}</Badge>
          {!editing ? (
            <Button size="sm" variant="secondary" onClick={() => { setData(initial); setSaved(false); setEditing(true) }}>
              <Edit3 size={13} /> Edit Profile
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}><X size={13} /> Cancel</Button>
              <Button size="sm" onClick={handleSave} loading={saving} disabled={saving}><Save size={13} /> {saving ? 'Saving…' : 'Save Changes'}</Button>
            </>
          )}
        </div>
      </div>

      {saved && !editing && (
        <Card className="p-3 flex items-center gap-2.5">
          <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">Profile saved to your account.</p>
        </Card>
      )}

      {saveError && editing && (
        <Card className="p-3 flex items-center gap-2.5 border-red-500/30">
          <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-500 leading-relaxed">{saveError}</p>
        </Card>
      )}

      {/* Header */}
      <Card className="p-6">
        <div className="flex items-start gap-5 flex-wrap">
          <Avatar name={data.fullName || name} size="xl" />
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Full name"
                  value={data.fullName}
                  onChange={e => set('fullName', e.target.value)}
                  placeholder="e.g. Your name"
                  leftIcon={<UserCircle size={14} />}
                  error={errors.fullName}
                />
                <Input
                  label="Email"
                  value={data.email}
                  readOnly
                  placeholder="Managed by your account"
                  leftIcon={<Mail size={14} />}
                  className="opacity-70 cursor-not-allowed"
                />
              </div>
            ) : (
              <>
                <h2 className="text-xl font-extrabold text-[var(--text-primary)] mb-0.5">{data.fullName || name}</h2>
                <p className="text-sm text-[var(--text-secondary)] mb-2">{data.designation || 'Placement Officer'} · {data.department || 'Training & Placement Cell'}</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="info"><Building2 size={11} /> {data.collegeName || collegeName || 'College not set'}</Badge>
                  <Badge variant="default">Placement Officer</Badge>
                </div>
              </>
            )}
          </div>
        </div>
        <p className="text-[11px] text-[var(--text-muted)] mt-4 flex items-center gap-1.5">
          <Info size={12} /> Your name, phone, designation and department are saved to your account. Your college and role are assigned by an administrator.
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact information */}
        <Card className="p-6 space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Contact Information</p>
          {editing ? (
            <div className="space-y-3">
              <Input label="Email" value={data.email} readOnly leftIcon={<Mail size={13} />} className="opacity-70 cursor-not-allowed" />
              <Input label="Phone" value={data.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 90000 00000" leftIcon={<Phone size={13} />} />
            </div>
          ) : (
            <div className="space-y-3">
              {contactRows.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <r.icon size={14} className="text-[var(--accent-from)] flex-shrink-0" />
                  <span className="text-sm text-[var(--text-secondary)]">{r.value}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Role details */}
        <Card className="p-6 space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Role Details</p>
          {editing ? (
            <div className="space-y-3">
              <Input label="Designation" value={data.designation} onChange={e => set('designation', e.target.value)} placeholder="e.g. Placement Officer" leftIcon={<Briefcase size={13} />} error={errors.designation} />
              <Input label="Department" value={data.department} onChange={e => set('department', e.target.value)} placeholder="e.g. Training & Placement Cell" error={errors.department} />
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { label: 'Designation', value: data.designation || 'Placement Officer' },
                { label: 'Department', value: data.department || 'Training & Placement Cell' },
                { label: 'Role', value: 'Placement Officer' },
              ].map(row => (
                <div key={row.label} className="flex items-start gap-3">
                  <span className="text-xs font-semibold text-[var(--text-muted)] w-28 flex-shrink-0">{row.label}</span>
                  <span className="text-sm text-[var(--text-primary)] break-all">{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* College (assigned, drives job-posting ownership) */}
      <Card className="p-6 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">College</p>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
            <Building2 size={16} className="text-[var(--accent-from)]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{collegeName || 'Not assigned'}</p>
            <p className="text-[11px] text-[var(--text-muted)]">Assigned by an administrator. Jobs you post are linked to this college, so In-Campus drives stay scoped to it.</p>
          </div>
        </div>
      </Card>

      <div className="flex items-start gap-2.5 p-3 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--border)]">
        <ShieldCheck size={14} className="text-[var(--accent-from)] flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
          Your role and college are verified server-side on every request and cannot be changed from this screen.
        </p>
      </div>
    </div>
  )
}
