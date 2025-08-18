import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, type, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    type={type ?? "auto"}
    className={cn("tw-relative tw-overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="tw-h-full tw-w-full tw-rounded-[inherit] tw-pr-3 tw-pb-3">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar orientation="vertical" />
    <ScrollBar orientation="horizontal" />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    forceMount
    orientation={orientation}
    className={cn(
      "vj-scrollbar tw-z-10 tw-flex tw-touch-none tw-select-none tw-transition-colors tw-bg-neutral-800/40 hover:tw-bg-neutral-800/60",
      orientation === "vertical" &&
        "tw-h-full tw-w-3 tw-border-l tw-border-l-transparent tw-p-[1px]",
      orientation === "horizontal" &&
        "tw-h-3 tw-flex-col tw-border-t tw-border-t-transparent tw-p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="vj-scroll-thumb tw-relative tw-flex-1 tw-rounded-full tw-bg-neutral-700 hover:tw-bg-neutral-600 tw-transition-colors tw-min-h-[20px] tw-min-w-[20px]" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
