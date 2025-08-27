import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "tw-flex tw-min-h-[80px] tw-w-full tw-rounded-md tw-border tw-border-solid tw-border-neutral-700 tw-bg-background tw-text-foreground tw-px-3 tw-py-2 tw-text-base tw-appearance-none placeholder:tw-text-muted-foreground focus:tw-outline-none focus:tw-border-accent tw-shadow-none disabled:tw-cursor-not-allowed disabled:tw-opacity-50 lg:tw-text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
