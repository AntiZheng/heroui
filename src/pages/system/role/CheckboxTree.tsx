import { Checkbox } from '@heroui/react'

export interface TreeOption {
  id: number
  label: string
  children?: TreeOption[]
}

export function collectSubtree(node: TreeOption): number[] {
  return [node.id, ...(node.children ?? []).flatMap(collectSubtree)]
}

export function isBranchFullyChecked(node: TreeOption, checked: Set<number>): boolean {
  if (node.children?.length) return node.children.every((c) => isBranchFullyChecked(c, checked))
  return checked.has(node.id)
}

export function isBranchPartiallyChecked(node: TreeOption, checked: Set<number>): boolean {
  if (!node.children?.length) return false
  if (isBranchFullyChecked(node, checked)) return false
  return collectSubtree(node).some((id) => checked.has(id))
}

// 勾选父节点 = 整棵子树全选；取消 = 整棵子树清空
export function toggleBranch(node: TreeOption, checked: Set<number>): Set<number> {
  const next = new Set(checked)
  const ids = collectSubtree(node)
  if (isBranchFullyChecked(node, checked)) ids.forEach((id) => next.delete(id))
  else ids.forEach((id) => next.add(id))
  return next
}

// 后端保存的 id 可能含父节点，展开为其全部子孙得到叶子勾选集
export function expandCheckedKeys(nodes: TreeOption[], keys: number[]): Set<number> {
  const set = new Set<number>()
  const walk = (node: TreeOption) => {
    if (keys.includes(node.id)) collectSubtree(node).forEach((id) => set.add(id))
    else node.children?.forEach(walk)
  }
  nodes.forEach(walk)
  return set
}

// 提交集：叶子取勾选项；父节点在其全部子级都已勾选时计入
export function collectCheckedIds(nodes: TreeOption[], checked: Set<number>): number[] {
  return nodes.flatMap((node) => {
    if (node.children?.length) {
      const children = collectCheckedIds(node.children, checked)
      if (children.length === collectSubtree(node).length - 1) return [node.id, ...children]
      return children
    }
    return checked.has(node.id) ? [node.id] : []
  })
}

interface Props {
  nodes: TreeOption[]
  checked: Set<number>
  onChange: (next: Set<number>) => void
  className?: string
}

export default function CheckboxTree({ nodes, checked, onChange, className }: Props) {
  const allIds = nodes.flatMap(collectSubtree)
  const allChecked = allIds.length > 0 && allIds.every((id) => checked.has(id))
  const allIndeterminate = !allChecked && allIds.some((id) => checked.has(id))

  const renderNodes = (list: TreeOption[], depth: number) =>
    list.map((node) => {
      const hasChildren = !!node.children?.length
      return (
        <div key={node.id} style={{ paddingLeft: depth * 20 }}>
          <Checkbox
            isSelected={hasChildren ? isBranchFullyChecked(node, checked) : checked.has(node.id)}
            isIndeterminate={hasChildren ? isBranchPartiallyChecked(node, checked) : false}
            onChange={() => onChange(toggleBranch(node, checked))}
          >
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              {node.label}
            </Checkbox.Content>
          </Checkbox>
          {node.children && renderNodes(node.children, depth + 1)}
        </div>
      )
    })

  return (
    <div className={className}>
      <Checkbox
        isSelected={allChecked}
        isIndeterminate={allIndeterminate}
        onChange={() => onChange(allChecked ? new Set() : new Set(allIds))}
      >
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          全选
        </Checkbox.Content>
      </Checkbox>
      {renderNodes(nodes, 0)}
    </div>
  )
}
