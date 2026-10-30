type FeatureRuntime = typeof import("./readAloud.impl.ts");

/* ui/readAloud.ts — lazy compatibility facade.
 *
 * Read-aloud is a message-toolbar action, not part of first paint. Keep the
 * long-standing import path and synchronous command shape while loading the
 * network/audio implementation only after the user actually asks for speech.
 */
let _implPromise: Promise<FeatureRuntime> | null = null;
let _impl: FeatureRuntime | null = null;

function loadReadAloudImpl() {
  if (!_implPromise) {
    _implPromise = import('./readAloud.impl.ts').then(function (module) {
      _impl = module;
      return module;
    });
    _implPromise.catch(function (error) {
      _implPromise = null;
      console.error('[read-aloud] failed to load', error);
    });
  }
  return _implPromise;
}

export function stopSpeaking() {
  if (_impl) {
    _impl.stopSpeaking();
    return;
  }
  /* No implementation means no voice could have started. If a first toggle
     is still loading, let it settle and immediately cancel before playback. */
  if (_implPromise) {
    void _implPromise.then(function (module: FeatureRuntime) { module.stopSpeaking(); }).catch(() => undefined);
  }
}

export function toggleReadAloud(btn: any, text: any, messageId: any) {
  if (_impl) {
    _impl.toggleReadAloud(btn, text, messageId);
    return;
  }
  void loadReadAloudImpl()
    .then(function (module: FeatureRuntime) { module.toggleReadAloud(btn, text, messageId); })
    .catch(function () { /* loader logs */ });
}
