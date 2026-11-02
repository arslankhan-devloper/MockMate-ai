import { useState, useEffect } from 'react'
import {
  Building2,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Users,
  GraduationCap,
  Edit2,
  RefreshCw,
  AlertTriangle,
  X,
} from 'lucide-react'
import { Card, Button, Input, Badge } from '../components/ui'
import {
  listAdminColleges,
  createAdminCollege,
  updateAdminCollege,
  type AdminCollege,
} from '../lib/adminApi'
import { useAuth } from '../lib/auth'

export default function AdminColleges() {
  const { session } = useAuth()
  const token = session?.access_token

  const [colleges, setColleges] = useState<AdminCollege[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Create Modal State
  const [showAddModal, setShowAddModal] = useState(false)
  const [addName, setAddName] = useState('')
  const [addSlug, setAddSlug] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Edit Modal State
  const [editingCollege, setEditingCollege] = useState<AdminCollege | null>(null)
  const [editName, setEditName] = useState('')
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active')
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const loadColleges = async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const data = await listAdminColleges(token)
      setColleges(data)
    } catch (err: unknown) {
      console.error('[AdminColleges] Load failed:', err)
      setError('Failed to load institution directory from backend.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadColleges()
  }, [token])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !addName.trim()) return
    setAddLoading(true)
    setAddError(null)
    try {
      await createAdminCollege(token, {
        name: addName.trim(),
        slug: addSlug.trim() || undefined,
      })
      setShowAddModal(false)
      setAddName('')
      setAddSlug('')
      await loadColleges()
    } catch (err: unknown) {
      console.error('[AdminColleges] Create failed:', err)
      setAddError(err instanceof Error ? err.message : 'Failed to create college')
    } finally {
      setAddLoading(false)
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !editingCollege) return
    setEditLoading(true)
    setEditError(null)
    try {
      await updateAdminCollege(token, editingCollege.id, {
        name: editName.trim() || undefined,
        status: editStatus,
      })
      setEditingCollege(null)
      await loadColleges()
    } catch (err: unknown) {
      console.error('[AdminColleges] Update failed:', err)
      setEditError(err instanceof Error ? err.message : 'Failed to update college')
    } finally {
      setEditLoading(false)
    }
  }

  const filtered = colleges.filter(c => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.slug.toLowerCase().includes(search.toLowerCase())
    const matchesStatus =
      statusFilter === 'all' ? true : c.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--text-primary)]">
            College Management
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Provision, monitor and manage partner academic institutions and universities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={loadColleges} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus size={15} /> Add College
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="w-full md:w-80">
          <Input
            placeholder="Search by college name or slug..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            leftIcon={<Search size={15} />}
          />
        </div>

        <div className="flex items-center gap-1.5 w-full md:w-auto">
          {(['all', 'active', 'inactive'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors cursor-pointer ${
                statusFilter === s
                  ? 'bg-[var(--accent-from)] text-white'
                  : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--accent-soft)]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </Card>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Colleges Grid / Table */}
      {loading && colleges.length === 0 ? (
        <div className="py-20 text-center">
          <RefreshCw size={24} className="animate-spin text-[var(--accent-from)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-secondary)]">Loading colleges...</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <Building2 size={36} className="text-[var(--text-muted)] mx-auto mb-3" />
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">No Colleges Found</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto mb-4">
            {search ? 'Try adjusting your search query.' : 'Get started by provisioning the first institution.'}
          </p>
          {!search && (
            <Button size="sm" onClick={() => setShowAddModal(true)}>
              <Plus size={14} /> Add College
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(college => (
            <Card key={college.id} className="p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-from)] flex items-center justify-center flex-shrink-0 font-bold">
                    <Building2 size={20} />
                  </div>
                  <Badge variant={college.status === 'active' ? 'success' : 'warning'}>
                    {college.status === 'active' ? (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 size={11} /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <XCircle size={11} /> Inactive
                      </span>
                    )}
                  </Badge>
                </div>

                <h3 className="text-base font-bold text-[var(--text-primary)] mb-1 truncate" title={college.name}>
                  {college.name}
                </h3>
                <p className="text-xs font-mono text-[var(--text-muted)] mb-4">
                  slug: {college.slug}
                </p>

                <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] mb-4">
                  <div className="flex items-center gap-2">
                    <GraduationCap size={15} className="text-emerald-500" />
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">{college.studentCount ?? 0}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Students</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Users size={15} className="text-purple-500" />
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]">
                        {college.officerCount ?? 0}
                        {Boolean(college.pendingOfficerCount) && (
                          <span className="text-amber-500 text-[10px] ml-1">
                            (+{college.pendingOfficerCount} req)
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">Officers</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>Created {new Date(college.created_at).toLocaleDateString()}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingCollege(college)
                    setEditName(college.name)
                    setEditStatus(college.status)
                  }}
                  className="p-1.5 h-auto text-[var(--accent-from)]"
                >
                  <Edit2 size={13} /> Edit
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add College Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 relative">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X size={18} />
            </button>

            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">Add New College</h2>
            <p className="text-xs text-[var(--text-secondary)] mb-5">
              Colleges own and scope In-Campus placement drives.
            </p>

            {addError && (
              <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
                {addError}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <Input
                label="College Name"
                placeholder="e.g. Stanford Institute of Technology"
                required
                value={addName}
                onChange={e => {
                  setAddName(e.target.value)
                  if (!addSlug || addSlug === addName.toLowerCase().replace(/[^a-z0-9]+/g, '-')) {
                    setAddSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))
                  }
                }}
              />

              <Input
                label="Slug Identifier"
                placeholder="e.g. stanford-institute"
                value={addSlug}
                onChange={e => setAddSlug(e.target.value)}
              />

              <div className="flex items-center justify-end gap-2 pt-3">
                <Button variant="ghost" type="button" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={addLoading} disabled={addLoading || !addName.trim()}>
                  Create College
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Edit College Modal */}
      {editingCollege && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 relative">
            <button
              onClick={() => setEditingCollege(null)}
              className="absolute top-4 right-4 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X size={18} />
            </button>

            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">Edit College</h2>
            <p className="text-xs text-[var(--text-secondary)] mb-5">
              Update institutional status and naming.
            </p>

            {editError && (
              <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
                {editError}
              </div>
            )}

            <form onSubmit={handleUpdate} className="space-y-4">
              <Input
                label="College Name"
                required
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--text-secondary)]">Status</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      checked={editStatus === 'active'}
                      onChange={() => setEditStatus('active')}
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      checked={editStatus === 'inactive'}
                      onChange={() => setEditStatus('inactive')}
                    />
                    Inactive
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <Button variant="ghost" type="button" onClick={() => setEditingCollege(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={editLoading} disabled={editLoading || !editName.trim()}>
                  Save Changes
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}

