import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CurrentUserInfo } from '../types/user'

interface AuthState {
  token: string
  refreshToken: string
  user: CurrentUserInfo | null
  roles: string[]
  permissions: string[]
  setTokens: (token: string, refreshToken: string) => void
  setUserInfo: (user: CurrentUserInfo, roles: string[], permissions: string[]) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: '',
      refreshToken: '',
      user: null,
      roles: [],
      permissions: [],
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
      setUserInfo: (user, roles, permissions) => set({ user, roles, permissions }),
      clear: () =>
        set({ token: '', refreshToken: '', user: null, roles: [], permissions: [] }),
    }),
    { name: 'heroui-admin-auth' },
  ),
)

export const hasPermission = (permission: string) =>
  useAuthStore.getState().permissions.includes(permission)
