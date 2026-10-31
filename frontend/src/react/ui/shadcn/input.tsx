import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ref, ...props }: React.ComponentPropsWithRef<"input">) {
  return (
    <input
      type={type}
      ref={ref}
      data-slot="input"
      className={cn(
        "h-(--ui-control-desktop) w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
