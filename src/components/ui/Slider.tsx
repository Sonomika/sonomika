import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, value, defaultValue, min = 0, max = 100, ...props }, ref) => {
  const values = React.useMemo(() => {
    if (Array.isArray(value)) return value as number[]
    if (Array.isArray(defaultValue)) return defaultValue as number[]
    return [min, max]
  }, [value, defaultValue, min, max])

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "tw-relative tw-flex tw-w-full tw-touch-none tw-select-none tw-items-center",
        className
      )}
      value={value as any}
      defaultValue={defaultValue as any}
      min={min}
      max={max}
      {...props}
    >
      <SliderPrimitive.Track className="tw-relative tw-h-[3px] tw-w-full tw-grow tw-overflow-hidden tw-rounded-full tw-bg-neutral-700">
        <SliderPrimitive.Range className="tw-absolute tw-h-full" style={{ backgroundColor: 'var(--accent-color)' }} />
      </SliderPrimitive.Track>
      {values.map((_, idx) => (
        <SliderPrimitive.Thumb
          key={idx}
          className="tw-block tw-h-4 tw-w-4 tw-rounded-full tw-border-2 tw-transition-colors focus-visible:tw-outline-none"
          style={{ borderColor: 'var(--accent-color)', backgroundColor: 'var(--accent-color)' }}
        />
      ))}
    </SliderPrimitive.Root>
  )
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
