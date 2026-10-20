import { DateField, DateRangePicker, Label, RangeCalendar } from '@heroui/react'
import type { DateValue } from '@internationalized/date'

export interface DateRangeValue {
  start: DateValue
  end: DateValue
}

interface Props {
  label: string
  value: DateRangeValue | null
  onChange: (value: DateRangeValue | null) => void
}

export default function DateRangeFilter({ label, value, onChange }: Props) {
  return (
    <DateRangePicker
      aria-label={label}
      className="w-48"
      value={value}
      onChange={(next) => onChange(next)}
    >
      <Label className="text-xs font-medium text-muted">{label}</Label>
      <DateField.Group fullWidth className="h-8! min-h-8! text-xs!">
        <DateField.Input slot="start" className="text-xs!">
          {(segment) => <DateField.Segment segment={segment} />}
        </DateField.Input>
        <DateRangePicker.RangeSeparator />
        <DateField.Input slot="end" className="text-xs!">
          {(segment) => <DateField.Segment segment={segment} />}
        </DateField.Input>
        <DateField.Suffix>
          <DateRangePicker.Trigger>
            <DateRangePicker.TriggerIndicator />
          </DateRangePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      <DateRangePicker.Popover>
        <RangeCalendar aria-label={label}>
          <RangeCalendar.Header>
            <RangeCalendar.YearPickerTrigger>
              <RangeCalendar.YearPickerTriggerHeading />
              <RangeCalendar.YearPickerTriggerIndicator />
            </RangeCalendar.YearPickerTrigger>
            <RangeCalendar.NavButton slot="previous" />
            <RangeCalendar.NavButton slot="next" />
          </RangeCalendar.Header>
          <RangeCalendar.Grid>
            <RangeCalendar.GridHeader>
              {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
            </RangeCalendar.GridHeader>
            <RangeCalendar.GridBody>
              {(date) => <RangeCalendar.Cell date={date} />}
            </RangeCalendar.GridBody>
          </RangeCalendar.Grid>
          <RangeCalendar.YearPickerGrid>
            <RangeCalendar.YearPickerGridBody>
              {({ year }) => <RangeCalendar.YearPickerCell year={year} />}
            </RangeCalendar.YearPickerGridBody>
          </RangeCalendar.YearPickerGrid>
        </RangeCalendar>
      </DateRangePicker.Popover>
    </DateRangePicker>
  )
}
