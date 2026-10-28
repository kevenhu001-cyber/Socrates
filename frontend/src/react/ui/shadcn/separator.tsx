import { cloneElement, type ComponentProps, type ReactElement } from "react"
import { cn } from "cn"

function Separator({
  className,
  orientation = "horizontal",
  decorative = false,
  render,
  ...props
}: ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical"
  decorative?: boolean
  render?: ReactElement<ComponentProps<"div">>
}) {
  const attributes = {
      "data-slot": "separator",
      "data-horizontal": orientation === "horizontal" ? "" : undefined,
      "data-vertical": orientation === "vertical" ? "" : undefined,
      role: decorative ? "presentation" : "separator",
      "aria-orientation": orientation,
      className: cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        render?.props.className,
        className
      ),
      ...props,
  }
  return render ? cloneElement(render, attributes) : <div {...attributes} />
}

export { Separator }
