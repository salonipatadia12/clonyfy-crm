'use client'

import { createContext, useContext } from 'react'
import type { Profile } from '@/lib/auth'

const AuthContext = createContext<Profile | null>(null)

export function AuthProvider({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  return <AuthContext.Provider value={profile}>{children}</AuthContext.Provider>
}

// Current user's profile in client components. Safe inside the dashboard, where
// the layout guarantees a profile exists.
export function useAuth(): Profile {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function useIsAdmin(): boolean {
  return useContext(AuthContext)?.role === 'admin'
}
