import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  ListBox,
  ListBoxItem,
  SelectPopover,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from '@heroui/react'

const SIZES = [10, 20, 50]

export default function PageSizeStepper({
  pageSize,
  onChange,
}: {
  pageSize: number
  onChange: (n: number) => void
}) {
  return (
    <SelectRoot
      aria-label="每页条数"
      selectedKey={String(pageSize)}
      onSelectionChange={(key) => {
        const k = key as string | null
        if (k) onChange(Number(k))
      }}
    >
      <SelectTrigger className="h-7! min-h-0! items-center! gap-1.5! rounded-md! bg-transparent! px-1! py-0! shadow-none! hover:bg-default!">
        <span className="text-xs text-muted">每页条数</span>
        <SelectValue className="text-xs! text-foreground!" />
        <span aria-hidden className="flex flex-col leading-none text-muted">
          <ChevronUp size={12} />
          <ChevronDown size={12} className="-mt-1.5" />
        </span>
      </SelectTrigger>
      <SelectPopover>
        <ListBox>
          {SIZES.map((n) => (
            <ListBoxItem key={String(n)} id={String(n)}>
              {n}
            </ListBoxItem>
          ))}
        </ListBox>
      </SelectPopover>
    </SelectRoot>
  )
}
