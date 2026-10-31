import type { ChatRuntimeEvent } from '../react/types/domain.ts';
import { chatRuntimeStore } from './chatRuntimeStore.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

const CHAT_RUNTIME_PUBLISH_EVENT = 'socrates:chat-runtime-publish';

/* Legacy chat modules publish directly into the module-owned store. The DOM
   event remains as an observation hook for browser integrations; React
   subscribers use the typed in-process store. */
export function publishReactChatRuntime(event: ChatRuntimeEvent) {
  try {
    if (event && typeof event === 'object') chatRuntimeStore.publish(event);
  } catch (error) {
    reportSwallow(error, 'ui/reactBridge.publishRuntimeEvent');
    /* A store subscriber must not break the legacy producer. */
  }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new window.CustomEvent('socrates:chat-runtime-changed', {
        detail: event || {},
      }));
    }
  } catch (error) {
    reportSwallow(error, 'ui/reactBridge.dispatchRuntimeEvent', 'expected');
    /* No-op when CustomEvent is unavailable. */
  }
}

/* The event entry point is useful to browser integrations and production
   bundles where module source paths are not available. App code should prefer
   the typed publisher above; both paths converge on the same store. */
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener(CHAT_RUNTIME_PUBLISH_EVENT, (event) => {
    const runtimeEvent = (event as CustomEvent<ChatRuntimeEvent>).detail;
    publishReactChatRuntime(runtimeEvent);
  });
}
