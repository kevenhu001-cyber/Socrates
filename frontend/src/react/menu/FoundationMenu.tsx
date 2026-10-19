import { type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
import { MENU_ANCHOR_GAP, MENU_EDGE_GUTTER } from './menuPrimitive';

/** Socrates owns the surface and motion; Base UI owns menu interactions.
 * Keep the dependency behind this adapter as each product menu migrates. */
export function FoundationMenu({ open, onOpenChange, trigger, children, className, label, above = false }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  children: ReactNode;
  className: string;
  label?: string;
  above?: boolean;
}) {
  const host = document.getElementById('appShell');
  return <Menu.Root open={open} onOpenChange={onOpenChange} modal={false}>
    <Menu.Trigger render={trigger} />
    {host && <Menu.Portal container={host}>
      <Menu.Positioner positionMethod="fixed" side={above ? 'top' : 'bottom'} align="end"
        sideOffset={above ? MENU_EDGE_GUTTER : MENU_ANCHOR_GAP}
        collisionAvoidance={{ side: 'flip', align: 'shift' }}
        collisionPadding={MENU_EDGE_GUTTER} style={{ zIndex: 'var(--ui-z-popover)' }}>
        <Menu.Popup
          className={`anchored-menu ${className}`.trim()}
          aria-label={label}
          style={{ maxHeight: 'var(--available-height)', overflowY: 'auto' }}
          render={(props, state) => <div {...props}
            data-anchored-menu=""
            data-state={state.open ? 'open' : 'closing'}
            data-placement={state.side === 'top' ? 'above' : 'below'}
            data-align={state.align}
          />}
          onFocus={(event) => {
            // Preserve Socrates' first-item focus on pointer opening. Keyboard
            // opening (including ArrowUp) is handled by Base UI list navigation.
            if (event.target === event.currentTarget) {
              event.currentTarget.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
            }
          }}
          onClick={(event) => event.stopPropagation()}
        >{children}</Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>}
  </Menu.Root>;
}

export function FoundationMenuItem(props: ComponentProps<typeof Menu.Item>) {
  return <Menu.Item {...props} nativeButton render={<button type="button" />} />;
}

export function FoundationMenuLink(props: ComponentProps<typeof Menu.LinkItem>) {
  return <Menu.LinkItem closeOnClick {...props} />;
}
