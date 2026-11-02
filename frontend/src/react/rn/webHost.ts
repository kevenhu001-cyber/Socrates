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
import { useLayoutEffect } from 'react';

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
