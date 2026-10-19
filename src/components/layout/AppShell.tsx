import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Tooltip, TooltipContent, TooltipTrigger, Typography, Breadcrumbs, Dropdown, DropdownTrigger, DropdownPopover, DropdownMenu, DropdownItem } from '@heroui/react'
import {
  BookA,
  Building2,
  ChevronDown,
  FlaskConical,
  Home,
  LayoutGrid,
  LogOut,
  Map as MapIcon,
  Monitor,
  Moon,
  PanelLeft,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Timer,
  Users,
} from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { useThemeStore } from '../../stores/theme'
import { getConfigByKey, PLATFORM_NAME_KEY } from '../../api/config'
import { logout } from '../../api/auth'

const DEFAULT_PLATFORM_NAME = 'Admin 平台'

interface NavLeaf {
  path: string
  label: string
  icon: typeof Home
}

interface NavEntry extends NavLeaf {
  children?: NavLeaf[]
}

const navTree: NavEntry[] = [
  { path: '/', label: '首页', icon: Home },
  {
    path: '/system/user',
    label: '系统管理',
    icon: Settings2,
    children: [
      { path: '/system/user', label: '用户管理', icon: Users },
      { path: '/system/dept', label: '部门管理', icon: Building2 },
      { path: '/system/role', label: '角色管理', icon: ShieldCheck },
      { path: '/system/dict', label: '字典管理', icon: BookA },
      { path: '/system/config', label: '参数设置', icon: SlidersHorizontal },
      { path: '/system/job', label: '定时任务', icon: Timer },
    ],
  },
  {
    path: '/map',
    label: '地图服务',
    icon: FlaskConical,
    children: [{ path: '/map', label: '3D地图', icon: MapIcon }],
  },
]

function breadcrumbsFor(pathname: string) {
  const home = { label: '首页', path: '/' }
  const entry = navTree.find(
    (n) => n.path !== '/' && (n.children?.some((c) => c.path === pathname) || n.path === pathname),
  )
  if (!entry) return [home]
  const crumbs: { label: string; path?: string }[] = [home]
  if (entry.children) crumbs.push({ label: entry.label })
  const leaf = entry.children?.find((c) => c.path === pathname)
  crumbs.push({ label: leaf?.label ?? entry.label, path: leaf?.path ?? entry.path })
  return crumbs
}

