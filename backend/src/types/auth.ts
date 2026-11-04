export type AppRole = 'student' | 'placement-officer' | 'super_admin'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended'
export type CollegeVerificationStatus = 'pending' | 'verified' | 'rejected'

// Authorization context derived from a verified access token plus a trusted
// database read. Never populated from client-supplied request data.
export interface AuthContext {
  userId: string
  email: string | null
  role: AppRole
  approvalStatus: ApprovalStatus | null
  rejectionReason?: string | null
  collegeId: string | null
  rollNumber?: string | null
  collegeVerificationStatus?: CollegeVerificationStatus | null
  collegeVerificationReason?: string | null
  verifiedBy?: string | null
  verifiedAt?: string | null
  accessToken: string
}
