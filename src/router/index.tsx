import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'
import AppShell from '../components/layout/AppShell'
import LoginPage from '../pages/login'
import HomePage from '../pages/home'
import UserPage from '../pages/system/user'
import { useAuthStore } from '../stores/auth'

function RequireAuth({ children }: { children: ReactElement }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="system/user" element={<UserPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
