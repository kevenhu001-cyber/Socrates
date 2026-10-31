export type AuthTab = 'signin' | 'register' | null;

export interface AuthButtonState {
  disabled: boolean;
  label?: string;
}

export interface AuthFocusRequest {
  id: string;
  revision: number;
}

export interface AuthUiState {
  view: string;
  activeTab: AuthTab;
  fields: Readonly<Record<string, string>>;
  errors: Readonly<Record<string, string>>;
  text: Readonly<Record<string, string>>;
  visibility: Readonly<Record<string, boolean>>;
  buttons: Readonly<Record<string, AuthButtonState>>;
  focusRequest: AuthFocusRequest | null;
}

const state: { current: AuthUiState } = {
  current: {
    view: 'authSigninView',
    activeTab: 'signin',
    fields: {},
    errors: {},
    text: {},
    visibility: {},
    buttons: {},
    focusRequest: null,
  },
};

const subscribers = new Set<() => void>();
let focusRevision = 0;

export function getAuthUiState(): AuthUiState {
  return state.current;
}

export function subscribeAuthUi(listener: () => void): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

function updateAuthUi(update: (previous: AuthUiState) => AuthUiState): void {
  const next = update(state.current);
  if (next === state.current) return;
  state.current = next;
  subscribers.forEach((listener) => listener());
}

export function setAuthView(view: string): void {
  updateAuthUi((previous) => previous.view === view ? previous : { ...previous, view });
}

export function setAuthTab(tab: AuthTab): void {
  const view = tab === 'signin' ? 'authSigninView' : tab === 'register' ? 'authRegisterView' : state.current.view;
  updateAuthUi((previous) => previous.activeTab === tab && previous.view === view
    ? previous
    : { ...previous, activeTab: tab, view });
}

export function getAuthField(id: string): string {
  return state.current.fields[id] || '';
}

export function setAuthField(id: string, value: string): void {
  updateAuthUi((previous) => previous.fields[id] === value ? previous : {
    ...previous,
    fields: { ...previous.fields, [id]: value },
  });
}

export function setAuthErrorState(id: string, value: string): void {
  updateAuthUi((previous) => previous.errors[id] === value ? previous : {
    ...previous,
    errors: { ...previous.errors, [id]: value },
  });
}

export function setAuthText(id: string, value: string): void {
  updateAuthUi((previous) => previous.text[id] === value ? previous : {
    ...previous,
    text: { ...previous.text, [id]: value },
  });
}

export function setAuthVisibility(id: string, visible: boolean): void {
  updateAuthUi((previous) => previous.visibility[id] === visible ? previous : {
    ...previous,
    visibility: { ...previous.visibility, [id]: visible },
  });
}

export function setAuthButtonState(id: string, disabled: boolean, label?: string): void {
  const previousButton = state.current.buttons[id];
  if (previousButton?.disabled === disabled && previousButton.label === label) return;
  updateAuthUi((previous) => ({
    ...previous,
    buttons: { ...previous.buttons, [id]: { disabled, label } },
  }));
}

export function requestAuthFocus(id: string): void {
  focusRevision += 1;
  updateAuthUi((previous) => ({ ...previous, focusRequest: { id, revision: focusRevision } }));
}
