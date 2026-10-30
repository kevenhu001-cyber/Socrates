/* ui/profile.ts — Wave 2b of main-js-split plan.
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

import { webSearchOn, setWebSearchOn } from '../config/providers.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


/* React migration bridge — publishes current profile state so the React
   compatibility root can render the modal content via useSyncExternalStore. */
function userInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function joinedDate(createdAt: string|number|Date|null|undefined) {
  if (!createdAt) return "—";
  try { return new Date(createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }
  catch { return createdAt; }
}

function profileUserSnapshot(user: NonNullable<import("../types/runtimeWindow.ts").RuntimeWindow["CURRENT_USER"]>) {
  return {
    initials: userInitials(user.displayName || user.email || "?"),
    displayName: user.displayName || "",
    email: user.email || "",
    joinedAt: joinedDate(user.createdAt),
    verifiedAt: user.verifiedAt || null,
    userId: user.id || "—",
    tier: user.tier || "diophantus",
    subEnd: user.subscriptionEnd || null,
  };
}

function _publishProfileState() {
  try {
    const bridge = browserWindow.__socratesProfileBridge;
    if (!bridge || typeof bridge.publish !== "function") return;
    const cu = browserWindow.CURRENT_USER || {};
    const inst = loadCustomInstructions();
    bridge.publish({
      isOpen: !document.getElementById("profileOverlay")!.classList.contains("hidden"),
      user: profileUserSnapshot(cu),
      webSearchOn: !!webSearchOn,
      currentLang: (typeof browserWindow._currentLang === "string") ? browserWindow._currentLang : "en",
      instResponse: (inst && inst.response) || "",
      instAbout: (inst && inst.about) || "",
      instSaveState: null,
    });
  } catch (_) {
    reportSwallow(_, 'empty catch: ui/profile.ts:65', 'expected');
    /* swallow — bridge is best-effort */
  }
}

/* React owns the profile modal and sidebar user row unconditionally
   under the always-on runtime. The publish path is the only thing
   the React side reads; the legacy DOM mutations are dropped. */

/* React migration bridge — publishes current user state so the sidebar
   footer React component can render the avatar, name, and tier badge.
   Installed by frontend/src/react/sidebar-chrome/sidebarChromeStore.ts
   under `?react=1`; legacy mode never sees a subscriber. */
function sidebarUserSnapshot(user: import("../types/runtimeWindow.ts").RuntimeWindow["CURRENT_USER"]) {
  if (!user) return { initials: "?", displayName: "Guest", email: "", tier: "diophantus", tierLabel: "Free", isSignedIn: false };
  /* P_cowork-landing — the footer row is ~150px wide once the avatar and
     the three icon buttons take their share, so a full address ellipsised
     to "jiache…" identified nobody. Fall back to the address's local part;
     the complete address stays visible in the profile modal. */
  const localPart = String(user.email || "").split("@")[0];
  const name = user.displayName || localPart || "?";
  const tier = user.tier || 'diophantus';
  return {
    initials: userInitials(name),
    displayName: name === "?" ? "" : name,
    email: user.email || "",
    tier: tier,
    tierLabel: tier.charAt(0).toUpperCase() + tier.slice(1),
    isSignedIn: true,
  };
}

function syncDocumentTier(user: import("../types/runtimeWindow.ts").RuntimeWindow["CURRENT_USER"]) {
  try { document.documentElement.dataset.userTier = user?.tier || "diophantus"; }
  catch (_) {
    reportSwallow(_, 'empty catch: ui/profile.ts:97');
    /* swallow */
  }
}

function _publishSidebarChrome() {
  try {
    const cu = browserWindow.CURRENT_USER || null;
    /* Mirror the tier onto <html> so CSS can gate free-tier affordances
       (the mobile "升级" pill in the top bar) without a JS listener. */
    syncDocumentTier(cu);
    const bridge = browserWindow.__socratesSidebarChromeBridge;
    if (!bridge || typeof bridge.publish !== "function") return;
    bridge.publish({ user: sidebarUserSnapshot(cu) });
  } catch (_) {
    reportSwallow(_, 'empty catch: ui/profile.ts:109');
    /* swallow */
  }
}

/* (legacy sidebar-footer renderer is dead code — see the always-on
   React sidebar chrome above) */

/* ─── User footer + profile modal shell ─── */

function renderUserFooter() {
  const row = document.querySelector(".sidebar-footer .user-row");
  if (!row) return;
  _publishSidebarChrome();
}

function openProfile() {
  if (!browserWindow.CURRENT_USER) return;
  loadCustomInstructionsIntoUI();
  syncProfileWebSearchUI();
  syncProfileLangToggle();
  document.getElementById("profileOverlay")!.classList.remove("hidden");
  _publishProfileState();
}

function closeProfile() {
  document.getElementById("profileOverlay")!.classList.add("hidden");
  _publishProfileState();
}

/* ─── Rename user ─── */

function saveProfileName(newName: string) {
  const name = (newName || "").trim();
  if (!name || !browserWindow.CURRENT_USER) return;
  if (name === browserWindow.CURRENT_USER.displayName) return;
  browserWindow.apiFetch("/api/users/me", {
    method: "PATCH",
    body: { displayName: name },
  }).then(function () {
    browserWindow.CURRENT_USER!.displayName = name;
    renderUserFooter();
    const el = document.getElementById("profileName");
    if (el) (el as HTMLInputElement).value = name;
  }).catch(function () {
    /* revert */
    const el = document.getElementById("profileName");
    if (el) (el as HTMLInputElement).value = browserWindow.CURRENT_USER!.displayName || "";
  });
}

/* ─── Custom instructions persistence ─── */

let _customInstructionsSaveTimer: number|null|undefined = null;

interface CustomInstructions { response: string; about: string; savedAt: string }

function loadCustomInstructions(): CustomInstructions {
  try {
    const raw = localStorage.getItem("socrates-custom-instructions");
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const value = parsed as Record<string, unknown>;
        return {
          response: typeof value.response === 'string' ? value.response : '',
          about: typeof value.about === 'string' ? value.about : '',
          savedAt: typeof value.savedAt === 'string' ? value.savedAt : '',
        };
      }
    }
  } catch (error) { reportSwallow(error, 'ui/profile.ts:148', 'expected'); }
  return { response: '', about: '', savedAt: '' };
}

