// Localhost-only faculty presentation access helper.
// Strictly disabled on any domain other than localhost / 127.0.0.1.
// Never exposes backend admin APIs or modifies database RLS/roles.

import type { Session, User } from '@supabase/supabase-js'
import type { AuthProfile } from './auth'
import type {
  AdminDashboardData,
  AdminCollege,
  AdminOfficer,
  AdminStudent,
  AdminDrive,
  AdminAuditLog,
} from './adminApi'
import type { CampusJob, CampusApplicationWithJob } from '../data/campusJobs'

export const PRESENTATION_TOKEN = 'mockmate-presentation-token'
const STORAGE_KEY = 'mockmate.presentation_role'

export type PresentationRole = 'super_admin' | 'placement-officer'

export function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local')
  )
}

export function getPresentationRole(): PresentationRole | null {
  if (!isLocalhost()) return null
  try {
    const val = window.sessionStorage.getItem(STORAGE_KEY)
    if (val === 'super_admin' || val === 'placement-officer') {
      return val
    }
  } catch {
    // Ignore storage errors
  }
  return null
}

export function setPresentationRole(role: PresentationRole | null): void {
  if (!isLocalhost()) return
  try {
    if (role) {
      window.sessionStorage.setItem(STORAGE_KEY, role)
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Ignore storage errors
  }
}

export function getPresentationSession(role: PresentationRole): {
  session: Session
  user: User
  profile: AuthProfile
} {
  const isSuperAdmin = role === 'super_admin'
  const id = isSuperAdmin ? 'demo-super-admin-id' : 'demo-placement-officer-id'
  const email = isSuperAdmin
    ? 'superadmin.demo@mockmate.local'
    : 'placement.officer@iitb.local'
  const fullName = isSuperAdmin
    ? 'Dr. Elena Vance (Faculty Super Admin Demo)'
    : 'Prof. Rajesh Sharma (Placement Officer Demo)'

  const user: User = {
    id,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: fullName },
    aud: 'authenticated',
    confirmation_sent_at: new Date().toISOString(),
    recovery_sent_at: null as any,
    email_change_sent_at: null as any,
    new_email: null as any,
    new_phone: null as any,
    invited_at: null as any,
    action_link: null as any,
    email,
    phone: '',
    created_at: '2025-01-01T00:00:00.000Z',
    confirmed_at: '2025-01-01T00:00:00.000Z',
    email_confirmed_at: '2025-01-01T00:00:00.000Z',
    phone_confirmed_at: null as any,
    last_sign_in_at: new Date().toISOString(),
    role: 'authenticated',
    updated_at: new Date().toISOString(),
    identities: [],
    factors: [],
  }

  const session: Session = {
    access_token: PRESENTATION_TOKEN,
    token_type: 'bearer',
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    refresh_token: 'demo-refresh-token',
    user,
  }

  const profile: AuthProfile = {
    id,
    role: isSuperAdmin ? 'super_admin' : 'placement-officer',
    approvalStatus: 'approved',
    rejectionReason: null,
    collegeId: isSuperAdmin ? null : 'col-iitb',
    fullName,
    email,
    rollNumber: null,
    collegeVerificationStatus: 'verified',
    collegeVerificationReason: null,
  }

  return { session, user, profile }
}

// ─────────────────────────────────────────────────────────────────
// Demo datasets for faculty presentation preview
// ─────────────────────────────────────────────────────────────────