export default function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const crumbs = breadcrumbsFor(location.pathname)

  // 平台名从参数设置读取（sys.platform.name），未配置或接口异常时回退默认
  const { data: platformName } = useQuery({
    queryKey: ['platform-name'],
    queryFn: () => getConfigByKey(PLATFORM_NAME_KEY),
    staleTime: Infinity,
    retry: false,
  })
  const platformTitle = platformName || DEFAULT_PLATFORM_NAME

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === '1',
  )
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navTree.filter((e) => e.children).map((e) => [e.label, true])),
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

  const itemClass = (active: boolean) =>
    `flex h-9 w-full cursor-pointer items-center gap-3 rounded-full text-left text-xs transition-colors ${
      active
        ? 'bg-surface-secondary font-medium text-foreground'
        : 'text-foreground/70 hover:bg-surface-secondary/60 hover:text-foreground'
    }`

  const renderLeaf = (leaf: NavLeaf, { indent = false }: { indent?: boolean } = {}) => {
    const active = location.pathname === leaf.path
    const Icon = leaf.icon
    const button = (
      <button
        onClick={() => navigate(leaf.path)}
        className={`${itemClass(active)} ${collapsed ? 'justify-center px-0' : indent ? 'pl-9 pr-3' : 'px-3'}`}
      >
        <Icon size={16} aria-hidden className="shrink-0" />
        {!collapsed && leaf.label}
      </button>
    )
    if (!collapsed) return <div key={leaf.path}>{button}</div>
    return (
      <Tooltip key={leaf.path}>
        <TooltipTrigger>{button}</TooltipTrigger>
        <TooltipContent>{leaf.label}</TooltipContent>
      </Tooltip>
    )
  }

  const renderEntry = (entry: NavEntry) => {
    if (!entry.children) return renderLeaf(entry)
    // 选中态只落在子项上，父目录不参与高亮
    const open = openGroups[entry.label] ?? false
    const Icon = entry.icon
    if (collapsed) {
      // 折叠态：分组父项显示为图标按钮，点击跳到第一个子页
      return (
        <Tooltip key={entry.label}>
          <TooltipTrigger>
            <button onClick={() => navigate(entry.children![0].path)} className={`${itemClass(false)} justify-center px-0`}>
              <Icon size={16} aria-hidden className="shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{entry.label}</TooltipContent>
        </Tooltip>
      )
    }
    return (
      <div key={entry.label}>
        <button
          onClick={() => setOpenGroups((m) => ({ ...m, [entry.label]: !open }))}
          className={`${itemClass(false)} px-3`}
          aria-expanded={open}
        >
          <Icon size={16} aria-hidden className="shrink-0" />
          {entry.label}
          <ChevronDown
            size={14}
            aria-hidden
            className={`ml-auto text-muted transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          />
        </button>
        {open && <div className="mt-0.5 flex flex-col gap-0.5">{entry.children.map((c) => renderLeaf(c, { indent: true }))}</div>}
      </div>
    )
  }

  return (
    <div className="flex h-screen gap-3 bg-background p-3">
      <aside
        className={`flex shrink-0 flex-col rounded-2xl border border-separator bg-surface shadow-sm transition-[width] duration-200 ${
          collapsed ? 'w-12' : 'w-56'
        }`}
      >
        <div
          className={`flex h-12 shrink-0 items-center gap-2.5 ${
            collapsed ? 'justify-center px-0' : 'px-4'
          }`}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <LayoutGrid size={14} aria-hidden />
          </span>
          {!collapsed && <Typography.Heading level={6} className="text-sm">{platformTitle}</Typography.Heading>}
        </div>
        <nav className={`flex flex-1 flex-col gap-0.5 ${collapsed ? 'px-1.5' : 'px-3'}`}>
          {navTree.map(renderEntry)}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mx-6 flex h-12 items-center gap-3 rounded-xl border border-foreground/20 bg-background px-6">
          <Tooltip>
            <TooltipTrigger>
              <button
                onClick={toggleCollapsed}
                aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
                className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
              >
                <PanelLeft size={14} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>{collapsed ? '展开侧边栏' : '收起侧边栏'}</TooltipContent>
          </Tooltip>
          <Breadcrumbs className="mr-auto rounded-full bg-surface-secondary px-3 py-1">
            {crumbs.map((crumb, i) => (
              <Breadcrumbs.Item
                key={crumb.label}
                onPress={crumb.path ? () => navigate(crumb.path!) : undefined}
              >
                {i === 0 ? (
                  <Home size={14} aria-label="首页" className="text-muted" />
                ) : (
                  crumb.label
                )}
              </Breadcrumbs.Item>
            ))}
          </Breadcrumbs>
          <div
            role="radiogroup"
            aria-label="主题模式"
            className="flex items-center gap-0.5 rounded-full border border-separator bg-surface-secondary p-0.5"
          >
            {(
              [
                ['light', Sun, '浅色模式'],
                ['dark', Moon, '深色模式'],
                ['system', Monitor, '跟随系统'],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                role="radio"
                aria-checked={theme === value}
                aria-label={label}
                onClick={() => setTheme(value)}
                className={`flex size-6 cursor-pointer items-center justify-center rounded-full transition-colors ${
                  theme === value
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                <Icon size={12} aria-hidden />
              </button>
            ))}
          </div>
          <Dropdown>
            <DropdownTrigger className="flex size-7 cursor-pointer items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
              {user?.nick_name?.slice(0, 1) ?? 'A'}
            </DropdownTrigger>
            <DropdownPopover placement="bottom end">
              <div className="border-b border-separator px-3 py-2">
                <Typography.Paragraph size="sm" weight="medium">
                  {user?.nick_name ?? '管理员'}
                </Typography.Paragraph>
              </div>
              <DropdownMenu
                onAction={(key) => {
                  if (key === 'logout') handleLogout()
                }}
              >
                <DropdownItem id="logout" className="flex items-center gap-2 text-danger">
                  <LogOut size={14} aria-hidden />
                  退出登录
                </DropdownItem>
              </DropdownMenu>
            </DropdownPopover>
          </Dropdown>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