function saveCustomInstructions(value: CustomInstructions) {
  try { localStorage.setItem("socrates-custom-instructions", JSON.stringify(value)); } catch (error) { reportSwallow(error, 'ui/profile.ts:153', 'expected'); }
}

function loadCustomInstructionsIntoUI() {
  const data = loadCustomInstructions();
  if (!data.response && typeof browserWindow.CURRENT_USER?.customInstructions === 'string') {
    data.response = browserWindow.CURRENT_USER.customInstructions;
  }
  updateInstSaveState(data.savedAt);
}

function onCustomInstructionsChange() {
  const respEl = document.getElementById("profileInstResponse");
  const aboutEl = document.getElementById("profileInstAbout");
  if (!respEl || !aboutEl) return;
  updateInstSaveState(null);
  clearTimeout((_customInstructionsSaveTimer ?? undefined));
  _customInstructionsSaveTimer = setTimeout(function () {
    const value = {
      response: (respEl as HTMLInputElement).value,
      about: (aboutEl as HTMLInputElement).value,
      savedAt: new Date().toISOString(),
    };
    saveCustomInstructions(value);
    updateInstSaveState(value.savedAt);
    browserWindow.apiFetch("/api/users/me", {
      method: "PATCH",
      body: { customInstructions: buildCustomInstructionsString(value) },
    }).catch(function () {
      console.log("[custom-inst] server sync failed");
    });
  }, 600);
}

function buildCustomInstructionsString(value: Pick<CustomInstructions, 'response' | 'about'>) {
  const parts = [];
  if (value && value.response) parts.push("[How to respond]\n" + value.response);
  if (value && value.about) parts.push("[About the user]\n" + value.about);
  return parts.join("\n\n");
}

function updateInstSaveState(savedAt: string|null) {
  _publishProfileState();
  /* savedAt is preserved in the bridge publish below via instSaveState;
     the legacy text/class writes (window.t("common.saving") and the
     "hh:mm" label) are no longer needed because React's ProfileModal
     component reads savedAt from the snapshot. */
  void savedAt;
}

function getCustomInstructionsString() {
  const v = loadCustomInstructions();
  return buildCustomInstructionsString(v);
}

/* ─── Web search toggle ─── */

function toggleProfileWebSearch() {
  setWebSearchOn(!webSearchOn);
  syncProfileWebSearchUI();
}

function syncProfileWebSearchUI() {
  _publishProfileState();
}

function syncProfileLangToggle() {
  _publishProfileState();
}

/* ─── Cross-session memory loader ─── */

function loadUserMemories() {
  browserWindow._userMemories = [];
  if (!browserWindow.CURRENT_USER) return Promise.resolve();
  try {
    return browserWindow.apiFetch<unknown>("/api/memory", { _authEndpoint: true }).then(function (value) {
      if (Array.isArray(value)) {
        browserWindow._userMemories = value.flatMap(function (memory): string[] {
          if (!memory || typeof memory !== 'object' || Array.isArray(memory)) return [];
          const record = memory as Record<string, unknown>;
          return record.enabled !== false && typeof record.text === 'string' ? [record.text] : [];
        });
      }
    }).catch(function () {
      console.log("[memories] load failed");
      browserWindow._userMemories = [];
    });
  } catch {
    console.log("[memories] load threw");
    browserWindow._userMemories = [];
    return Promise.resolve();
  }
}

export {
  renderUserFooter, openProfile, closeProfile, saveProfileName,
  loadCustomInstructions, saveCustomInstructions, loadCustomInstructionsIntoUI,
  onCustomInstructionsChange, buildCustomInstructionsString, updateInstSaveState,
  getCustomInstructionsString, toggleProfileWebSearch, syncProfileWebSearchUI,
  loadUserMemories,
  _publishProfileState as publishProfileSnapshot,
};
