import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AuthSessionSnapshot } from '../../../shared/authIpc'

const DEFAULT_AUTH_SESSION: AuthSessionSnapshot = {
    user: null,
    isAuthenticated: false,
    fetchedAt: new Date(0).toISOString(),
}

interface AuthStore {
    session: AuthSessionSnapshot
    setSession: (session: AuthSessionSnapshot) => void
    clearSession: () => void
}

export const useAuthStore = create<AuthStore>()(
    persist(
        (set) => ({
            session: DEFAULT_AUTH_SESSION,
            setSession: (session) => set({ session }),
            clearSession: () => set({ session: DEFAULT_AUTH_SESSION }),
        }),
        {
            name: 'bookspace_auth_session',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({ session: state.session }),
        },
    ),
)
