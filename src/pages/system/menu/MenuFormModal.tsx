import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Radio,
  RadioGroup,
  SelectIndicator,
  SelectPopover,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  TextField,
  toast,
} from '@heroui/react'
import { ListTree } from 'lucide-react'
import FormModal from '../../../components/FormModal'
import { FormSection, FormSwitch } from '../../../components/FormSection'
import { addMenu, editMenu } from '../../../api/menu'
import { MENU_ICON_OPTIONS } from '../../../components/layout/menuIcons'
import type { MenuPayload, MenuType, SysMenuRow } from '../../../types/menu'
import { collectSubtreeIds, findRow } from './menuTree'

interface Props {
  isOpen: boolean
  editing: SysMenuRow | null
  presetParentId?: number
  tree: SysMenuRow[]
  onClose: () => void
}

interface FormState {
  parentId: string
  menuType: MenuType
  menuName: string
  orderNum: string
  path: string
  component: string
  query: string
  perms: string
  icon: string
  visible: string
  status: string
  isFrame: number
  isCache: number
}

const emptyForm: FormState = {
  parentId: '0',
  menuType: 'M',
  menuName: '',
  orderNum: '0',
  path: '',
  component: '',
  query: '',
  perms: '',
  icon: 'default',
  visible: '0',
  status: '0',
  isFrame: 1,
  isCache: 1,
}

const MENU_TYPES: { value: MenuType; label: string }[] = [
  { value: 'M', label: '目录' },
  { value: 'C', label: '菜单' },
  { value: 'F', label: '按钮' },
]

const ICON_KEYS = new Set(MENU_ICON_OPTIONS.map((opt) => opt.key))

