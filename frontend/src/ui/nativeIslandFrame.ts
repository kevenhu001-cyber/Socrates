import type { NativeIslandFrame } from '@socrates/contracts';

export const NATIVE_ISLAND_SANDBOX = {
  visualization: 'allow-scripts',
  artifact: 'allow-scripts allow-forms allow-modals allow-popups',
  creation: '',
} as const satisfies Record<NativeIslandFrame['kind'], string>;

export function nativeIslandFrameAttributes(frame: NativeIslandFrame) {
  return {
    title: frame.title,
    sandbox: NATIVE_ISLAND_SANDBOX[frame.kind],
    ...(frame.kind === 'artifact' ? { src: frame.url } : { srcDoc: frame.html }),
  };
}
