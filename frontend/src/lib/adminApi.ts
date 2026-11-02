import { apiRequest } from './api'
import type { CampusJobInput } from '../data/campusJobs'

export interface AdminMetrics {
  totalStudents: number
  totalColleges: number
  totalOfficers: number
  pendingOfficers: number
  approvedOfficers: number
  suspendedOfficers: number
  rejectedOfficers: number
  totalDrives: number
  activeDrives: number
  totalApplications: number
}

export interface AdminDashboardData {
  metrics: AdminMetrics
  applicationsByStatus: Record<string, number>
  recentActivity: AdminAuditLog[]
}

export interface AdminCollege {
  id: string
  name: string
  slug: string
  status: 'active' | 'inactive'
  created_at: string
  studentCount?: number
  officerCount?: number
  pendingOfficerCount?: number
}

export interface AdminOfficer {
  id: string
  email: string
  full_name: string
  phone: string | null
  role: 'placement-officer'
  approval_status: 'pending' | 'approved' | 'rejected' | 'suspended'
  rejection_reason: string | null
  college_id: string | null
  collegeName?: string
  designation: string | null
  department: string | null
  created_at: string
  updated_at: string
}

export interface AdminStudent {
  id: string
  email: string
  full_name: string
  phone: string | null
  branch: string | null
  grad_year: string | null
  college_id: string | null
  collegeName?: string
  applicationCount?: number
  created_at: string
  updated_at: string
}

export interface AdminStudentDetails {
  profile: AdminStudent
  applications: Array<{
    id: string
    job_id: string
    status: string
    applied_at: string
    campus_jobs?: {
      company: string
      title: string
      job_type: string
      package: string
    }
  }>
  interviews: Array<{
    id: string
    interview_type: string
    overall_score: number | null
    status: string
    created_at: string
  }>
}

export interface AdminDrive {
  id: string
  college_id: string
  collegeName?: string
  posted_by: string | null
  company: string
  title: string
  description: string
  job_type: 'In-Campus' | 'Off-Campus'
  eligibility: string
  branches: string[]
  min_cgpa: number
  allowed_backlogs: number
  package: string
  location: string
  application_deadline: string | null
  drive_date: string | null
  drive_time?: string | null
  drive_venue?: string | null
  status: 'draft' | 'published' | 'closed'
  application_link: string | null
  link_label: string | null
  applicationCount?: number
  created_at: string
  updated_at: string
}

export interface AdminApplication {
  id: string
  job_id: string
  student_id: string
  student_name: string | null
  status: 'Applied' | 'Under Review' | 'Shortlisted' | 'Rejected'
  applied_at: string
  updated_at: string
}

export interface AdminAuditLog {
  id: string
  actor_id: string | null
  actor_role: string
  action: string
  target_type: string
  target_id: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

export interface OfficerRegisterPayload {
  fullName: string
  email: string
  password: string
  phone?: string
  collegeId: string
  designation: string
  department?: string
}

export interface OfficerRegisterResponse {
  success: boolean
  message: string
  officer: {
    id: string
    email: string
    fullName: string
    collegeId: string
    collegeName: string
    approvalStatus: 'pending'
  }
}

// Public Officer Auth Calls
export async function listPublicColleges(): Promise<Array<{ id: string; name: string; slug: string }>> {
  return apiRequest('/api/officer-auth/colleges')
}

export async function registerPlacementOfficer(
  payload: OfficerRegisterPayload,
): Promise<OfficerRegisterResponse> {
  return apiRequest('/api/officer-auth/register', {
    method: 'POST',
    body: payload,
  })
}

// Protected Super Admin Calls
export async function getAdminDashboard(accessToken: string): Promise<AdminDashboardData> {
  return apiRequest('/api/admin/dashboard', { accessToken })
}

export async function listAdminColleges(accessToken: string): Promise<AdminCollege[]> {
  return apiRequest('/api/admin/colleges', { accessToken })
}

export async function createAdminCollege(
  accessToken: string,
  payload: { name: string; slug?: string },
): Promise<AdminCollege> {
  return apiRequest('/api/admin/colleges', {
    method: 'POST',
    accessToken,
    body: payload,
  })
}

export async function updateAdminCollege(
  accessToken: string,
  collegeId: string,
  payload: { name?: string; status?: 'active' | 'inactive' },
): Promise<AdminCollege> {
  return apiRequest(`/api/admin/colleges/${encodeURIComponent(collegeId)}`, {
    method: 'PATCH',
    accessToken,
    body: payload,
  })
}

export async function listAdminOfficers(
  accessToken: string,
  filters?: { status?: string; search?: string },
): Promise<AdminOfficer[]> {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.search) params.set('search', filters.search)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return apiRequest(`/api/admin/officers${qs}`, { accessToken })
}

export async function approveAdminOfficer(
  accessToken: string,
  officerId: string,
  payload?: { collegeId?: string },
): Promise<AdminOfficer> {
  return apiRequest(`/api/admin/officers/${encodeURIComponent(officerId)}/approve`, {
    method: 'POST',
    accessToken,
    body: payload ?? {},
  })
}

