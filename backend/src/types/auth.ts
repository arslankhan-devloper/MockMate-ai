export type AppRole = 'student' | 'placement-officer' | 'super_admin'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

// Authorization context derived from a verified access token plus a trusted
// database read. Never populated from client-supplied request data.
export interface AuthContext {
  userId: string
  email: string | null
  role: AppRole
  approvalStatus: ApprovalStatus | null
  rejectionReason?: string | null
  collegeId: string | null
  accessToken: string
}
