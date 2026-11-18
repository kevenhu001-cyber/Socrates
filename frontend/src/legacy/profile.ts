/* Owns the account snapshot and profile actions shared by the SPA pages. */
import { webSearchOn, setWebSearchOn } from '../config/providers.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { getCurrentLanguage } from '../i18n/languageState.ts';
import { publishProfileState } from './profileState.ts';
import { publishSidebarUser } from './sidebarUserState.ts';
import { setUserMemories } from '../app/lifecycle/userMemory.ts';
import { getCurrentUser } from '../app/lifecycle/index.ts';
import { apiFetch } from '../util/api/index.ts';
import { closeAccountPage, openAccountPage } from '../sidebar/navigation.service.ts';
import { getActiveDestination } from '../sidebar/navigation.store.ts';
import {
  buildCustomInstructionsString,
  loadCustomInstructions,
  saveCustomInstructions,
} from '../config/customInstructions.ts';

function userInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function joinedDate(createdAt: string | number | Date | null | undefined) {
  if (!createdAt) return '—';
  try {
    return new Date(createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return String(createdAt);
  }
}

function profileUserSnapshot(user: NonNullable<import('../app/lifecycle/index.ts').UserRecord>) {
  return {
    initials: userInitials(user.displayName || user.email || '?'),
    displayName: user.displayName || '',
    email: user.email || '',
    joinedAt: joinedDate(user.createdAt),
    verifiedAt: user.verifiedAt || null,
    userId: user.id || '—',
    tier: user.tier || 'diophantus',
    subEnd: user.subscriptionEnd || null,
  };
}

function _publishProfileState() {
  const cu = getCurrentUser() || {};
  const inst = loadCustomInstructions();
  publishProfileState({
    user: profileUserSnapshot(cu),
    webSearchOn: !!webSearchOn,
    currentLang: getCurrentLanguage(),
    instResponse: inst.response || '',
    instAbout: inst.about || '',
    instSaveState: null,
  });
}

/* The sidebar footer React component reads this normalized account view. */
function sidebarUserSnapshot(user: import('../app/lifecycle/index.ts').UserRecord) {
  if (!user)
    return {
      initials: '?',
      displayName: 'Guest',
      email: '',
      tier: 'diophantus',
      tierLabel: 'Free',
      isSignedIn: false,
    };
  /* the footer row is ~150px wide once the avatar and
     the three icon buttons take their share, so a full address ellipsised
     to "jiache…" identified nobody. Fall back to the address's local part;
     the complete address stays visible in the profile page. */
  const localPart = String(user.email || '').split('@')[0];
  const name = user.displayName || localPart || '?';
  const tier = user.tier || 'diophantus';
  return {
    initials: userInitials(name),
    displayName: name === '?' ? '' : name,
    email: user.email || '',
    tier: tier,
    tierLabel: tier.charAt(0).toUpperCase() + tier.slice(1),
    isSignedIn: true,
  };
}

function syncDocumentTier(user: import('../app/lifecycle/index.ts').UserRecord) {
  try {
    document.documentElement.dataset.userTier = user?.tier || 'diophantus';
  } catch (_) {
    reportSwallow(_, 'empty catch: legacy/profile.ts');
    /* swallow */
  }
}

export function publishSidebarChrome() {
  const cu = getCurrentUser() || null;
  /* Mirror the tier onto <html> so CSS can gate free-tier affordances
     (the mobile "升级" pill in the top bar) without a JS listener. */
  syncDocumentTier(cu);
  publishSidebarUser(sidebarUserSnapshot(cu));
}

function openProfile(trigger?: HTMLElement | null) {
  if (getCurrentUser()) openAccountPage('profile', trigger);
}

function closeProfile() {
  if (getActiveDestination() === 'profile') closeAccountPage();
}

/* ─── Rename user ─── */

function saveProfileName(newName: string): Promise<boolean> {
  const name = (newName || '').trim();
  const user = getCurrentUser();
  if (!name || !user) return Promise.resolve(false);
  if (name === user.displayName) return Promise.resolve(true);
  return apiFetch('/api/users/me', {
    method: 'PATCH',
    body: { displayName: name },
  })
    .then(function () {
      user.displayName = name;
      publishSidebarChrome();
      /* Republish so the modal reflects the confirmed name. */
      _publishProfileState();
      return true;
    })
    .catch(function () {
      /* Republish the unchanged name so the modal restores its draft. */
      _publishProfileState();
      return false;
    });
}

/* ─── Custom instructions persistence ─── */

let _customInstructionsSaveTimer: number | null | undefined = null;

function loadCustomInstructionsIntoUI() {
  const data = loadCustomInstructions();
  const user = getCurrentUser();
  if (!data.response && typeof user?.customInstructions === 'string') {
    data.response = user.customInstructions;
  }
  updateInstSaveState(data.savedAt);
}

function onCustomInstructionsChange(response: string, about: string) {
  updateInstSaveState(null);
  clearTimeout(_customInstructionsSaveTimer ?? undefined);
  _customInstructionsSaveTimer = setTimeout(function () {
    const value = {
      response: response,
      about: about,
      savedAt: new Date().toISOString(),
    };
    saveCustomInstructions(value);
    updateInstSaveState(value.savedAt);
    apiFetch('/api/users/me', {
      method: 'PATCH',
      body: { customInstructions: buildCustomInstructionsString(value) },
    }).catch(function () {
      console.log('[custom-inst] server sync failed');
    });
  }, 600);
}

function updateInstSaveState(savedAt: string | null) {
  _publishProfileState();
  /* savedAt is preserved in the bridge publish below via instSaveState;
     the legacy text/class writes (window.t("common.saving") and the
     "hh:mm" label) are no longer needed because React's ProfileModal
     component reads savedAt from the snapshot. */
  void savedAt;
}

/* ─── Web search toggle ─── */

function toggleProfileWebSearch() {
  setWebSearchOn(!webSearchOn);
  syncProfileWebSearchUI();
}

function syncProfileWebSearchUI() {
  _publishProfileState();
}

/* ─── Cross-session memory loader ─── */

function loadUserMemories() {
  setUserMemories([]);
  if (!getCurrentUser()) return Promise.resolve();
  try {
    return apiFetch<unknown>('/api/memory', { _authEndpoint: true })
      .then(function (value) {
        if (Array.isArray(value)) {
          setUserMemories(
            value.flatMap(function (memory): string[] {
              if (!memory || typeof memory !== 'object' || Array.isArray(memory)) return [];
              const record = memory as Record<string, unknown>;
              return record.enabled !== false && typeof record.text === 'string'
                ? [record.text]
                : [];
            }),
          );
        }
      })
      .catch(function () {
        console.log('[memories] load failed');
        setUserMemories([]);
      });
  } catch {
    console.log('[memories] load threw');
    setUserMemories([]);
    return Promise.resolve();
  }
}

export {
  openProfile,
  closeProfile,
  saveProfileName,
  loadCustomInstructions,
  saveCustomInstructions,
  loadCustomInstructionsIntoUI,
  onCustomInstructionsChange,
  buildCustomInstructionsString,
  updateInstSaveState,
  toggleProfileWebSearch,
  syncProfileWebSearchUI,
  loadUserMemories,
  _publishProfileState as publishProfileSnapshot,
};
