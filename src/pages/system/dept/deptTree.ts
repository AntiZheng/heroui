import type { SysDeptRow } from '../../../types/dept'

export interface FlatDeptRow {
  row: SysDeptRow
  depth: number
}

export function flattenVisible(
  rows: SysDeptRow[],
  expanded: Set<number>,
  depth = 0,
  out: FlatDeptRow[] = [],
): FlatDeptRow[] {
  for (const row of rows) {
    out.push({ row, depth })
    if (row.children?.length && expanded.has(row.dept_id)) {
      flattenVisible(row.children, expanded, depth + 1, out)
    }
  }
  return out
}

export function findRow(rows: SysDeptRow[], id: number): SysDeptRow | null {
  for (const row of rows) {
    if (row.dept_id === id) return row
    const hit = findRow(row.children ?? [], id)
    if (hit) return hit
  }
  return null
}

export function collectSubtreeIds(row: SysDeptRow): number[] {
  return [row.dept_id, ...(row.children ?? []).flatMap(collectSubtreeIds)]
}

// 后端 ancestors 不含自身：顶级为 '0'，子级 = 父.ancestors + ',' + 父.id
export function computeAncestors(parent: SysDeptRow | null): string {
  return parent ? `${parent.ancestors},${parent.dept_id}` : '0'
}
