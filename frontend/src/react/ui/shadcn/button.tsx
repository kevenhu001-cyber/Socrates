import type { ComponentProps } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-(--ui-radius-control) border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all select-none focus-visible:border-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        surface: "",
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        surface: "",
        touch: "h-(--ui-control-touch) gap-2 px-3",
        default:
          "h-(--ui-control-desktop) gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-(--ui-radius-control) px-2 text-xs in-data-[slot=button-group]:rounded-(--ui-radius-control) has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-(--ui-control-sm) gap-1 rounded-(--ui-radius-control) px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-(--ui-radius-control) has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-(--ui-control-md) gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-(--ui-radius-control) in-data-[slot=button-group]:rounded-(--ui-radius-control) [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-(--ui-control-sm) rounded-(--ui-radius-control) in-data-[slot=button-group]:rounded-(--ui-radius-control)",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      type={type}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={variant === "surface" ? cn(className) : cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
