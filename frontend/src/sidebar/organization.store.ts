import { create } from 'zustand';

export type SessionOrganization = 'list' | 'projects';
const STORAGE_KEY = 'socrates-sidebar-organization-v1';

function readOrganization(): SessionOrganization {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'projects' ? 'projects' : 'list';
  } catch {
    /* empty-catch: intentional — browsing preferences work without storage. */
    return 'list';
  }
}

export const useSessionOrganization = create<{
  organization: SessionOrganization;
  setOrganization: (organization: SessionOrganization) => void;
}>((set) => ({
  organization: readOrganization(),
  setOrganization: (organization) => {
    try { localStorage.setItem(STORAGE_KEY, organization); }
    catch { /* empty-catch: intentional — keep the view usable when storage is unavailable. */ }
    set({ organization });
  },
}));
