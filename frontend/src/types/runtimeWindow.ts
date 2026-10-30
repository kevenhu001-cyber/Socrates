import type { VendorGlobals } from "./vendorRuntime.ts";
import type { SpeechRecognitionRuntime } from "./speechRuntime.ts";
import type { GeoGebraApi } from "./vendorRuntime.ts";
/** Existing imperative shell hooks. This local contract adds no browser globals.
 * Publishers remain the owners; consumers share their exported signatures. */
export type RuntimeWindow = Omit<Window, 'CURRENT_USER' | 'stateStore' | 'SERVER_SESSIONS' | 'getArchivedSessions' | '__socratesCmdK'> & VendorGlobals & {
  CURRENT_USER: (Partial<import('@socrates/contracts').User> & { subscriptionEnd?: string | null; verifiedAt?: string | null; createdAt?: string | null; customInstructions?: unknown }) | null | undefined;
  scrollToBottomIfPinned?: typeof import('../ui/scroll')['scrollToBottomIfPinned'];
  stateStore: typeof import('../state/store')['stateStore'];
  SERVER_SESSIONS: import('../session/store').SessionRow[];
  getArchivedSessions: typeof import('../session/recents')['getArchivedSessions'];
  __socratesCmdK?: { publish(snapshot: Record<string, unknown>): void };

  "APP_LANG": string;
  renderMathInElement?: (root: Element, options?: Record<string, unknown>) => void;
  "GGBApplet": new (options: Record<string, unknown> & { appletOnLoad?: (api: GeoGebraApi) => void }, useBrowser: boolean) => { inject(target: HTMLElement | string): void };
  "MAX_TOKENS_CHAT": number | undefined;
  "RECENTS_SEARCH_QUERY": string;
  "ReactNativeWebView": { postMessage(message: string): void } | undefined;
  "SOCRATES_STORAGE_BLOCKED": boolean;
  "STREAM_MAX_ATTEMPTS": typeof import("../chat/offline")["STREAM_MAX_ATTEMPTS"];
  "STREAM_RETRYABLE_STATUS": typeof import("../chat/offline")["STREAM_RETRYABLE_STATUS"];
  "SpeechRecognition": (new () => SpeechRecognitionRuntime) | undefined;
  "SpeechSynthesisUtterance": typeof SpeechSynthesisUtterance;
  "Audio": typeof Audio;
  "URL": typeof URL;
  "AudioContext": typeof AudioContext | undefined;
  "__SOCRATES_RELEASE_TAG__": string;
  "__examModule": typeof import("../exam");
  "__loadExamModule": () => Promise<typeof import("../exam")>;
  "__loadStreamingTurn": () => Promise<typeof import("../chat/streamingTurn")>;
  "__sidebarResizeWired": boolean;
  "__socratesCallBridge": typeof import("../state/bridges")["callBridge"];
  "__socratesConsent": { getPreference: () => { v: number; choice: string; nonEssential: boolean; updatedAt: string; } | null; hasConsent: () => boolean; allowsNonEssential: () => boolean; setPreference: (choice: string) => { v: number; choice: string; nonEssential: boolean; updatedAt: string; }; isEssentialCookieName: (name: string) => boolean; };
  "__socratesExamBridge": typeof import("../state/bridges")["examBridge"];
  "__socratesExtensionDispatch": (key: string, ...args: unknown[]) => unknown;
  "__socratesKbBridge": typeof import("../state/bridges")["kbBridge"];
  "__socratesKeyboard": ReturnType<typeof import("../ui/keyboard/index")["initKeyboardLift"]>;
  "__socratesSearchBridge": typeof import("../state/bridges")["searchBridge"];
  "__socratesSessionBridge": typeof import("../state/bridges")["sessionBridge"];
  "__socratesSmoothStream": unknown;
  "__socratesUiBridge": typeof import("../state/bridges")["uiBridge"];
  "__startSearchProgress": typeof import("../ui/searchProgress")["startSearchProgress"];
  "__testActivateMainView": (viewId: string) => boolean;
  "_activeChatAbort": ((reason?: unknown) => void) | null;
  "_activeTemplate": import("../chat/templateSystemPrompt").ActiveTemplate | null;
  "_currentLang": string;
  "_nextProjectId": string | null;
  "_userMemories": string[];
  "addMessage": typeof import("../chat/messages")["addMessage"];
  "addStreamingMessage": (...args: Parameters<typeof import("../chat/streamingTurn")["addStreamingMessage"]>) => ReturnType<typeof import("../chat/streamingTurn")["addStreamingMessage"]> | Promise<ReturnType<typeof import("../chat/streamingTurn")["addStreamingMessage"]>>;
  "apiFetch": typeof import("../util/api")["apiFetch"];
  "appMode": typeof import("../config/providers")["appMode"];
  "appendToolModule": typeof import("../ui/toolCards")["appendToolModule"];
  "askChatTurn": typeof import("../chat/turnController")["askChatTurn"];
  "askNextQuestion": typeof import("../tutor/socraticTurn")["askNextQuestion"];
  "attachments": typeof import("../attachments")["attachments"];
  "branchFromMessage": typeof import("../chat/editBranch")["branchFromMessage"];
  "cancelDiagnostic": () => void;
  "clearActiveTemplate": typeof import("../chat/templateSlash")["clearActiveTemplate"];
  "clearPerUserClientState": typeof import("../app/lifecycle/clientState")["clearPerUserClientState"];
  "closeCmdK": typeof import("../ui/cmdK")["closeCmdK"];
  "closeFindInSession": typeof import("../react/find-in-session/findInSession.actions")["closeFindInSession"];
  "closeMorePopover": typeof import("../sidebar/morePopover")["closeMorePopover"];
  "closeProfile": typeof import("../ui/profile")["closeProfile"];
  "closeShareModal": typeof import("../ui/share")["closeShareModal"];
  "closeTagEditor": typeof import("../session/organizeRuntime")["closeTagEditor"];
  "closeUsageModal": () => Promise<void> | undefined;
  "createShareLink": typeof import("../ui/share")["createShareLink"];
  "cycleActiveProject": typeof import("../session/organizeRuntime")["cycleActiveProject"];
  "deepResearchOn": boolean;
  "deleteUserMessage": typeof import("../ui/messageActions")["deleteUserMessage"];
  "editUserMessage": typeof import("../chat/editBranch")["editUserMessage"];
  "ensureConnectorIcons": typeof import("../sidebar/nav")["ensureConnectorIcons"];
  "extensiveThinkingOn": typeof import("../config/providers")["extensiveThinkingOn"];
  "fetchWebContext": typeof import("../chat/webSearch")['fetchWebContext'];
  "findNext": typeof import("../react/find-in-session/findInSession.actions")["findNext"];
  "findPrev": typeof import("../react/find-in-session/findInSession.actions")["findPrev"];
  "flushRecentsReconcile": (() => Promise<unknown>) | undefined;
  "formatMsg": typeof import("../render/markdown")["formatMsg"];
  "getActiveProvider": typeof import("../pickers")["getActiveProvider"];
  "getAppLang": (() => string) | undefined;
  "getConnectorIconMarkup": typeof import("../sidebar/nav")["connectorIconWithFallback"];
  "getCsrfToken": typeof import("../util/api/request")["getCsrfToken"];
  "getCustomInstructionsString": typeof import("../ui/profile")["getCustomInstructionsString"];
  "getExplanation": typeof import("../tutor/socraticTurn")["getExplanation"];
  "getLiveVizCardIds": typeof import("../render/vizStubs")["getLiveVizCardIds"];
  "getReasoningEffort": typeof import("../ui/effortPicker")["getReasoningEffort"];
  "getSlashApps": typeof import("../sidebar/nav")["getSlashApps"];
  "handleSendClick": typeof import("../chat/composerTurn")["handleSendClick"];
  "hideGate": typeof import("../auth/index")["hideGate"];
  "hideUsageTip": () => Promise<void> | undefined;
  "hydrateConnectorIcons": typeof import("../sidebar/nav")["hydrateConnectorIcons"];
  "incognitoOn": boolean;
  "isInAuthGraceWindow": typeof import("../app/lifecycle")["isInAuthGraceWindow"];
  "launchDeepResearch": () => Promise<void>;
  "loadUsageData": () => Promise<void> | undefined;
  "loadUsageMonth": () => Promise<void> | undefined;
  "markAuthSuccess": typeof import("../app/lifecycle")["markAuthSuccess"];
  "offlineGuard": typeof import("../chat/offline")["offlineGuard"];
  "onCmdKInput": typeof import("../ui/cmdK")["onCmdKInput"];
  "onCmdKKey": typeof import("../ui/cmdK")["onCmdKKey"];
  "openAttachmentPicker": typeof import("../attachments/render")["openAttachmentPicker"];
  "openCheatsheet": typeof import("../ui/cheatsheet")["openCheatsheet"];
  "openCmdK": typeof import("../ui/cmdK")["openCmdK"];
  "openExamModal": () => void;
  "openExamPanel": () => void;
  "openFindInSession": typeof import("../react/find-in-session/findInSession.actions")["openFindInSession"];
  "openMediaPicker": typeof import("../attachments/render")["openMediaPicker"];
  "openNav": typeof import("../sidebar/navigation.service")["openNav"];
  "openShareModal": typeof import("../ui/share")["openShareModal"];
  "openUsageModal": () => Promise<void>;
  "processPendingVizActions": typeof import("../render/vizStubs")["processPendingVizActions"];
  "refreshApiConfig": typeof import("../config/providers")["refreshApiConfig"];
  "refreshExamI18n": () => void;
  "refreshServerSessions": typeof import("../session/recents")["refreshServerSessions"];
  "regenerateAssistantMessage": typeof import("../chat/editBranch")["regenerateAssistantMessage"];
  "rememberConnectorReturnContext": typeof import("../sidebar/nav")["rememberConnectorReturnContext"];
  "removeAttachment": typeof import("../attachments")["removeAttachment"];
  "renderAssistantHTML": typeof import("../render/assistantHtml")["buildAssistantHtml"];
  "renderAttachmentChips": typeof import("../attachments/render")["renderAttachmentChips"];
  "renderMistakes": () => void;
  "renderRecents": typeof import("../ui/recentsView")["renderRecents"];
  "resendLastUserMessage": typeof import("../chat/turnUi")["resendLastUserMessage"];
  "restorePersistedMessageExtras": typeof import("../ui/messageActions")["restorePersistedMessageExtras"];
  "retryComposerAttachment": typeof import("../attachments/render")["retryComposerAttachment"];
  "retryDiagnostic": () => void;
  "revokeShareLink": typeof import("../ui/share")["revokeShareLink"];
  "saveCurrentSession": typeof import("../session/persistence")["saveCurrentSession"];
  "scrollMainToBottom": (() => void) | undefined;
  "selectAppMode": typeof import("../ui/mobileModeSwitch")["selectAppMode"];
  "sendFeedback": typeof import("../ui/messageActions")["sendFeedback"];
  "setActiveNav": typeof import("../sidebar/navigation.service")["setActiveNav"];
  "setActiveTemplate": typeof import("../chat/templateSlash")["setActiveTemplate"];
  "setAppMode": typeof import("../config/providers")["setAppMode"];
  "setChatStopState": typeof import("../chat/composerTurn")["setChatStopState"];
  "setCurrentUser": typeof import("../app/lifecycle")["setCurrentUser"];
  "setLang": () => void;
  "setSearchPill"?: typeof import("../chat/webSearch")['setSearchPill'];
  "showAuthSignin": typeof import("../auth/index")["showAuthSignin"];
  "showConfirm": typeof import("../ui/confirm")["showConfirm"];
  "showGate": typeof import("../auth/index")["showGate"];
  "showToast": typeof import("../ui/toast")["showToast"];
  "showUsageTip": (ev: Pick<Event, "currentTarget">) => Promise<void> | undefined;
  "sidebarOpen": typeof import("../ui/sidebarChrome")["sidebarOpen"];
  "sleepBackoff": typeof import("../chat/offline")["sleepBackoff"];
  "startDeepResearch": typeof import("../agent/researchAgent")["startDeepResearch"];
  "startNewChat": typeof import("../app/lifecycle")["startNewChat"];
  "startSession": typeof import("../chat/sessionBootstrap")["startSession"];
  "stopChatResponse": typeof import("../chat/composerTurn")["stopChatResponse"];
  "stopSpeechInput": () => Promise<ReturnType<typeof import("../ui/voiceInput")["stopSpeechInput"]>> | undefined;
  "submitChatMessage": typeof import("../chat/sendPipeline")["submitChatMessage"];
  "switchMessageBranch": typeof import("../chat/editBranch")["switchMessageBranch"];
  "syncAppModeUI": typeof import("../config/providers")["syncAppModeUI"];
  "syncChatModel": typeof import("../pickers")["syncChatModel"];
  "syncConversationActive": typeof import("../ui/mobileModeSwitch")["syncConversationActive"];
  "syncMobileModeSwitch": typeof import("../ui/mobileModeSwitch")["syncMobileModeSwitch"];
  "syncModelPills": typeof import("../pickers")["syncModelPills"];
  "syncQuickChips": () => void;
  "syncSidebarBtns": typeof import("../ui/sidebarChrome")["syncSidebarBtns"];
  "thinkingOn": typeof import("../config/providers")["thinkingOn"];
  "toggleAppMode": typeof import("../app/lifecycle/mode")["toggleAppMode"];
  "toggleChatTopBarEls": typeof import("../ui/topBarState")["toggleChatTopBarEls"];
  "toggleKBDetail": typeof import("../ui/knowledgeDetail")["toggleKBDetail"];
  "toggleMobileModeMenu": typeof import("../ui/mobileModeSwitch")["toggleMobileModeMenu"];
  "toggleSidebarView": typeof import("../ui/sidebarChrome")["toggleSidebarView"];
  "tutorSocratic": import("../tutorSocratic").TutorSocraticRuntime;
  "updateComposerBtn": typeof import("../ui/topicSetup")["updateComposerBtn"];
  "updateKB": typeof import("../ui/knowledgePanel")["updateKB"];
  "updateMistakesBadge": () => void;
  "useBuiltinDiagnostic": () => void;
  "webSearchOn": typeof import("../config/providers")["webSearchOn"];
  "webkitAudioContext": typeof AudioContext | undefined;
  "webkitSpeechRecognition": (new () => SpeechRecognitionRuntime) | undefined;
};

function currentRuntimeWindow(): RuntimeWindow | undefined {
  return typeof window === "undefined" ? undefined : window as unknown as RuntimeWindow;
}

/**
 * Resolve the browser global at access time. Tests and embedded hosts can
 * replace `window` after importing modules; capturing it during module
 * evaluation leaves every typed bridge pointing at the stale object.
 */
export const runtimeWindow = new Proxy({} as RuntimeWindow, {
  get(_target, property) {
    const current = currentRuntimeWindow();
    const value = current && property in current
      ? current[property as keyof RuntimeWindow]
      : Reflect.get(globalThis, property);
    return typeof value === "function" ? value.bind(current) : value;
  },
  set(_target, property, value) {
    const current = currentRuntimeWindow();
    return current ? Reflect.set(current, property, value, current) : true;
  },
  defineProperty(_target, property, descriptor) {
    const current = currentRuntimeWindow();
    return current ? Reflect.defineProperty(current, property, descriptor) : true;
  },
  has(_target, property) {
    const current = currentRuntimeWindow();
    return !!current && property in current;
  },
  deleteProperty(_target, property) {
    const current = currentRuntimeWindow();
    return current ? Reflect.deleteProperty(current, property) : true;
  },
});
