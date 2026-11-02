/**
 * Web-host glue for shared React Native parts.
 *
 * `webClass` attaches the shell's structural class hooks (collapsed rail,
 * phone drawer, per-destination order) to an RN element through
 * react-native-web's compiled-style object (`$$css`), which RNW turns into
 * `className` untouched. The shared package never names a web class itself.
 *
 * `useDomTitle` sets the native tooltip: RNW does not forward `title`.
 */
import { useCallback, useLayoutEffect, useRef } from 'react';

type CompiledStyle = never;

export function webClass(...names: Array<string | false | null | undefined>): CompiledStyle {
  return { $$css: true, socratesHost: names.filter(Boolean).join(' ') } as unknown as CompiledStyle;
}

/** Keeps the native tooltip of the element with `id` in sync (RNW drops `title`). */
export function useDomTitle(id: string, title: string): void {
  useLayoutEffect(() => {
    document.getElementById(id)?.setAttribute('title', title);
  });
}

export interface DomRowHostOptions {
  /** The row's ARIA role; `undefined` removes it (the row while renaming). */
  role?: string;
  draggable?: boolean;
  onDragStart?: (event: DragEvent) => void;
  onDragEnd?: (event: DragEvent) => void;
}

/**
 * RN-10 — the parts of a list row react-native-web cannot express, wired on
 * the row node itself and kept in sync with React state:
 *   - native drag and drop (RNW forwards neither `draggable` nor drag events);
 *   - a `button` role without a button element (RNW renders
 *     `role="button"` as a real button, and the row nests its own ⋯ button).
 * Returns the ref callback to hand to the shared row (`rowRef`).
 */
export function useDomRowHost(options: DomRowHostOptions): (node: unknown) => void {
  const node = useRef<HTMLElement | null>(null);
  const latest = useRef(options);
  latest.current = options;
  useLayoutEffect(() => {
    const element = node.current;
    if (!element) return;
    if (options.role) element.setAttribute('role', options.role);
    else element.removeAttribute('role');
    element.draggable = Boolean(options.draggable);
  }, [options.role, options.draggable]);
  useLayoutEffect(() => {
    const element = node.current;
    if (!element) return undefined;
    const start = (event: DragEvent) => latest.current.onDragStart?.(event);
    const end = (event: DragEvent) => latest.current.onDragEnd?.(event);
    element.addEventListener('dragstart', start);
    element.addEventListener('dragend', end);
    return () => {
      element.removeEventListener('dragstart', start);
      element.removeEventListener('dragend', end);
    };
  }, []);
  return useCallback((value: unknown) => { node.current = (value as HTMLElement | null) ?? null; }, []);
}
