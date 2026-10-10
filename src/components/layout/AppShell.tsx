import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Tooltip, TooltipContent, TooltipTrigger } from '@heroui/react'
import { Home, LogOut, Users } from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { logout } from '../../api/auth'

const navItems = [
  { path: '/', label: '首页', icon: Home },
  { path: '/system/user', label: '用户管理', icon: Users },
]

export default function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      // 后端登出失败也不阻塞本地退出
    }
    clear()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen bg-background">
      <aside className="flex w-56 flex-col border-r border-separator bg-surface">
        <div className="flex h-16 items-center px-5 text-lg font-semibold">Admin 平台</div>
        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const active = location.pathname === item.path
            const Icon = item.icon
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm transition-colors ${
                  active
                    ? 'bg-accent/15 font-medium text-accent'
                    : 'text-foreground/70 hover:bg-surface-secondary'
                }`}
              >
                <Icon size={16} aria-hidden />
                {item.label}
              </button>
            )
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-end gap-3 border-b border-separator bg-surface px-6">
          <span className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-accent text-sm font-medium text-accent-foreground">
            {user?.nick_name?.slice(0, 1) ?? 'A'}
          </span>
          <Tooltip>
            <TooltipTrigger>
              <button
                onClick={handleLogout}
                className="flex cursor-pointer items-center gap-1.5 text-sm text-muted transition-colors hover:text-danger"
              >
                <LogOut size={14} aria-hidden />
                退出
              </button>
            </TooltipTrigger>
            <TooltipContent>退出登录</TooltipContent>
          </Tooltip>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
