import { cloneElement, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { reportSwallow } from '../../util/reportSwallow';
import type { FoundationMenuProps } from './FoundationMenu';

type MenuRuntime = typeof import('./FoundationMenu');
let runtimePromise: Promise<MenuRuntime> | null = null;

function loadMenuRuntime() {
  return runtimePromise ??= import('./FoundationMenu').catch((error) => {
    runtimePromise = null;
    throw error;
  });
}

function preloadMenuRuntime() {
  void loadMenuRuntime().catch((error) => reportSwallow(error, 'menu:preload'));
}

/** Keep a native trigger in the eager shell. A preload never replaces a focused
 * button; only an explicit open mounts the menu runtime and moves focus. */
export function DeferredMenu({ children, trigger, open, onOpenChange, ...props }: Omit<FoundationMenuProps, 'children' | 'initialItem'> & {
  children: (runtime: MenuRuntime) => ReactNode;
}) {
  const generatedId = useId();
  const triggerId = trigger.props.id || generatedId;
  const anchor = useRef<HTMLButtonElement>(null);
  const [runtime, setRuntime] = useState<MenuRuntime | null>(null);
  const [initialItem, setInitialItem] = useState<'first' | 'last'>('first');

  useEffect(() => {
    if (!open || runtime) return;
    let cancelled = false;
    void loadMenuRuntime().then((loaded) => {
      if (!cancelled) setRuntime(loaded);
    }).catch((error) => {
      if (cancelled) return;
      reportSwallow(error, 'menu:open');
      onOpenChange(false);
    });

    // Dismiss pending opens too: a delayed chunk must not reopen the menu after
    // Escape, Tab or a click that has already moved the user somewhere else.
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target)) onOpenChange(false);
    };
    const dismissKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') onOpenChange(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', dismissKey);
    return () => {
      cancelled = true;
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', dismissKey);
    };
  }, [open, runtime, onOpenChange]);

  if (runtime) {
    return <runtime.FoundationMenu {...props} open={open} onOpenChange={onOpenChange}
      initialItem={initialItem} trigger={cloneElement(trigger, { id: triggerId })}>
      {children(runtime)}
    </runtime.FoundationMenu>;
  }

  return cloneElement(trigger, {
    id: triggerId,
    ref: anchor,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-busy': open || undefined,
    onPointerEnter: (event) => {
      trigger.props.onPointerEnter?.(event);
      preloadMenuRuntime();
    },
    onFocus: (event) => {
      trigger.props.onFocus?.(event);
      preloadMenuRuntime();
    },
    onClick: (event) => {
      trigger.props.onClick?.(event);
      if (event.defaultPrevented) return;
      setInitialItem('first');
      onOpenChange(!open);
    },
    onKeyDown: (event) => {
      trigger.props.onKeyDown?.(event);
      if (event.defaultPrevented || !['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      setInitialItem(event.key === 'ArrowUp' ? 'last' : 'first');
      onOpenChange(true);
    },
  });
}
