export const MIN_PASSWORD_LENGTH = 8

export function validatePasswordChange(
  password: string,
  confirmation: string,
): string | null {
  if (!password) return 'Enter a new password.'
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (password !== confirmation) return 'The passwords do not match.'
  return null
}

export function accountProfilePage(
  role: 'student' | 'placement-officer',
): 'profile' | 'officer-profile' {
  return role === 'placement-officer' ? 'officer-profile' : 'profile'
}