export default function MenuFormModal({ isOpen, editing, presetParentId, tree, onClose }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  // 上级选项：顶级 + 目录/菜单平铺缩进；编辑时排除自己及子树
  const parentOptions = useMemo(() => {
    const editingRow = editing ? findRow(tree, editing.menu_id) : null
    const hidden = new Set(editingRow ? collectSubtreeIds(editingRow) : [])
    const options: { id: number; label: string }[] = [{ id: 0, label: '主类目' }]
    const walk = (rows: SysMenuRow[], depth: number) => {
      for (const row of rows) {
        if (row.menu_type === 'F' || hidden.has(row.menu_id)) continue
        options.push({ id: row.menu_id, label: `${'　'.repeat(depth)}${row.menu_name}` })
        walk(row.children ?? [], depth + 1)
      }
    }
    walk(tree, 0)
    return options
  }, [tree, editing])

  useEffect(() => {
    if (!isOpen) return
    setForm(
      editing
        ? {
            parentId: String(editing.parent_id),
            menuType: editing.menu_type,
            menuName: editing.menu_name,
            orderNum: String(editing.order_num),
            path: editing.path ?? '',
            component: editing.component ?? '',
            query: editing.query ?? '',
            perms: editing.perms ?? '',
            icon: editing.icon && ICON_KEYS.has(editing.icon) ? editing.icon : 'default',
            visible: editing.visible ?? '0',
            status: editing.status ?? '0',
            isFrame: editing.is_frame ?? 1,
            isCache: editing.is_cache ?? 1,
          }
        : { ...emptyForm, parentId: String(presetParentId ?? 0) },
    )
  }, [isOpen, editing, presetParentId])

  const handleSubmit = async () => {
    if (!form.menuName.trim()) {
      toast('提示', { description: '请填写菜单名称', variant: 'warning' })
      return
    }
    if (form.menuType !== 'F' && !form.path.trim()) {
      toast('提示', {
        description: form.isFrame === 0 ? '请填写外链地址' : '请填写路由地址',
        variant: 'warning',
      })
      return
    }
    if (form.menuType === 'C' && form.isFrame !== 0 && !form.component.trim()) {
      toast('提示', { description: '请填写组件路径', variant: 'warning' })
      return
    }

    const payload: MenuPayload = {
      menuName: form.menuName.trim(),
      parentId: Number(form.parentId),
      orderNum: Number(form.orderNum) || 0,
      menuType: form.menuType,
      path: form.menuType === 'F' ? undefined : form.path.trim() || undefined,
      component:
        form.menuType === 'C' && form.isFrame !== 0
          ? form.component.trim() || undefined
          : undefined,
      query:
        form.menuType === 'C' && form.isFrame !== 0 ? form.query.trim() || undefined : undefined,
      isFrame: form.menuType === 'F' ? undefined : form.isFrame,
      isCache: form.menuType === 'C' ? form.isCache : undefined,
      visible: form.menuType === 'F' ? '0' : form.visible,
      status: form.status,
      perms: form.menuType === 'M' ? undefined : form.perms.trim() || undefined,
      icon: form.menuType === 'F' || form.icon === 'default' ? undefined : form.icon,
    }

    setSaving(true)
    try {
      if (editing) {
        await editMenu({ ...payload, menuId: editing.menu_id })
        toast('成功', { description: '修改菜单成功', variant: 'success' })
      } else {
        await addMenu(payload)
        toast('成功', { description: '新增菜单成功', variant: 'success' })
      }
      queryClient.invalidateQueries({ queryKey: ['menu-list'] })
      queryClient.invalidateQueries({ queryKey: ['menu-tree'] })
      queryClient.invalidateQueries({ queryKey: ['user-routers'] })
      onClose()
    } catch {
      return
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? '编辑菜单' : '新增菜单'}
      icon={ListTree}
      size="lg"
      saving={saving}
      onSubmit={handleSubmit}
    >
      <FormSection title="基本信息">
        <div className="grid grid-cols-2 gap-4">
          <SelectRoot
            aria-label="上级菜单"
            selectedKey={form.parentId}
            onSelectionChange={(key) => {
              if (key != null) setForm((f) => ({ ...f, parentId: String(key) }))
            }}
          >
            <Label>上级菜单</Label>
            <SelectTrigger>
              <SelectValue />
              <SelectIndicator />
            </SelectTrigger>
            <SelectPopover>
              <ListBox>
                {parentOptions.map((opt) => (
                  <ListBoxItem key={String(opt.id)} id={String(opt.id)}>
                    {opt.label}
                  </ListBoxItem>
                ))}
              </ListBox>
            </SelectPopover>
          </SelectRoot>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted">菜单类型</span>
            <RadioGroup
              aria-label="菜单类型"
              orientation="horizontal"
              value={form.menuType}
              onChange={(value) => setForm((f) => ({ ...f, menuType: value as MenuType }))}
              className="min-h-8 items-center gap-4"
            >
              {MENU_TYPES.map((type) => (
                <Radio key={type.value} value={type.value}>
                  <Radio.Content>
                    <Radio.Control>
                      <Radio.Indicator />
                    </Radio.Control>
                    {type.label}
                  </Radio.Content>
                </Radio>
              ))}
            </RadioGroup>
          </div>

          <TextField
            value={form.menuName}
            onChange={(v) => setForm((f) => ({ ...f, menuName: v }))}
            isRequired
          >
            <Label>菜单名称</Label>
            <Input />
          </TextField>
          <TextField
            value={form.orderNum}
            onChange={(v) => setForm((f) => ({ ...f, orderNum: v }))}
          >
            <Label>显示排序</Label>
            <Input inputMode="numeric" />
          </TextField>

          {form.menuType !== 'F' && (
            <SelectRoot
              aria-label="菜单图标"
              selectedKey={form.icon}
              onSelectionChange={(key) => {
                if (key != null) setForm((f) => ({ ...f, icon: String(key) }))
              }}
            >
              <Label>菜单图标</Label>
              <SelectTrigger>
                <SelectValue />
                <SelectIndicator />
              </SelectTrigger>
              <SelectPopover>
                <ListBox>
                  {MENU_ICON_OPTIONS.map((opt) => {
                    const Icon = opt.icon
                    return (
                      <ListBoxItem key={opt.key} id={opt.key} textValue={opt.label}>
                        <span className="flex items-center gap-2">
                          <Icon size={14} aria-hidden />
                          {opt.label}
                        </span>
                      </ListBoxItem>
                    )
                  })}
                </ListBox>
              </SelectPopover>
            </SelectRoot>
          )}
        </div>
      </FormSection>

      {form.menuType !== 'F' && (
        <FormSection title="路由配置">
          <div className="grid grid-cols-2 gap-4">
            <TextField
              value={form.path}
              onChange={(v) => setForm((f) => ({ ...f, path: v }))}
              isRequired
            >
              <Label>{form.isFrame === 0 ? '外链地址' : '路由地址'}</Label>
              <Input />
            </TextField>
            {form.menuType === 'C' && form.isFrame !== 0 && (
              <>
                <TextField
                  value={form.component}
                  onChange={(v) => setForm((f) => ({ ...f, component: v }))}
                  isRequired
                >
                  <Label>组件路径</Label>
                  <Input />
                </TextField>
                <TextField
                  value={form.query}
                  onChange={(v) => setForm((f) => ({ ...f, query: v }))}
                >
                  <Label>路由参数</Label>
                  <Input />
                </TextField>
              </>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-6">
            <FormSwitch
              label="外链菜单"
              isSelected={form.isFrame === 0}
              onChange={(v) => setForm((f) => ({ ...f, isFrame: v ? 0 : 1 }))}
            />
            {form.menuType === 'C' && form.isFrame !== 0 && (
              <FormSwitch
                label="缓存页面"
                isSelected={form.isCache === 0}
                onChange={(v) => setForm((f) => ({ ...f, isCache: v ? 0 : 1 }))}
              />
            )}
          </div>
        </FormSection>
      )}

      <FormSection title="权限与状态">
        <div className="flex flex-col gap-4">
          {form.menuType !== 'M' && (
            <TextField
              value={form.perms}
              onChange={(v) => setForm((f) => ({ ...f, perms: v }))}
            >
              <Label>权限标识</Label>
              <Input />
            </TextField>
          )}
          <div className="grid grid-cols-2 gap-x-6">
            {form.menuType !== 'F' && (
              <FormSwitch
                label="显示菜单"
                isSelected={form.visible === '0'}
                onChange={(v) => setForm((f) => ({ ...f, visible: v ? '0' : '1' }))}
              />
            )}
            <FormSwitch
              label="启用菜单"
              isSelected={form.status === '0'}
              onChange={(v) => setForm((f) => ({ ...f, status: v ? '0' : '1' }))}
            />
          </div>
        </div>
      </FormSection>
    </FormModal>
  )
}
