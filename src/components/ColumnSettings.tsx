import { useLayoutEffect, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import { Button, Checkbox, Popover } from '@heroui/react'
import { GripVertical, Pin, Settings2 } from 'lucide-react'

export interface ColDef {
  key: string
  label: string
}

export interface ColPrefs {
  order: string[]
  visible: string[]
  pinned: string[]
}

interface UseColPrefsOptions {
  storageKey: string
  columns: ColDef[]
  /** 不进入列设置、始终显示的列（如操作列） */
  fixedKeys?: string[]
}

export function useColPrefs({ storageKey, columns, fixedKeys = [] }: UseColPrefsOptions) {
  const fixedKeyStr = fixedKeys.join(',')
  const fixedSet = useMemo(() => new Set(fixedKeyStr.split(',')), [fixedKeyStr])
  const toggleableColumns = useMemo(
    () => columns.filter((c) => !fixedSet.has(c.key)),
    [columns, fixedSet],
  )

  const defaultPrefs = useMemo<ColPrefs>(
    () => ({
      order: columns.map((c) => c.key),
      visible: columns.map((c) => c.key),
      pinned: [],
    }),
    [columns],
  )

  const loadPrefs = (): ColPrefs => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        // 旧版格式为纯数组（可见列列表），迁移到新结构
        if (Array.isArray(parsed)) {
          const keys = parsed.filter((k) => columns.some((c) => c.key === k))
          return { ...defaultPrefs, visible: keys }
        }
        if (parsed && typeof parsed === 'object') {
          const p = parsed as Partial<ColPrefs>
          const order = [...(p.order ?? defaultPrefs.order)].filter((k) =>
            columns.some((c) => c.key === k),
          )
          // 新增列在老存储的 order 里不存在：按默认列顺序插到下一个已有列之前，并默认可见
          const added: string[] = []
          for (let i = 0; i < columns.length; i++) {
            const key = columns[i].key
            if (order.includes(key)) continue
            added.push(key)
            const next = columns.slice(i + 1).find((c) => order.includes(c.key))
            if (next) order.splice(order.indexOf(next.key), 0, key)
            else order.push(key)
          }
          const known = new Set(order)
          const visible = (p.visible ?? []).filter((k) => known.has(k))
          for (const k of added) if (!visible.includes(k)) visible.push(k)
          return {
            order,
            visible,
            pinned: (p.pinned ?? []).filter((k) => known.has(k)),
          }
        }
      }
    } catch {
      // 存储损坏时回退默认
    }
    return defaultPrefs
  }

  const [prefs, setPrefs] = useState<ColPrefs>(loadPrefs)

  const persist = (next: ColPrefs) => {
    setPrefs(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
  }

  const visibleSet = useMemo(() => new Set(prefs.visible), [prefs.visible])
  const pinnedSet = useMemo(() => new Set(prefs.pinned), [prefs.pinned])

  const toggleCol = (key: string, selected: boolean) => {
    const next = new Set(visibleSet)
    if (selected) next.add(key)
    else next.delete(key)
    persist({ ...prefs, visible: [...next] })
  }

  const toggleAllCols = (selected: boolean) => {
    persist({ ...prefs, visible: selected ? toggleableColumns.map((c) => c.key) : [] })
  }

  const togglePin = (key: string) => {
    const next = new Set(pinnedSet)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    persist({ ...prefs, pinned: [...next] })
  }

  const moveCol = (drag: string, over: string) => {
    if (drag === over) return
    const order = prefs.order.filter((k) => k !== drag)
    order.splice(order.indexOf(over), 0, drag)
    persist({ ...prefs, order })
  }

  // 固定列排到最前，其余按用户排序
  const orderedColumns = useMemo(
    () =>
      [...columns].sort((a, b) => {
        const pa = pinnedSet.has(a.key) ? 0 : 1
        const pb = pinnedSet.has(b.key) ? 0 : 1
        if (pa !== pb) return pa - pb
        return prefs.order.indexOf(a.key) - prefs.order.indexOf(b.key)
      }),
    [columns, prefs.order, pinnedSet],
  )

  const visibleColumns = useMemo(
    () => orderedColumns.filter((c) => fixedSet.has(c.key) || visibleSet.has(c.key)),
    [orderedColumns, fixedSet, visibleSet],
  )

  const popoverColumns = useMemo(
    () => orderedColumns.filter((c) => !fixedSet.has(c.key)),
    [orderedColumns, fixedSet],
  )

  return {
    prefs,
    visibleSet,
    pinnedSet,
    toggleableColumns,
    orderedColumns,
    visibleColumns,
    popoverColumns,
    toggleCol,
    toggleAllCols,
    togglePin,
    moveCol,
  }
}

export type ColPrefsController = ReturnType<typeof useColPrefs>

interface UseStickyColumnsOptions {
  containerRef: RefObject<HTMLElement | null>
  visibleColumns: ColDef[]
  pinnedSet: Set<string>
  /** 固定在右侧的列 key（如操作列），横向滚动时保持可见 */
  fixedRightKeys?: string[]
}

