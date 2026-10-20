import type { SysMenuRow } from '../../../types/menu'

export interface FlatMenuRow {
  row: SysMenuRow
  depth: number
}

export function flattenVisible(
  rows: SysMenuRow[],
  expanded: Set<number>,
  depth = 0,
  out: FlatMenuRow[] = [],
): FlatMenuRow[] {
  for (const row of rows) {
    out.push({ row, depth })
    if (row.children?.length && expanded.has(row.menu_id)) {
      flattenVisible(row.children, expanded, depth + 1, out)
    }
  }
  return out
}

export function findRow(rows: SysMenuRow[], id: number): SysMenuRow | null {
  for (const row of rows) {
    if (row.menu_id === id) return row
    const hit = findRow(row.children ?? [], id)
    if (hit) return hit
  }
  return null
}

export function collectSubtreeIds(row: SysMenuRow): number[] {
  return [row.menu_id, ...(row.children ?? []).flatMap(collectSubtreeIds)]
}

export function countAll(rows: SysMenuRow[]): number {
  return rows.reduce((acc, r) => acc + 1 + countAll(r.children ?? []), 0)
}

export function countIds(rows: SysMenuRow[]): number[] {
  return rows.flatMap((r) => [r.menu_id, ...(r.children?.length ? countIds(r.children) : [])])
}
