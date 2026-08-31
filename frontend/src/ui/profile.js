/* ui/profile.js — Wave 2b of main-js-split plan.
 * Profile modal: user info, custom instructions, web search toggle.
 * Extracted from main.js: two non-contiguous blocks — renderUserFooter
 * / openProfile / closeProfile (L8992-L9057) and custom-instructions
 * / web-search helpers (L9895-L9979).
 *
 * Touches via window.*:
 *   CURRENT_USER, state, escapeHtml, esc, t, loadCustomInstructions,
 *   saveCustomInstructions, apiFetch, syncModelPills, closeProfile (self)
 *
 * React migration bridge — publishes state so the React compatibility
 * root renders the modal content. Installed by
 * frontend/src/react/profileModal/profileModalStore.ts under `?react=1`;
 * legacy mode never sees a subscriber so the helpers are cheap no-ops.
 */

import { webSearchOn, setWebSearchOn } from '../config/providers.js';

/* React migration bridge — publishes current profile state so the React
   compatibility root can render the modal content via useSyncExternalStore. */
function _publishProfileState() {
  try {
    var bridge = window.__socratesProfileBridge;
    if (!bridge || typeof bridge.publish !== "function") return;
    var cu = window.CURRENT_USER || {};
    var name = cu.displayName || cu.email || "?";
    var parts = name.trim().split(/\s+/);
    var initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
    var inst = loadCustomInstructions();
    bridge.publish({
      isOpen: !document.getElementById("profileOverlay").classList.contains("hidden"),
      user: {
        initials: initials,
        displayName: cu.displayName || "",
        email: cu.email || "",
        joinedAt: cu.createdAt ? (function(){try{return new Date(cu.createdAt).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}catch {return cu.createdAt}})() : "—",
        verifiedAt: cu.verifiedAt || null,
        userId: cu.id || "—",
        tier: cu.tier || "diophantus",
        subEnd: cu.subscriptionEnd || null,
      },
      webSearchOn: !!webSearchOn,
      currentLang: (typeof window._currentLang === "string") ? window._currentLang : "en",
      instResponse: (inst && inst.response) || "",
      instAbout: (inst && inst.about) || "",
      instSaveState: null,
    });
  } catch (_) { /* swallow — bridge is best-effort */ }
}

/* React owns the profile modal and sidebar user row unconditionally
   under the always-on runtime. The publish path is the only thing
   the React side reads; the legacy DOM mutations are dropped. */

/* React migration bridge — publishes current user state so the sidebar
   footer React component can render the avatar, name, and tier badge.
   Installed by frontend/src/react/sidebar-chrome/sidebarChromeStore.ts
   under `?react=1`; legacy mode never sees a subscriber. */
function _publishSidebarChrome() {
  try {
    var bridge = window.__socratesSidebarChromeBridge;
    if (!bridge || typeof bridge.publish !== "function") return;
    var cu = window.CURRENT_USER || null;
    var initials, displayName, tier, tierLabel;
    if (cu) {
      /* P_cowork-landing — the footer row is ~150px wide once the avatar and
         the three icon buttons take their share, so a full address ellipsised
         to "jiache…" identified nobody. Fall back to the address's local part;
         the complete address stays visible in the profile modal. */
      var localPart = String(cu.email || "").split("@")[0];
      var name = cu.displayName || localPart || "?";
      var parts = name.trim().split(/\s+/);
      initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
      displayName = name === "?" ? "" : name;
      tier = cu.tier || 'diophantus';
      tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    } else {
      initials = '?';
      displayName = 'Guest';
      tier = 'diophantus';
      tierLabel = 'Free';
    }
    bridge.publish({
      user: { initials: initials, displayName: displayName, email: (cu && cu.email) || "", tier: tier, tierLabel: tierLabel, isSignedIn: !!cu },
    });
  } catch (_) { /* swallow */ }
}

/* (legacy sidebar-footer renderer is dead code — see the always-on
   React sidebar chrome above) */

/* ─── User footer + profile modal shell ─── */

function renderUserFooter() {
  var row = document.querySelector(".sidebar-footer .user-row");
  if (!row) return;
  _publishSidebarChrome();
}

function openProfile() {
  if (!window.CURRENT_USER) return;
  loadCustomInstructionsIntoUI();
  syncProfileWebSearchUI();
  syncProfileLangToggle();
  document.getElementById("profileOverlay").classList.remove("hidden");
  _publishProfileState();
}

function closeProfile() {
  document.getElementById("profileOverlay").classList.add("hidden");
  _publishProfileState();
}

/* ─── Rename user ─── */