export function useStickyColumns({
  containerRef,
  visibleColumns,
  pinnedSet,
  fixedRightKeys = ['actions'],
}: UseStickyColumnsOptions) {
  const [colOffsets, setColOffsets] = useState<number[]>([])

  const signature = visibleColumns.map((c) => c.key).join(',')
  useLayoutEffect(() => {
    const table = containerRef.current?.querySelector('table')
    if (!table) return
    const measure = () => {
      const headRow = table.tHead?.rows.item(0)
      if (!headRow) return
      const tableLeft = table.getBoundingClientRect().left
      setColOffsets(Array.from(headRow.cells, (th) => th.getBoundingClientRect().left - tableLeft))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(table)
    return () => ro.disconnect()
  }, [containerRef, signature])

  const lastPinnedIndex = useMemo(() => {
    for (let i = visibleColumns.length - 1; i >= 0; i--) {
      if (pinnedSet.has(visibleColumns[i].key)) return i
    }
    return -1
  }, [visibleColumns, pinnedSet])

  // 表头粘性由 TableHeader 承担（官方写法）；固定列只需横向粘性 + 不透明底
  const stickyColProps = (key: string, isHeader: boolean) => {
    const i = visibleColumns.findIndex((c) => c.key === key)
    if (i < 0) return {}
    if (fixedRightKeys.includes(key)) {
      // 宽度 0 提示 + 不换行：列为 auto 布局时收缩到内容宽度，剩余宽度分给其他列
      return isHeader
        ? {
            className:
              'sticky right-0 z-30 w-0 whitespace-nowrap bg-surface-secondary shadow-[-8px_0_12px_-6px_rgba(0,0,0,0.15)]',
          }
        : {
            className:
              'sticky right-0 z-10 w-0 whitespace-nowrap bg-surface shadow-[-8px_0_12px_-6px_rgba(0,0,0,0.15)]',
          }
    }
    if (!pinnedSet.has(key)) return {}
    if (isHeader) {
      return {
        className: `sticky z-30 bg-surface-secondary ${
          i === lastPinnedIndex ? 'shadow-[8px_0_12px_-6px_rgba(0,0,0,0.15)]' : ''
        }`,
        style: { left: colOffsets[i] ?? 0 },
      }
    }
    return {
      className: `sticky z-10 bg-surface ${
        i === lastPinnedIndex ? 'shadow-[8px_0_12px_-6px_rgba(0,0,0,0.15)]' : ''
      }`,
      style: { left: colOffsets[i] ?? 0 },
    }
  }

  return { stickyColProps, lastPinnedIndex }
}

export function ColumnSettings({ ctrl }: { ctrl: ColPrefsController }) {
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)

  return (
    <Popover>
      <Button variant="ghost" size="sm" aria-label="列设置">
        <Settings2 size={12} className="size-3!" aria-hidden />
        列设置
      </Button>
      <Popover.Content className="w-52">
        <div aria-label="显示列" className="flex flex-col gap-1 p-2" role="group">
          <Checkbox
            isSelected={
              ctrl.toggleableColumns.length > 0 &&
              ctrl.toggleableColumns.every((c) => ctrl.visibleSet.has(c.key))
            }
            isIndeterminate={
              !ctrl.toggleableColumns.every((c) => ctrl.visibleSet.has(c.key)) &&
              ctrl.toggleableColumns.some((c) => ctrl.visibleSet.has(c.key))
            }
            onChange={ctrl.toggleAllCols}
          >
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              全选
            </Checkbox.Content>
          </Checkbox>
          {ctrl.popoverColumns.map((col) => {
            const pinned = ctrl.pinnedSet.has(col.key)
            return (
              <div
                key={col.key}
                draggable
                onDragStart={() => setDragKey(col.key)}
                onDragEnd={() => {
                  setDragKey(null)
                  setOverKey(null)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (col.key !== dragKey) setOverKey(col.key)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragKey) ctrl.moveCol(dragKey, col.key)
                  setDragKey(null)
                  setOverKey(null)
                }}
                className={`flex items-center gap-0.5 rounded-md px-1 ${
                  dragKey && overKey === col.key && dragKey !== col.key ? 'bg-accent-soft' : ''
                }`}
              >
                <span aria-hidden className="cursor-grab text-muted active:cursor-grabbing">
                  <GripVertical size={14} />
                </span>
                <Checkbox
                  isSelected={ctrl.visibleSet.has(col.key)}
                  onChange={(selected) => ctrl.toggleCol(col.key, selected)}
                  className="flex-1"
                >
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    {col.label}
                  </Checkbox.Content>
                </Checkbox>
                <button
                  type="button"
                  aria-pressed={pinned}
                  aria-label={pinned ? `取消固定${col.label}` : `固定${col.label}`}
                  onClick={() => ctrl.togglePin(col.key)}
                  className={`flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-surface-secondary ${
                    pinned ? 'text-accent' : 'text-muted'
                  }`}
                >
                  <Pin size={13} aria-hidden className={pinned ? 'fill-current' : undefined} />
                </button>
              </div>
            )
          })}
        </div>
      </Popover.Content>
    </Popover>
  )
}
