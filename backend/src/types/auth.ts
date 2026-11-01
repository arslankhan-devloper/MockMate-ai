export type AppRole = 'student' | 'placement-officer'

// Authorization context derived from a verified access token plus a trusted
// database read. Never populated from client-supplied request data.
export interface AuthContext {
  userId: string
  email: string | null
  role: AppRole
  collegeId: string | null
  accessToken: string
}
