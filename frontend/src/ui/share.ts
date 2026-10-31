type FeatureRuntime = typeof import("./share.impl.ts");


import { reportSwallow } from '../util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";
import { closeFindInSession } from '../react/find-in-session/findInSession.actions.ts';


/* ui/share.ts — lightweight share facade.
 *
 * The full share/read-only-session renderer pulls tool cards and
 * visualization helpers. Keep those bytes out of the application entry graph:
 * only the tiny chrome synchronizer stays eager, while every feature action
 * loads share.impl.ts on first use. Existing action exports keep their names,
 * so callers do not need to change to use the loading boundary.
 */

let _shareImplPromise: Promise<FeatureRuntime> | null = null;
let _shareImpl: FeatureRuntime | null = null;

function loadShareImpl() {
  if (_shareImpl) return Promise.resolve(_shareImpl);
  if (!_shareImplPromise) {
    _shareImplPromise = import('./share.impl.ts')
      .then(function (module) {
        _shareImpl = module;
        return module;
      })
      .catch(function (error) {
        _shareImplPromise = null;
        console.error('[share] failed to load feature runtime', error);
        throw error;
      });
  }
  return _shareImplPromise;
}

function runShareAction(action: { (module: FeatureRuntime): void; (module: FeatureRuntime): void; (module: FeatureRuntime): void; (module: FeatureRuntime): void; (module: FeatureRuntime): void; (module: FeatureRuntime): void; }) {
  void loadShareImpl().then(action).catch(function () { /* loadShareImpl logs */ });
}

/* This is part of session/auth chrome and runs frequently, so keep it fully
   synchronous and dependency-free instead of waking the heavy share runtime. */
function toggleShareBtn() {
  const btn = document.getElementById('shareBtn');
  if (!btn) return;
  const store = browserWindow.stateStore;
  const show = !!(browserWindow.CURRENT_USER && store
    && (store.read('currentSessionId') || store.read('_examInView')));
  btn.classList.toggle('hidden', !show);
  const findBtn = document.getElementById('findBtn');
  if (findBtn) findBtn.classList.toggle('hidden', !show);
  if (!show) {
    try { closeFindInSession(); } catch (error) { reportSwallow(error, 'ui/share.ts:47'); }
  }
}

function openShareModal(sessionId?: string) {
  runShareAction(function (module: FeatureRuntime) { module.openShareModal(sessionId); });
}

function closeShareModal() {
  if (_shareImpl) {
    _shareImpl.closeShareModal();
  } else if (_shareImplPromise) {
    void _shareImplPromise.then(function (module: FeatureRuntime) { module.closeShareModal(); }).catch(() => undefined);
  }
}

function selectShareVis(vis: 'public' | 'private') {
  runShareAction(function (module: FeatureRuntime) { module.selectShareVis(vis); });
}

function renderShareModal() {
  if (_shareImpl) _shareImpl.renderShareModal();
}

function createShareLink() {
  runShareAction(function (module: FeatureRuntime) { void module.createShareLink(); });
}

function copyShareLink() {
  runShareAction(function (module: FeatureRuntime) { module.copyShareLink(); });
}

function revokeShareLink() {
  runShareAction(function (module: FeatureRuntime) { void module.revokeShareLink(); });
}

/* If sharing was never opened there is no feature-local token to clear. This
   keeps new-chat/sign-out paths from loading the share runtime just to reset
   state that does not exist yet. */
function resetShareToken() {
  if (_shareImpl) {
    _shareImpl.resetShareToken();
  } else if (_shareImplPromise) {
    void _shareImplPromise.then(function (module: FeatureRuntime) { module.resetShareToken(); }).catch(() => undefined);
  }
}

/* Public-share routing was already async/await. Preserve that contract so the
   route naturally waits for the feature chunk before rendering the read-only
   transcript. */
function loadSharedSession(token: string) {
  return loadShareImpl().then(function (module: FeatureRuntime) { return module.loadSharedSession(token); });
}

function loadSharedExamSession(session: Parameters<FeatureRuntime['loadSharedExamSession']>[0]) {
  return loadShareImpl().then(function (module: FeatureRuntime) { return module.loadSharedExamSession(session); });
}

/* Historical named exports are retained for compatibility. They were not used
   as live bindings by first-party callers; the authoritative runtime values
   live in share.impl.mjs once the feature is loaded. */
const _shareVisibility = 'public';
const _shareToken = null;
const _shareUrl = '';

export {
  loadShareImpl,
  toggleShareBtn,
  openShareModal, closeShareModal, selectShareVis, renderShareModal,
  createShareLink, copyShareLink, revokeShareLink, resetShareToken,
  loadSharedSession, loadSharedExamSession,
  _shareVisibility, _shareToken, _shareUrl,
};
