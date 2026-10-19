import { Checkbox } from '@heroui/react'

export default function SelectionCheckbox({
  label,
  variant = 'primary',
}: {
  label: string
  variant?: 'primary' | 'secondary'
}) {
  return (
    <Checkbox aria-label={label} slot="selection" variant={variant}>
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
      </Checkbox.Content>
    </Checkbox>
  )
}