export async function rejectAdminOfficer(
  accessToken: string,
  officerId: string,
  reason: string,
): Promise<AdminOfficer> {
  return apiRequest(`/api/admin/officers/${encodeURIComponent(officerId)}/reject`, {
    method: 'POST',
    accessToken,
    body: { reason },
  })
}

export async function suspendAdminOfficer(
  accessToken: string,
  officerId: string,
  reason: string,
): Promise<AdminOfficer> {
  return apiRequest(`/api/admin/officers/${encodeURIComponent(officerId)}/suspend`, {
    method: 'POST',
    accessToken,
    body: { reason },
  })
}

export async function reactivateAdminOfficer(
  accessToken: string,
  officerId: string,
): Promise<AdminOfficer> {
  return apiRequest(`/api/admin/officers/${encodeURIComponent(officerId)}/reactivate`, {
    method: 'POST',
    accessToken,
  })
}

export async function assignAdminOfficerCollege(
  accessToken: string,
  officerId: string,
  collegeId: string,
): Promise<AdminOfficer> {
  return apiRequest(`/api/admin/officers/${encodeURIComponent(officerId)}/college`, {
    method: 'PATCH',
    accessToken,
    body: { collegeId },
  })
}

export async function listAdminStudents(
  accessToken: string,
  filters?: { collegeId?: string; branch?: string; search?: string },
): Promise<AdminStudent[]> {
  const params = new URLSearchParams()
  if (filters?.collegeId) params.set('collegeId', filters.collegeId)
  if (filters?.branch) params.set('branch', filters.branch)
  if (filters?.search) params.set('search', filters.search)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return apiRequest(`/api/admin/students${qs}`, { accessToken })
}

export async function getAdminStudentDetails(
  accessToken: string,
  studentId: string,
): Promise<AdminStudentDetails> {
  return apiRequest(`/api/admin/students/${encodeURIComponent(studentId)}`, { accessToken })
}

export async function updateAdminStudentCollege(
  accessToken: string,
  studentId: string,
  collegeId: string | null,
): Promise<AdminStudent> {
  return apiRequest(`/api/admin/students/${encodeURIComponent(studentId)}/college`, {
    method: 'PATCH',
    accessToken,
    body: { collegeId },
  })
}

export async function listAdminDrives(
  accessToken: string,
  filters?: { collegeId?: string; status?: string },
): Promise<AdminDrive[]> {
  const params = new URLSearchParams()
  if (filters?.collegeId) params.set('collegeId', filters.collegeId)
  if (filters?.status) params.set('status', filters.status)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return apiRequest(`/api/admin/drives${qs}`, { accessToken })
}

export async function createAdminDrive(
  accessToken: string,
  payload: CampusJobInput & { collegeId: string; status?: 'draft' | 'published' },
): Promise<AdminDrive> {
  return apiRequest('/api/admin/drives', {
    method: 'POST',
    accessToken,
    body: payload,
  })
}

export async function updateAdminDrive(
  accessToken: string,
  driveId: string,
  payload: Partial<CampusJobInput> & { collegeId?: string; status?: 'draft' | 'published' | 'closed' },
): Promise<AdminDrive> {
  return apiRequest(`/api/admin/drives/${encodeURIComponent(driveId)}`, {
    method: 'PATCH',
    accessToken,
    body: payload,
  })
}

export async function closeAdminDrive(accessToken: string, driveId: string): Promise<AdminDrive> {
  return apiRequest(`/api/admin/drives/${encodeURIComponent(driveId)}/close`, {
    method: 'POST',
    accessToken,
  })
}

export async function listAdminDriveApplications(
  accessToken: string,
  driveId: string,
): Promise<AdminApplication[]> {
  return apiRequest(`/api/admin/drives/${encodeURIComponent(driveId)}/applications`, { accessToken })
}

export async function updateAdminApplicationStatus(
  accessToken: string,
  driveId: string,
  applicationId: string,
  status: 'Applied' | 'Under Review' | 'Shortlisted' | 'Rejected',
): Promise<AdminApplication> {
  return apiRequest(
    `/api/admin/drives/${encodeURIComponent(driveId)}/applications/${encodeURIComponent(applicationId)}`,
    {
      method: 'PATCH',
      accessToken,
      body: { status },
    },
  )
}

export async function listAdminAuditLogs(
  accessToken: string,
  filters?: { limit?: number; offset?: number; action?: string; targetType?: string },
): Promise<{ logs: AdminAuditLog[]; total: number }> {
  const params = new URLSearchParams()
  if (filters?.limit) params.set('limit', String(filters.limit))
  if (filters?.offset) params.set('offset', String(filters.offset))
  if (filters?.action) params.set('action', filters.action)
  if (filters?.targetType) params.set('targetType', filters.targetType)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return apiRequest(`/api/admin/audit-logs${qs}`, { accessToken })
}

