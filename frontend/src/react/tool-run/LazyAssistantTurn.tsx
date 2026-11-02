/**
 * RN-13 — the assistant turn renderer (tool rows, activity strip, evidence,
 * visualization states, shared RN turn cards) is only needed once a
 * conversation has an assistant answer. It used to sit in the entry closure
 * through the message list and the legacy turn mounter. This boundary keeps
 * it in its own chunk; `preloadAssistantTurn()` warms it after the app shell
 * is revealed so a first answer normally finds it already loaded.
 */
import { lazy, Suspense } from 'react';
import type { AssistantTurnProps } from './AssistantTurn';

let turnModule: Promise<typeof import('./AssistantTurn')> | null = null;

export function preloadAssistantTurn(): Promise<typeof import('./AssistantTurn')> {
  turnModule ??= import('./AssistantTurn').catch((error: unknown) => {
    turnModule = null;
    throw error;
  });
  return turnModule;
}

const AssistantTurnImpl = lazy(() => preloadAssistantTurn().then(({ AssistantTurn }) => ({ default: AssistantTurn })));

export function LazyAssistantTurn(props: AssistantTurnProps) {
  /* No stand-in markup: the stored HTML and the turn renderer use different
     prose wrappers, so painting one and swapping to the other would restyle
     the answer mid-load. The boundary stays empty for the one fetch. */
  return (
    <Suspense fallback={null}>
      <AssistantTurnImpl {...props} />
    </Suspense>
  );
}
