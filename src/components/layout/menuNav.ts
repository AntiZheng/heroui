import type { ReactElement } from 'react'
import type { LucideIcon } from 'lucide-react'
import { matchPath } from 'react-router-dom'
import type { SysMenuRow } from '../../types/menu'
import { menuPageRegistry } from '../../router/menuRegistry'
import { resolveMenuIcon } from './menuIcons'

export interface MenuNavNode {
  key: string
  label: string
  icon: LucideIcon
  path?: string
  external?: string
  matchPaths?: string[]
  children?: MenuNavNode[]
}

export interface DynamicRouteDef {
  path: string
  element: ReactElement
}

export interface MenuCrumb {
  label: string
  path?: string
}

export function resolveMenuPath(parentPath: string, path?: string | null): string {
  const raw = (path ?? '').trim()
  if (!raw) return parentPath
  if (raw.startsWith('/')) return raw.length > 1 ? raw.replace(/\/+$/, '') : '/'
  const base = parentPath && parentPath !== '/' ? parentPath.replace(/\/+$/, '') : ''
  return `${base}/${raw}`.replace(/\/{2,}/g, '/')
}

function pageDefOf(row: SysMenuRow) {
  return row.component ? menuPageRegistry[row.component] : undefined
}

export function isMenuComponentRegistered(component?: string | null): boolean {
  return !!component && !!menuPageRegistry[component]
}

export function buildMenuNav(nodes: SysMenuRow[], parentPath = ''): MenuNavNode[] {
  const result: MenuNavNode[] = []
  for (const node of nodes) {
    if (node.visible === '1') continue
    const fullPath = resolveMenuPath(parentPath, node.path)
    if (node.menu_type === 'M') {
      const children = buildMenuNav(node.children ?? [], fullPath)
      if (children.length > 0) {
        result.push({
          key: String(node.menu_id),
          label: node.menu_name,
          icon: resolveMenuIcon(node.icon),
          children,
        })
      }
      continue
    }
    if (node.menu_type !== 'C' || (!pageDefOf(node) && node.is_frame !== 0)) continue
    const def = pageDefOf(node)
    const leafPath =
      node.is_frame === 0 ? undefined : node.component === 'index' ? '/' : fullPath
    result.push({
      key: String(node.menu_id),
      label: node.menu_name,
      icon: resolveMenuIcon(node.icon),
      path: leafPath,
      external: node.is_frame === 0 ? (node.path ?? undefined) : undefined,
      matchPaths: leafPath
        ? [
            leafPath,
            ...(def?.extras ?? []).map((extra) => resolveMenuPath(leafPath, extra.path)),
          ]
        : undefined,
    })
  }
  return result
}

export function isNavActive(node: MenuNavNode, pathname: string): boolean {
  return (node.matchPaths ?? []).some(
    (path) => matchPath({ path, end: true }, pathname) !== null,
  )
}

export function firstNavPath(node: MenuNavNode): string | undefined {
  if (node.path) return node.path
  if (node.external) return undefined
  for (const child of node.children ?? []) {
    const path = firstNavPath(child)
    if (path) return path
  }
  return undefined
}

export function buildMenuRoutes(nodes: SysMenuRow[], parentPath = ''): DynamicRouteDef[] {
  const result: DynamicRouteDef[] = []
  const seen = new Set<string>()

  const add = (path: string, element: ReactElement) => {
    if (!path || path === '/' || seen.has(path)) return
    seen.add(path)
    result.push({ path, element })
  }

  const walk = (list: SysMenuRow[], parent: string) => {
    for (const node of list) {
      const fullPath = resolveMenuPath(parent, node.path)
      if (node.menu_type === 'M') {
        walk(node.children ?? [], fullPath)
        continue
      }
      if (node.menu_type !== 'C' || node.component === 'index' || node.is_frame === 0) continue
      const def = pageDefOf(node)
      if (!def) continue
      add(fullPath, def.element)
      for (const extra of def.extras ?? []) {
        add(resolveMenuPath(fullPath, extra.path), extra.element)
      }
    }
  }

  walk(nodes, parentPath)
  return result
}

export function breadcrumbsFor(pathname: string, menus: SysMenuRow[]): MenuCrumb[] {
  const home: MenuCrumb = { label: '首页', path: '/' }
  if (pathname === '/') return [home]

  interface Candidate {
    chain: { row: SysMenuRow; fullPath: string }[]
    fullPath: string
    component: string
  }
  let best: Candidate | null = null

  const walk = (
    list: SysMenuRow[],
    parentPath: string,
    chain: { row: SysMenuRow; fullPath: string }[],
  ) => {
    for (const row of list) {
      const fullPath = resolveMenuPath(parentPath, row.path)
      if (row.menu_type === 'M') {
        walk(row.children ?? [], fullPath, [...chain, { row, fullPath }])
        continue
      }
      if (row.menu_type !== 'C' || row.component === 'index' || row.is_frame === 0 || !pageDefOf(row)) continue
      const matched = pathname === fullPath || pathname.startsWith(`${fullPath}/`)
      if (matched && (!best || fullPath.length > best.fullPath.length)) {
        best = {
          chain: [...chain, { row, fullPath }],
          fullPath,
          component: row.component ?? '',
        }
      }
    }
  }

  walk(menus, '', [])
  if (!best) return [home]

  const matched = best as Candidate
  const crumbs: MenuCrumb[] = [
    home,
    ...matched.chain.map(({ row, fullPath }) => ({
      label: row.menu_name,
      path: row.menu_type === 'C' ? fullPath : undefined,
    })),
  ]

  const def = menuPageRegistry[matched.component]
  for (const extra of def?.extras ?? []) {
    const extraPath = resolveMenuPath(matched.fullPath, extra.path)
    if (matchPath({ path: extraPath, end: true }, pathname)) {
      if (extra.crumbLabel) crumbs.push({ label: extra.crumbLabel })
      break
    }
  }
  return crumbs
}
