import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "tw-inline-flex tw-items-center tw-justify-center tw-whitespace-nowrap tw-rounded tw-px-2 tw-py-1 tw-text-sm tw-transition-colors focus-visible:tw-outline-none disabled:tw-pointer-events-none disabled:tw-opacity-50 [&_svg]:tw-pointer-events-none [&_svg]:tw-size-4 [&_svg]:tw-shrink-0",
  {
    variants: {
      variant: {
        default: "tw-bg-neutral-700 tw-text-white hover:tw-bg-neutral-600",
        secondary: "tw-bg-neutral-800 tw-text-neutral-200 hover:tw-bg-neutral-700",
        destructive: "tw-bg-red-600 tw-text-white hover:tw-bg-red-700",
        outline: "tw-border tw-border-neutral-700 tw-bg-transparent tw-text-neutral-200 hover:tw-bg-neutral-800",
        ghost: "tw-bg-transparent tw-text-neutral-200 hover:tw-bg-neutral-800",
        link: "tw-text-neutral-200 tw-underline-offset-4 hover:tw-underline",
      },
      size: {
        default: "tw-px-2 tw-py-1",
        sm: "tw-px-1 tw-py-0.5 tw-text-xs",
        lg: "tw-px-3 tw-py-1.5",
        icon: "tw-w-6 tw-h-6 tw-p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