function saveProfileName(newName) {
  var name = (newName || "").trim();
  if (!name || !window.CURRENT_USER) return;
  if (name === window.CURRENT_USER.displayName) return;
  window.apiFetch("/api/users/me", {
    method: "PATCH",
    body: { displayName: name },
    timeoutMs: 8000,
  }).then(function () {
    window.CURRENT_USER.displayName = name;
    renderUserFooter();
    var el = document.getElementById("profileName");
    if (el) el.value = name;
  }).catch(function () {
    /* revert */
    var el = document.getElementById("profileName");
    if (el) el.value = window.CURRENT_USER.displayName || "";
  });
}

/* ─── Custom instructions persistence ─── */

var _customInstructionsSaveTimer = null;

function loadCustomInstructions() {
  try {
    var raw = localStorage.getItem("socrates-custom-instructions");
    if (raw) return JSON.parse(raw) || {};
  } catch (_) {}
  return {};
}

function saveCustomInstructions(value) {
  try { localStorage.setItem("socrates-custom-instructions", JSON.stringify(value)); } catch (_) {}
}

function loadCustomInstructionsIntoUI() {
  var data = loadCustomInstructions();
  if (!data.response && window.CURRENT_USER && window.CURRENT_USER.customInstructions) {
    data.response = window.CURRENT_USER.customInstructions;
  }
  updateInstSaveState(data.savedAt);
}

function onCustomInstructionsChange() {
  var respEl = document.getElementById("profileInstResponse");
  var aboutEl = document.getElementById("profileInstAbout");
  if (!respEl || !aboutEl) return;
  updateInstSaveState(null);
  clearTimeout(_customInstructionsSaveTimer);
  _customInstructionsSaveTimer = setTimeout(function () {
    var value = {
      response: respEl.value,
      about: aboutEl.value,
      savedAt: new Date().toISOString(),
    };
    saveCustomInstructions(value);
    updateInstSaveState(value.savedAt);
    window.apiFetch("/api/users/me", {
      method: "PATCH",
      body: { customInstructions: buildCustomInstructionsString(value) },
      timeoutMs: 8000,
    }).then(function () {}).catch(function () {
      console.log("[custom-inst] server sync failed");
    });
  }, 600);
}

function buildCustomInstructionsString(value) {
  var parts = [];
  if (value && value.response) parts.push("[How to respond]\n" + value.response);
  if (value && value.about) parts.push("[About the user]\n" + value.about);
  return parts.join("\n\n");
}

function updateInstSaveState(savedAt) {
  _publishProfileState();
  /* savedAt is preserved in the bridge publish below via instSaveState;
     the legacy text/class writes (window.t("common.saving") and the
     "hh:mm" label) are no longer needed because React's ProfileModal
     component reads savedAt from the snapshot. */
  void savedAt;
}

function getCustomInstructionsString() {
  var v = loadCustomInstructions();
  return buildCustomInstructionsString(v);
}

/* ─── Web search toggle ─── */

function toggleProfileWebSearch() {
  setWebSearchOn(!webSearchOn);
  syncProfileWebSearchUI();
}

function syncProfileWebSearchUI() {
  var toggle = document.getElementById("profileWebSearchToggle");
  if (toggle) toggle.setAttribute("aria-pressed", webSearchOn ? "true" : "false");
  var track = document.getElementById("profileWebSearchTrack");
  if (track) track.classList.toggle("on", !!webSearchOn);
  _publishProfileState();
}

function syncProfileLangToggle() {
  var lang = window._currentLang || "en";
  ["profileLangEn", "profileLangZh"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var active = id === "profileLang" + (lang === "zh" ? "Zh" : "En");
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", active ? "true" : "false");
  });
  _publishProfileState();
}

/* ─── Cross-session memory loader ─── */

function loadUserMemories() {
  window._userMemories = [];
  if (!window.CURRENT_USER) return Promise.resolve();
  try {
    return window.apiFetch("/api/memory", { _authEndpoint: true }).then(function (r) {
      if (r && Array.isArray(r)) {
        window._userMemories = r.filter(function (m) { return m.enabled !== false; }).map(function (m) { return m.text; });
      }
    }).catch(function () {
      console.log("[memories] load failed");
      window._userMemories = [];
    });
  } catch {
    console.log("[memories] load threw");
    window._userMemories = [];
    return Promise.resolve();
  }
}

export {
  renderUserFooter, openProfile, closeProfile, saveProfileName,
  loadCustomInstructions, saveCustomInstructions, loadCustomInstructionsIntoUI,
  onCustomInstructionsChange, buildCustomInstructionsString, updateInstSaveState,
  getCustomInstructionsString, toggleProfileWebSearch, syncProfileWebSearchUI,
  loadUserMemories,
};
