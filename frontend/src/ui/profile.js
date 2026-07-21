/* ui/profile.js — Wave 2b of main-js-split plan.
 * Profile modal: user info, custom instructions, web search toggle.
 * Extracted from main.js: two non-contiguous blocks — renderUserFooter
 * / openProfile / closeProfile (L8992-L9057) and custom-instructions
 * / web-search helpers (L9895-L9979).
 *
 * Touches via window.*:
 *   CURRENT_USER, state, escapeHtml, esc, t, loadCustomInstructions,
 *   saveCustomInstructions, apiFetch, syncModelPills, closeProfile (self)
 */

import { webSearchOn, setWebSearchOn } from '../config/providers.js';

/* ─── User footer + profile modal shell ─── */

function renderUserFooter() {
  var row = document.querySelector(".sidebar-footer .user-row");
  if (!row) return;
  if (!window.CURRENT_USER) {
    row.innerHTML = '<div class="user-avatar">?</div><div><div class="user-name">Guest</div><div class="user-plan">Not signed in</div></div>';
    return;
  }
  var name = window.CURRENT_USER.displayName || window.CURRENT_USER.email || "?";
  var parts = name.trim().split(/\s+/);
  var initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
  var tier = window.CURRENT_USER.tier || 'diophantus';
  var safeTier = window.escapeHtml(tier);
  var tierLabel = window.escapeHtml(tier.charAt(0).toUpperCase() + tier.slice(1));
  var tierBadge = '<span class="tier-badge ' + safeTier + '">' + tierLabel + '</span>';
  var safeName = window.escapeHtml(window.CURRENT_USER.displayName || window.CURRENT_USER.email || "");
  row.innerHTML = '<div class="user-avatar">' + window.escapeHtml(initials) + '</div><div style="flex:1;min-width:0" onclick="event.stopPropagation();openProfile()"><div class="user-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer">' + safeName + '</div><div class="user-plan">' + tierBadge + '</div></div>';
  row.querySelector(".user-avatar").onclick = function (e) { e.stopPropagation(); openProfile(); };
}

function openProfile() {
  if (!window.CURRENT_USER) return;
  loadCustomInstructionsIntoUI();
  var name = window.CURRENT_USER.displayName || window.CURRENT_USER.email || "?";
  var parts = name.trim().split(/\s+/);
  var initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
  document.getElementById("profileAvatar").textContent = initials;
  var nameInput = document.getElementById("profileName");
  nameInput.value = window.CURRENT_USER.displayName || "";
  document.getElementById("profileEmail").textContent = window.CURRENT_USER.email || "";
  var joinedEl = document.getElementById("profileJoined");
  if (window.CURRENT_USER.createdAt) {
    try { joinedEl.textContent = new Date(window.CURRENT_USER.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); } catch (e) { joinedEl.textContent = window.CURRENT_USER.createdAt; }
  } else { joinedEl.textContent = "—"; }
  document.getElementById("profileVerified").textContent = window.CURRENT_USER.verifiedAt ? "Yes" : "No";
  document.getElementById("profileVerified").className = "profile-row-value" + (window.CURRENT_USER.verifiedAt ? " profile-status-badge yes" : " profile-status-badge no");
  document.getElementById("profileUserId").querySelector(".profile-id-text").textContent = window.CURRENT_USER.id || "—";
  var tier = window.CURRENT_USER.tier || 'diophantus';
  var tierEl = document.getElementById("profileTier");
  tierEl.textContent = tier.charAt(0).toUpperCase() + tier.slice(1);
  tierEl.className = 'profile-row-value tier-badge tier-' + tier;
  var subEndEl = document.getElementById("profileSubEnd");
  var subEndRow = document.getElementById("profileSubEndRow");
  if (window.CURRENT_USER.subscriptionEnd) {
    try { subEndEl.textContent = new Date(window.CURRENT_USER.subscriptionEnd).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); } catch (e) { subEndEl.textContent = "—"; }
    subEndRow.style.display = "flex";
  } else {
    subEndRow.style.display = (tier === 'diophantus' ? 'none' : 'flex');
    subEndEl.textContent = "—";
  }
  syncProfileWebSearchUI();
  syncProfileLangToggle();
  document.getElementById("profileOverlay").classList.remove("hidden");
}

function closeProfile() {
  document.getElementById("profileOverlay").classList.add("hidden");
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
  var respEl = document.getElementById("profileInstResponse");
  var aboutEl = document.getElementById("profileInstAbout");
  if (respEl) respEl.value = data.response || "";
  if (aboutEl) aboutEl.value = data.about || "";
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
    }).then(function () {}).catch(function (e) {
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
  var el = document.getElementById("profileInstSaveState");
  if (!el) return;
  if (!savedAt) {
    el.textContent = window.t("common.saving");
    el.className = "profile-instructions-state pending";
    return;
  }
  var dt = new Date(savedAt);
  var hh = String(dt.getHours()).padStart(2, "0");
  var mm = String(dt.getMinutes()).padStart(2, "0");
  el.textContent = window.t("profile.savedAt").replace("{hh}", hh).replace("{mm}", mm);
  el.className = "profile-instructions-state saved";
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
  var track = document.getElementById("profileWebSearchTrack");
  if (!track) return;
  if (webSearchOn) { track.classList.add("on"); } else { track.classList.remove("on"); }
}

/* Reflect window._currentLang onto the EN/中文 chips in the profile
 * modal. The same sync lives inside applyI18n() at module init, but
 * opening the profile is the moment the user actually sees the chip,
 * so we re-sync on every open to defend against any future flow that
 * mutates _currentLang without going through setLang/applyI18n. */
function syncProfileLangToggle() {
  var ids = ["profileLangEn", "profileLangZh"];
  var current = (typeof window._currentLang === "string") ? window._currentLang : "en";
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (!el) continue;
    var optLang = ids[i].replace("profileLang", "").toLowerCase();
    el.classList.toggle("active", optLang === current);
  }
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
    }).catch(function (e) {
      console.log("[memories] load failed");
      window._userMemories = [];
    });
  } catch (e) {
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