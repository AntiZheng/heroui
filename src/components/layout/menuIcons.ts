import {
  BookA,
  Briefcase,
  Building2,
  Circle,
  FileClock,
  FileText,
  Files,
  Folder,
  HardDrive,
  Home,
  KeyRound,
  ListTree,
  LogIn,
  Map as MapIcon,
  Megaphone,
  Monitor,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

export const MENU_ICON_OPTIONS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'home', label: '首页', icon: Home },
  { key: 'system', label: '系统', icon: Settings2 },
  { key: 'user', label: '用户', icon: Users },
  { key: 'peoples', label: '角色', icon: ShieldCheck },
  { key: 'list', label: '菜单', icon: ListTree },
  { key: 'tree', label: '部门', icon: Building2 },
  { key: 'post', label: '岗位', icon: Briefcase },
  { key: 'dict', label: '字典', icon: BookA },
  { key: 'edit', label: '参数', icon: SlidersHorizontal },
  { key: 'notification', label: '公告', icon: Megaphone },
  { key: 'job', label: '任务', icon: Timer },
  { key: 'log', label: '日志', icon: FileClock },
  { key: 'logininfor', label: '登录', icon: LogIn },
  { key: 'monitor', label: '监控', icon: Monitor },
  { key: 'tool', label: '工具', icon: Wrench },
  { key: 'file-text', label: '文本', icon: FileText },
  { key: 'map', label: '地图', icon: MapIcon },
  { key: 'folder', label: '目录', icon: Folder },
  { key: 'file', label: '文件', icon: Files },
  { key: 'storage', label: '存储', icon: HardDrive },
  { key: 'key', label: '密钥', icon: KeyRound },
  { key: 'default', label: '默认', icon: Circle },
]

const iconMap = new Map(MENU_ICON_OPTIONS.map((item) => [item.key, item.icon]))

export function resolveMenuIcon(name?: string | null): LucideIcon {
  return iconMap.get(name ?? '') ?? Circle
}
