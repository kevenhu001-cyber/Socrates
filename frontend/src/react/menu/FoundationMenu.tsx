import { Button as UiButton } from '../ui/Button';
import { useId, useLayoutEffect, useRef, type ComponentProps, type ComponentPropsWithRef, type ReactElement, type ReactNode, type RefObject } from 'react';
import { Menu } from '@base-ui/react/menu';
import { ENABLED_MENU_ITEM_SELECTOR, MENU_ANCHOR_GAP, MENU_EDGE_GUTTER, MENU_PHONE_BREAKPOINT, MENU_PHONE_SPILL_OFFSET } from './menuPrimitive';

export interface FoundationMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement<ComponentPropsWithRef<'button'>>;
  children: ReactNode;
  className: string;
  label?: string;
  above?: boolean;
  align?: 'start' | 'end';
  spill?: boolean;
  initialItem?: 'first' | 'last';
  contentKey?: string;
  focusTarget?: RefObject<HTMLElement | null>;
}

/** Socrates owns the surface and motion; Base UI owns menu interactions.
 * Keep the dependency behind this adapter as each product menu migrates. */
export function FoundationMenu({ open, onOpenChange, trigger, children, className, label, above = false, align = 'end', spill = false, initialItem = 'first', contentKey, focusTarget }: FoundationMenuProps) {
  const generatedId = useId();
  const initialItemRef = useRef(initialItem);
  const previousContent = useRef(contentKey);
  useLayoutEffect(() => {
    const changed = previousContent.current !== contentKey;
    previousContent.current = contentKey;
    if (changed && open) focusTarget?.current?.focus({ preventScroll: true });
  }, [contentKey, focusTarget, open]);
  const triggerId = trigger.props.id || generatedId;
  const phoneSpill = spill && window.innerWidth <= MENU_PHONE_BREAKPOINT;
  const host = document.getElementById('appShell');
  return <Menu.Root open={open} onOpenChange={onOpenChange} modal={false} triggerId={triggerId}>
    <Menu.Trigger id={triggerId} render={trigger} />
    {host && <Menu.Portal container={host}>
      <Menu.Positioner positionMethod="fixed" side={above ? 'top' : 'bottom'} align={phoneSpill ? 'start' : align}
        alignOffset={phoneSpill ? -MENU_PHONE_SPILL_OFFSET : 0}
        sideOffset={above ? MENU_EDGE_GUTTER : phoneSpill ? -MENU_ANCHOR_GAP : MENU_ANCHOR_GAP}
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
              const selected = event.currentTarget.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]:not([aria-disabled="true"]):not(:disabled)');
              const items = [...event.currentTarget.querySelectorAll<HTMLElement>(ENABLED_MENU_ITEM_SELECTOR)];
              const item = initialItemRef.current === 'last' ? items[items.length - 1] : selected || items[0];
              initialItemRef.current = 'first';
              item?.focus({ preventScroll: true });
            }
          }}
          onClick={(event) => event.stopPropagation()}
        >{children}</Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>}
  </Menu.Root>;
}

export function FoundationMenuItem({ onClick, ...props }: Omit<ComponentProps<typeof Menu.Item>, 'onClick'> & {
  onClick?: ComponentProps<'button'>['onClick'];
}) {
  // Base UI types Item events against its default div; this adapter always
  // renders a native button, including for callbacks that need currentTarget.
  return <Menu.Item {...props} onClick={onClick as ComponentProps<typeof Menu.Item>['onClick']}
    nativeButton render={<UiButton type="button" />} />;
}

export function FoundationMenuLink(props: ComponentProps<typeof Menu.LinkItem>) {
  return <Menu.LinkItem closeOnClick {...props} />;
}

export function FoundationMenuRadioGroup(props: ComponentProps<typeof Menu.RadioGroup>) {
  return <Menu.RadioGroup {...props} />;
}

export function FoundationMenuRadioItem(props: ComponentProps<typeof Menu.RadioItem>) {
  return <Menu.RadioItem closeOnClick {...props} nativeButton render={<UiButton type="button" />} />;
}
