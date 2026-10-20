import { useEffect, useState } from 'react'
import { Button, Input, Label, TextField } from '@heroui/react'
import { Link2 } from 'lucide-react'
import FormModal from '../FormModal'

interface Props {
  isOpen: boolean
  initialHref: string
  hasLink: boolean
  onClose: () => void
  onApply: (href: string) => void
  onRemove: () => void
}

export default function LinkDialog({ isOpen, initialHref, hasLink, onClose, onApply, onRemove }: Props) {
  const [href, setHref] = useState(initialHref)

  useEffect(() => {
    if (isOpen) setHref(initialHref)
  }, [isOpen, initialHref])

  const apply = () => onApply(href.trim())

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title={hasLink ? '编辑链接' : '插入链接'}
      icon={Link2}
      size="sm"
      onSubmit={apply}
      footer={
        <>
          {hasLink && (
            <Button variant="danger-soft" size="sm" onPress={onRemove}>
              移除链接
            </Button>
          )}
          <Button className="ml-auto" variant="tertiary" size="sm" onPress={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" onPress={apply}>
            确定
          </Button>
        </>
      }
    >
      <TextField value={href} onChange={setHref}>
        <Label>链接地址</Label>
        <Input
          autoFocus
          placeholder="https://example.com"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              apply()
            }
          }}
        />
      </TextField>
    </FormModal>
  )
}
