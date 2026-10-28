
import { reportSwallow } from '../util/reportSwallow.ts';

/* ui/share.js — lightweight share facade.
 *
 * The full share/read-only-session renderer pulls tool cards and
 * visualization helpers. Keep those bytes out of the application entry graph:
 * only the tiny chrome synchronizer stays eager, while every feature action
 * loads share.impl.mjs on first use. Existing import paths and window bridges
 * keep the same names, so callers do not need a migration wave just to gain
 * the loading boundary.
 */

let _shareImplPromise = null;
let _shareImpl = null;

function loadShareImpl() {
  if (_shareImpl) return Promise.resolve(_shareImpl);
  if (!_shareImplPromise) {
    _shareImplPromise = import('./share.impl.mjs')
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

function runShareAction(action) {
  void loadShareImpl().then(action).catch(function () { /* loadShareImpl logs */ });
}

/* This is part of session/auth chrome and runs frequently, so keep it fully
   synchronous and dependency-free instead of waking the heavy share runtime. */
function toggleShareBtn() {
  var btn = document.getElementById('shareBtn');
  if (!btn) return;
  var store = window.stateStore;
  var show = !!(window.CURRENT_USER && store
    && (store.read('currentSessionId') || store.read('_examInView')));
  btn.classList.toggle('hidden', !show);
  var findBtn = document.getElementById('findBtn');
  if (findBtn) findBtn.classList.toggle('hidden', !show);
  if (!show && typeof window.closeFindInSession === 'function') {
    try { window.closeFindInSession(); } catch (error) { reportSwallow(error, 'ui/share.js:47'); }
  }
}

function openShareModal(sessionId) {
  runShareAction(function (module) { module.openShareModal(sessionId); });
}

function closeShareModal() {
  if (_shareImpl) {
    _shareImpl.closeShareModal();
  } else if (_shareImplPromise) {
    void _shareImplPromise.then(function (module) { module.closeShareModal(); }).catch(() => undefined);
  }
}

function selectShareVis(vis) {
  runShareAction(function (module) { module.selectShareVis(vis); });
}

function renderShareModal() {
  if (_shareImpl) _shareImpl.renderShareModal();
}

function createShareLink() {
  runShareAction(function (module) { void module.createShareLink(); });
}

function copyShareLink() {
  runShareAction(function (module) { module.copyShareLink(); });
}

function revokeShareLink() {
  runShareAction(function (module) { void module.revokeShareLink(); });
}

/* If sharing was never opened there is no feature-local token to clear. This
   keeps new-chat/sign-out paths from loading the share runtime just to reset
   state that does not exist yet. */
function resetShareToken() {
  if (_shareImpl) {
    _shareImpl.resetShareToken();
  } else if (_shareImplPromise) {
    void _shareImplPromise.then(function (module) { module.resetShareToken(); }).catch(() => undefined);
  }
}

/* Public-share routing was already async/await. Preserve that contract so the
   route naturally waits for the feature chunk before rendering the read-only
   transcript. */
function loadSharedSession(token) {
  return loadShareImpl().then(function (module) { return module.loadSharedSession(token); });
}

function loadSharedExamSession(session) {
  return loadShareImpl().then(function (module) { return module.loadSharedExamSession(session); });
}

function renderSharedQuestionCard(idx, question) {
  runShareAction(function (module) { module.renderSharedQuestionCard(idx, question); });
}

/* Historical named exports are retained for compatibility. They were not used
   as live bindings by first-party callers; the authoritative runtime values
   live in share.impl.mjs once the feature is loaded. */
var _shareVisibility = 'public';
var _shareToken = null;
var _shareUrl = '';

export {
  loadShareImpl,
  toggleShareBtn,
  openShareModal, closeShareModal, selectShareVis, renderShareModal,
  createShareLink, copyShareLink, revokeShareLink, resetShareToken,
  loadSharedSession, loadSharedExamSession, renderSharedQuestionCard,
  _shareVisibility, _shareToken, _shareUrl,
};