export const DEMO_ADMIN_DASHBOARD: AdminDashboardData = {
  metrics: {
    totalStudents: 348,
    totalColleges: 6,
    totalOfficers: 14,
    pendingOfficers: 2,
    approvedOfficers: 11,
    suspendedOfficers: 1,
    rejectedOfficers: 0,
    totalDrives: 16,
    activeDrives: 7,
    totalApplications: 924,
  },
  applicationsByStatus: {
    applied: 430,
    shortlisted: 245,
    interviewed: 162,
    offered: 68,
    rejected: 19,
  },
  recentActivity: [
    {
      id: 'log-1',
      actor_id: 'demo-super-admin-id',
      actor_role: 'super_admin',
      action: 'officer.approve',
      target_type: 'officer',
      target_id: 'off-bits',
      metadata: { college: 'BITS Pilani', officerName: 'Prof. Ananya Sen' },
      ip_address: '127.0.0.1',
      created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
    {
      id: 'log-2',
      actor_id: 'demo-super-admin-id',
      actor_role: 'super_admin',
      action: 'student.verify',
      target_type: 'student',
      target_id: 'stu-iitb-1',
      metadata: { college: 'IIT Bombay', rollNumber: '22CS014' },
      ip_address: '127.0.0.1',
      created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    },
    {
      id: 'log-3',
      actor_id: 'demo-super-admin-id',
      actor_role: 'super_admin',
      action: 'college.create',
      target_type: 'college',
      target_id: 'col-dtu',
      metadata: { collegeName: 'Delhi Technological University' },
      ip_address: '127.0.0.1',
      created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    },
  ],
}

export const DEMO_COLLEGES: AdminCollege[] = [
  {
    id: 'col-iitb',
    name: 'Indian Institute of Technology, Bombay',
    slug: 'iit-bombay',
    status: 'active',
    created_at: '2025-08-10T09:00:00Z',
    studentCount: 142,
    officerCount: 3,
    pendingOfficerCount: 0,
  },
  {
    id: 'col-bits',
    name: 'Birla Institute of Technology and Science, Pilani',
    slug: 'bits-pilani',
    status: 'active',
    created_at: '2025-08-14T11:00:00Z',
    studentCount: 98,
    officerCount: 2,
    pendingOfficerCount: 1,
  },
  {
    id: 'col-nitt',
    name: 'National Institute of Technology, Tiruchirappalli',
    slug: 'nit-trichy',
    status: 'active',
    created_at: '2025-09-01T08:30:00Z',
    studentCount: 64,
    officerCount: 2,
    pendingOfficerCount: 1,
  },
  {
    id: 'col-dtu',
    name: 'Delhi Technological University',
    slug: 'dtu-delhi',
    status: 'active',
    created_at: '2025-09-12T14:15:00Z',
    studentCount: 44,
    officerCount: 1,
    pendingOfficerCount: 0,
  },
]

export const DEMO_OFFICERS: AdminOfficer[] = [
  {
    id: 'off-iitb-1',
    email: 'rajesh.sharma@iitb.ac.in',
    full_name: 'Dr. Rajesh Sharma',
    phone: '+91 98765 43210',
    role: 'placement-officer',
    approval_status: 'approved',
    rejection_reason: null,
    college_id: 'col-iitb',
    collegeName: 'Indian Institute of Technology, Bombay',
    designation: 'Head of Placement & Training',
    department: 'Central Placement Office',
    created_at: '2025-08-11T10:00:00Z',
    updated_at: '2025-08-11T12:00:00Z',
  },
  {
    id: 'off-bits',
    email: 'ananya.sen@bits-pilani.ac.in',
    full_name: 'Prof. Ananya Sen',
    phone: '+91 98111 22334',
    role: 'placement-officer',
    approval_status: 'pending',
    rejection_reason: null,
    college_id: 'col-bits',
    collegeName: 'Birla Institute of Technology and Science, Pilani',
    designation: 'Placement Officer',
    department: 'Computer Science Department',
    created_at: '2025-11-01T06:00:00Z',
    updated_at: '2025-11-01T06:00:00Z',
  },
  {
    id: 'off-nitt',
    email: 'k.raman@nitt.edu',
    full_name: 'Dr. K. Ramanathan',
    phone: '+91 97444 55667',
    role: 'placement-officer',
    approval_status: 'pending',
    rejection_reason: null,
    college_id: 'col-nitt',
    collegeName: 'National Institute of Technology, Tiruchirappalli',
    designation: 'Training & Placement Director',
    department: 'Mechanical Engineering',
    created_at: '2025-11-02T02:00:00Z',
    updated_at: '2025-11-02T02:00:00Z',
  },
]

export const DEMO_STUDENTS: AdminStudent[] = [
  {
    id: 'stu-iitb-1',
    email: 'aarav.patel@student.iitb.ac.in',
    full_name: 'Aarav Patel',
    phone: '+91 91234 56789',
    branch: 'Computer Science',
    grad_year: '2026',
    college_id: 'col-iitb',
    collegeName: 'Indian Institute of Technology, Bombay',
    roll_number: '22CS014',
    college_verification_status: 'verified',
    college_verification_reason: null,
    verified_at: '2025-09-05T10:00:00Z',
    created_at: '2025-08-20T10:00:00Z',
    updated_at: '2025-09-05T10:00:00Z',
  },
  {
    id: 'stu-bits-1',
    email: 'sneha.kulkarni@student.bits.ac.in',
    full_name: 'Sneha Kulkarni',
    phone: '+91 92345 67890',
    branch: 'Electronics & Communication',
    grad_year: '2026',
    college_id: 'col-bits',
    collegeName: 'Birla Institute of Technology and Science, Pilani',
    roll_number: '22EC089',
    college_verification_status: 'pending',
    college_verification_reason: null,
    verified_at: null,
    created_at: '2025-10-12T14:30:00Z',
    updated_at: '2025-10-12T14:30:00Z',
  },
  {
    id: 'stu-nitt-1',
    email: 'rohit.verma@student.nitt.edu',
    full_name: 'Rohit Verma',
    phone: '+91 93456 78901',
    branch: 'Information Technology',
    grad_year: '2026',
    college_id: 'col-nitt',
    collegeName: 'National Institute of Technology, Tiruchirappalli',
    roll_number: '22IT045',
    college_verification_status: 'verified',
    college_verification_reason: null,
    verified_at: '2025-10-02T11:00:00Z',
    created_at: '2025-09-18T09:15:00Z',
    updated_at: '2025-10-02T11:00:00Z',
  },
]

export const DEMO_DRIVES: AdminDrive[] = [
  {
    id: 'drv-1',
    title: 'Software Development Engineer - 1 (Campus 2026)',
    company: 'Google India',
    college_id: 'col-iitb',
    collegeName: 'Indian Institute of Technology, Bombay',
    posted_by: 'off-iitb-1',
    description: 'Campus hiring drive for SDE-1 roles across Google Cloud and Search.',
    location: 'Bengaluru / Hyderabad',
    job_type: 'In-Campus',
    eligibility: 'CGPA >= 8.0, 0 Backlogs',
    branches: ['Computer Science', 'Information Technology', 'Data Science'],
    min_cgpa: 8.0,
    allowed_backlogs: 0,
    package: '32 LPA',
    application_deadline: '2025-11-20',
    drive_date: '2025-11-25',
    application_link: null,
    link_label: null,
    status: 'published',
    applicationCount: 86,
    created_at: '2025-10-01T08:00:00Z',
    updated_at: '2025-10-01T08:00:00Z',
  },
  {
    id: 'drv-2',
    title: 'Graduate Technology Associate (FinTech)',
    company: 'Goldman Sachs',
    college_id: 'col-bits',
    collegeName: 'Birla Institute of Technology and Science, Pilani',
    posted_by: 'off-bits',
    description: 'Engineering roles in quantitative execution and distributed ledger systems.',
    location: 'Bengaluru',
    job_type: 'In-Campus',
    eligibility: 'CGPA >= 7.5',
    branches: ['Computer Science', 'Electrical', 'Electronics & Communication'],
    min_cgpa: 7.5,
    allowed_backlogs: 0,
    package: '28 LPA',
    application_deadline: '2025-11-25',
    drive_date: '2025-12-01',
    application_link: null,
    link_label: null,
    status: 'published',
    applicationCount: 62,
    created_at: '2025-10-10T10:00:00Z',
    updated_at: '2025-10-10T10:00:00Z',
  },
  {
    id: 'drv-3',
    title: 'Systems & Cloud Engineer (Campus Hiring)',
    company: 'Microsoft',
    college_id: 'col-nitt',
    collegeName: 'National Institute of Technology, Tiruchirappalli',
    posted_by: 'off-nitt',
    description: 'Azure systems engineering and core infrastructure automation.',
    location: 'Hyderabad / Noida',
    job_type: 'In-Campus',
    eligibility: 'CGPA >= 7.5',
    branches: ['Computer Science', 'Information Technology'],
    min_cgpa: 7.5,
    allowed_backlogs: 0,
    package: '26 LPA',
    application_deadline: '2025-11-28',
    drive_date: '2025-12-05',
    application_link: null,
    link_label: null,
    status: 'published',
    applicationCount: 54,
    created_at: '2025-10-15T12:00:00Z',
    updated_at: '2025-10-15T12:00:00Z',
  },
]

export const DEMO_AUDIT_LOGS: AdminAuditLog[] = [
  {
    id: 'log-1',
    actor_id: 'demo-super-admin-id',
    actor_role: 'super_admin',
    action: 'officer.approve',
    target_type: 'officer',
    target_id: 'off-bits',
    metadata: { college: 'BITS Pilani', officer: 'Prof. Ananya Sen' },
    ip_address: '127.0.0.1',
    created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: 'log-2',
    actor_id: 'demo-super-admin-id',
    actor_role: 'super_admin',
    action: 'student.verify',
    target_type: 'student',
    target_id: 'stu-iitb-1',
    metadata: { rollNumber: '22CS014' },
    ip_address: '127.0.0.1',
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: 'log-3',
    actor_id: 'demo-super-admin-id',
    actor_role: 'super_admin',
    action: 'college.create',
    target_type: 'college',
    target_id: 'col-dtu',
    metadata: { name: 'Delhi Technological University' },
    ip_address: '127.0.0.1',
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
]

export const DEMO_OFFICER_CAMPUS_JOBS: CampusJob[] = [
  {
    id: 'job-1',
    company: 'Google India',
    title: 'Software Development Engineer - 1 (Campus 2026)',
    description:
      'We are looking for ambitious Software Engineers to join Google India engineering teams working on Search, Android, Cloud and AI platforms.',
    jobType: 'In-Campus',
    collegeId: 'col-iitb',
    eligibility: 'B.Tech/Dual Degree 2026 Batch with CGPA >= 8.0, 0 Backlogs',
    branches: ['Computer Science', 'Information Technology', 'Data Science'],
    minCgpa: 8.0,
    allowedBacklogs: 0,
    package: '32 LPA (Fixed + Stocks)',
    location: 'Bengaluru / Hyderabad',
    applicationDeadline: '2025-11-20',
    driveDate: '2025-11-25',
    driveTime: '09:00 AM',
    driveVenue: 'Main Auditorium & Online Assessment Center',
    status: 'published',
    createdAt: '2025-10-01T08:00:00Z',
    postedBy: 'off-iitb-1',
  },
  {
    id: 'job-2',
    company: 'Microsoft',
    title: 'Cloud Solutions Engineer',
    description:
      'Join Azure Core Engineering to build scalable cloud backends, resilient storage and high-throughput networking solutions.',
    jobType: 'In-Campus',
    collegeId: 'col-iitb',
    eligibility: 'B.Tech 2026 Batch, CGPA >= 7.5',
    branches: ['Computer Science', 'Information Technology', 'Electronics & Communication'],
    minCgpa: 7.5,
    allowedBacklogs: 0,
    package: '28 LPA',
    location: 'Hyderabad / Noida',
    applicationDeadline: '2025-11-28',
    driveDate: '2025-12-02',
    driveTime: '10:00 AM',
    driveVenue: 'CS Department Lab 3',
    status: 'published',
    createdAt: '2025-10-15T12:00:00Z',
    postedBy: 'off-iitb-1',
  },
]

export const DEMO_OFFICER_APPLICATIONS: CampusApplicationWithJob[] = [
  {
    id: 'app-1',
    jobId: 'job-1',
    studentId: 'stu-iitb-1',
    studentName: 'Aarav Patel',
    appliedAt: '2025-10-05T14:20:00Z',
    updatedAt: '2025-10-08T11:00:00Z',
    status: 'Shortlisted',
    job: {
      id: 'job-1',
      collegeId: 'col-iitb',
      company: 'Google India',
      title: 'Software Development Engineer - 1 (Campus 2026)',
      location: 'Bengaluru / Hyderabad',
      jobType: 'In-Campus',
      status: 'published',
      applicationDeadline: '2025-11-20',
      applicationLink: null,
      linkLabel: null,
    },
  },
  {
    id: 'app-2',
    jobId: 'job-2',
    studentId: 'stu-iitb-2',
    studentName: 'Priya Sharma',
    appliedAt: '2025-10-18T16:00:00Z',
    updatedAt: '2025-10-18T16:00:00Z',
    status: 'Applied',
    job: {
      id: 'job-2',
      collegeId: 'col-iitb',
      company: 'Microsoft',
      title: 'Cloud Solutions Engineer',
      location: 'Hyderabad / Noida',
      jobType: 'In-Campus',
      status: 'published',
      applicationDeadline: '2025-11-28',
      applicationLink: null,
      linkLabel: null,
    },
  },
]
