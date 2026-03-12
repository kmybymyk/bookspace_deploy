export type AuthProvider = 'google'

export interface AuthUserProfile {
  userId: string
  provider: AuthProvider
  email: string
  displayName: string
  avatarUrl?: string
}

export interface AuthSessionSnapshot {
  user: AuthUserProfile | null
  isAuthenticated: boolean
  fetchedAt: string
}

export interface AuthGoogleSignInRequest {
  email?: string
  displayName?: string
  avatarUrl?: string
}

export interface AuthGoogleSignInResponse {
  success: boolean
  mode: 'development-stub' | 'backend-required'
  session: AuthSessionSnapshot
  message?: string
}

export interface AuthSignOutResponse {
  success: boolean
  session: AuthSessionSnapshot
  signedOutAt: string
}
