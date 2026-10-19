import { useState } from 'react'
import { Switch, SwitchContent, SwitchControl, SwitchThumb, toast } from '@heroui/react'
import { changeStatus } from '../../../api/user'
import type { SysUserRow } from '../../../types/user'

export default function StatusSwitch({ row }: { row: SysUserRow }) {
  const [status, setStatus] = useState(row.status)

  const handleChange = async (checked: boolean) => {
    const next = checked ? '0' : '1'
    try {
      await changeStatus(row, next)
      setStatus(next)
      toast('成功', { description: '状态修改成功', variant: 'success' })
    } catch {
      // 失败保持原状态
    }
  }

  return (
    <Switch isSelected={status === '0'} onChange={handleChange} aria-label="启用状态">
      <SwitchContent>
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </SwitchContent>
    </Switch>
  )
}
