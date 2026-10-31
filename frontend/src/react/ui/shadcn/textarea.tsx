import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ref, ...props }: React.ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      ref={ref}
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
