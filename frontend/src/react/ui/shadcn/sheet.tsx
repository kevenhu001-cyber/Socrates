import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

import { Button } from "./button"
import { XIcon } from "lucide-react"

/*
 * Sheet — the edge-docked variant of the local dialog.
 *
 * The official registry source is not installed verbatim: it would have
 * overwritten the adapted `dialog.tsx` (focus restoration, nested-overlay
 * inertness, product z rungs). This file therefore mirrors the same Base UI
 * root and adds only the placement classes. Geometry stays with the caller so
 * the phone drawer keeps `--ui-sidebar-mobile` and its 65vw clamp.
 */

function Sheet({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  surface = false,
  ...props
}: DialogPrimitive.Backdrop.Props & { surface?: boolean }) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={surface ? cn(className) : cn(
        "fixed inset-0 isolate z-(--ui-z-backdrop) bg-(--ui-backdrop) duration-100",
        className
      )}
      {...props}
    />
  )
}

const SIDE_PLACEMENT = {
  left: "inset-y-0 left-0 h-full data-closed:-translate-x-full",
  right: "inset-y-0 right-0 h-full data-closed:translate-x-full",
  top: "inset-x-0 top-0 w-full data-closed:-translate-y-full",
  bottom: "inset-x-0 bottom-0 w-full data-closed:translate-y-full",
} as const

function SheetContent({
  className,
  children,
  side = "left",
  showCloseButton = false,
  keepMounted = false,
  ...props
}: DialogPrimitive.Popup.Props & {
  side?: keyof typeof SIDE_PLACEMENT
  showCloseButton?: boolean
  keepMounted?: boolean
}) {
  const popup = (
    <DialogPrimitive.Popup
      data-slot="sheet-content"
      data-side={side}
      className={cn(
        "fixed z-(--ui-z-drawer) flex flex-col bg-popover text-popover-foreground shadow-md outline-none duration-100",
        SIDE_PLACEMENT[side],
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close
          data-slot="sheet-close"
          render={<Button variant="ghost" className="absolute top-2 right-2" size="icon-sm" />}
        >
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Popup>
  )
  return (
    <SheetPortal keepMounted={keepMounted}>
      <SheetOverlay />
      {popup}
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base leading-none font-medium", className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
}
