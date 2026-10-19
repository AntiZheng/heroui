import { Navigate, Route, Routes } from 'react-router-dom'
import { lazy, Suspense, type ReactElement } from 'react'
import AppShell from '../components/layout/AppShell'
import LoginPage from '../pages/login'
import RegisterPage from '../pages/register'
import HomePage from '../pages/home'
import UserPage from '../pages/system/user'
import DeptPage from '../pages/system/dept'
import RolePage from '../pages/system/role'
import DictPage from '../pages/system/dict'
import DictDataPage from '../pages/system/dict/data'
import ConfigPage from '../pages/system/config'
import JobPage from '../pages/system/job'

const MapPage = lazy(() => import('../pages/map'))
import { useAuthStore } from '../stores/auth'

function RequireAuth({ children }: { children: ReactElement }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
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
        <Route path="system/dept" element={<DeptPage />} />
        <Route path="system/role" element={<RolePage />} />
        <Route path="system/dict" element={<DictPage />} />
        <Route path="system/dict/data/:dictType" element={<DictDataPage />} />
        <Route path="system/config" element={<ConfigPage />} />
        <Route path="system/job" element={<JobPage />} />
        <Route path="map" element={<Suspense><MapPage /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
