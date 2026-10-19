import type { ReactNode } from 'react'
import { Ban } from 'lucide-react'
import { Chip, Input, Switch, SwitchContent, SwitchControl, SwitchThumb } from '@heroui/react'

type Tone = 'accent' | 'success' | 'warning' | 'danger'

export function FormSection({
  title,
  tone = 'accent',
  children,
}: {
  title: string
  tone?: Tone
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <Chip
        color={tone}
        variant="soft"
        size="sm"
        className="h-6 cursor-default px-2.5 text-[13px] font-semibold select-none"
      >
        {title}
      </Chip>
      <div className="pl-3">{children}</div>
    </section>
  )
}

export function ReadOnlyInput({ placeholder }: { placeholder?: string }) {
  return (
    <div className="group relative cursor-not-allowed select-none">
      <Input placeholder={placeholder} className="pe-8" />
      <Ban
        size={12}
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted opacity-0 transition-opacity group-hover:opacity-100"
      />
    </div>
  )
}

export function FormSwitch({
  label,
  isSelected,
  onChange,
  isDisabled,
}: {
  label: string
  isSelected: boolean
  onChange: (selected: boolean) => void
  isDisabled?: boolean
}) {
  return (
    <Switch
      aria-label={label}
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={isDisabled}
      className="w-full py-0.5 pl-3 [--switch-control-bg-checked:var(--success)] [--switch-control-bg-checked-hover:var(--success-hover)]"
    >
      <SwitchContent className="flex w-full items-center justify-between gap-4">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </SwitchContent>
    </Switch>
  )
}
