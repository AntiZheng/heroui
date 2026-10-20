import { type ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Button, Spinner } from '@heroui/react'
import { useQuery } from '@tanstack/react-query'
import AppShell from '../components/layout/AppShell'
import LoginPage from '../pages/login'
import RegisterPage from '../pages/register'
import HomePage from '../pages/home'
import { buildMenuRoutes } from '../components/layout/menuNav'
import { getRouters } from '../api/auth'
import { useAuthStore } from '../stores/auth'

function RequireAuth({ children }: { children: ReactElement }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

function MenuGate() {
  const userId = useAuthStore((s) => s.user?.user_id)
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['user-routers', userId],
    queryFn: getRouters,
  })

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background">
        <p className="text-sm text-muted">菜单加载失败，请检查网络或后端服务</p>
        <Button variant="tertiary" size="sm" onPress={() => void refetch()}>
          重试
        </Button>
      </div>
    )
  }

  const menus = data ?? []
  const routes = buildMenuRoutes(menus)

  return (
    <Routes>
      <Route element={<AppShell menus={menus} />}>
        <Route index element={<HomePage />} />
        {routes.map((route) => (
          <Route
            key={route.path}
            path={route.path.replace(/^\//, '')}
            element={route.element}
          />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <MenuGate />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
