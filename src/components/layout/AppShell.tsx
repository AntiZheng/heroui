import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Tooltip, TooltipContent, TooltipTrigger } from '@heroui/react'
import {
  Home,
  LayoutGrid,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Users,
} from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { useThemeStore } from '../../stores/theme'
import { logout } from '../../api/auth'

const navItems = [
  { path: '/', label: '首页', icon: Home },
  { path: '/system/user', label: '用户管理', icon: Users, group: '系统管理' },
]

export default function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === '1',
  )
  const toggleCollapsed = () =>
    setCollapsed((v) => {
      localStorage.setItem('sidebar-collapsed', v ? '0' : '1')
      return !v
    })

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      // 后端登出失败也不阻塞本地退出
    }
    clear()
    navigate('/login', { replace: true })
  }

  const renderNavItem = (item: (typeof navItems)[number]) => {
    const active = location.pathname === item.path
    const Icon = item.icon
    const button = (
      <button
        onClick={() => navigate(item.path)}
        className={`flex w-full cursor-pointer items-center gap-3 rounded-lg text-left text-sm transition-colors ${
          collapsed ? 'justify-center px-0 py-2.5' : 'px-4 py-2.5'
        } ${
          active
            ? 'bg-accent/15 font-medium text-accent'
            : 'text-foreground/70 hover:bg-surface-secondary'
        }`}
      >
        <Icon size={16} aria-hidden className="shrink-0" />
        {!collapsed && item.label}
      </button>
    )
    if (!collapsed) return <div key={item.path}>{button}</div>
    return (
      <Tooltip key={item.path}>
        <TooltipTrigger>{button}</TooltipTrigger>
        <TooltipContent>{item.label}</TooltipContent>
      </Tooltip>
    )
  }

  let lastGroup: string | undefined

  return (
    <div className="flex h-screen bg-background">
      <aside
        className={`flex shrink-0 flex-col border-r border-separator bg-surface transition-[width] duration-200 ${
          collapsed ? 'w-12' : 'w-56'
        }`}
      >
        <div
          className={`flex h-16 shrink-0 items-center gap-2.5 ${
            collapsed ? 'justify-center px-0' : 'px-4'
          }`}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <LayoutGrid size={16} aria-hidden />
          </span>
          {!collapsed && <span className="text-lg font-semibold">Admin 平台</span>}
        </div>
        <nav className={`flex-1 ${collapsed ? 'px-1.5' : 'px-3'}`}>
          {navItems.map((item) => {
            const withGroup = !collapsed && item.group && item.group !== lastGroup ? item.group : undefined
            lastGroup = item.group
            return (
              <div key={item.path}>
                {withGroup && (
                  <div className="px-4 pb-1 pt-5 text-xs font-medium text-muted">{withGroup}</div>
                )}
                {renderNavItem(item)}
              </div>
            )
          })}
        </nav>
        <div
          className={`flex shrink-0 items-center border-t border-separator py-2 ${
            collapsed ? 'justify-center px-0' : 'justify-end px-3'
          }`}
        >
          <Tooltip>
            <TooltipTrigger>
              <button
                onClick={toggleCollapsed}
                aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
                className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
              >
                {collapsed ? (
                  <PanelLeftOpen size={16} aria-hidden />
                ) : (
                  <PanelLeftClose size={16} aria-hidden />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>{collapsed ? '展开侧边栏' : '收起侧边栏'}</TooltipContent>
          </Tooltip>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-end gap-3 border-b border-separator bg-surface px-6">
          <Tooltip>
            <TooltipTrigger>
              <button
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? '切换亮色模式' : '切换暗色模式'}
                className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
              >
                {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{theme === 'dark' ? '切换亮色模式' : '切换暗色模式'}</TooltipContent>
          </Tooltip>
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
