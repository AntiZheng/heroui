import type { DeptTreeNode } from '../../../types/user'

export interface DeptOption {
  id: number
  label: string
}

export function flattenDeptTree(nodes: DeptTreeNode[], depth = 0): DeptOption[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${'　'.repeat(depth)}${node.label}` },
    ...flattenDeptTree(node.children ?? [], depth + 1),
  ])
}
