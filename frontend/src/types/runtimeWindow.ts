import type { VendorGlobals } from "./vendorRuntime.ts";
import type { SpeechRecognitionRuntime } from "./speechRuntime.ts";
import type { GeoGebraApi } from "./vendorRuntime.ts";
/** Existing imperative shell hooks. This local contract adds no browser globals.
 * Publishers remain the owners; consumers share their exported signatures. */
export type RuntimeWindow = Omit<Window, 'CURRENT_USER' | 'stateStore' | 'SERVER_SESSIONS'> & VendorGlobals & {
  CURRENT_USER: (Partial<import('@socrates/contracts').User> & { subscriptionEnd?: string | null; verifiedAt?: string | null; createdAt?: string | null; customInstructions?: unknown }) | null | undefined;
  scrollToBottomIfPinned?: typeof import('../ui/scroll')['scrollToBottomIfPinned'];
  stateStore: typeof import('../state/store')['stateStore'];
  SERVER_SESSIONS: import('../session/store').SessionRow[];

  renderMathInElement?: (root: Element, options?: Record<string, unknown>) => void;
  "GGBApplet": new (options: Record<string, unknown> & { appletOnLoad?: (api: GeoGebraApi) => void }, useBrowser: boolean) => { inject(target: HTMLElement | string): void };
  "ReactNativeWebView": { postMessage(message: string): void } | undefined;
  "SOCRATES_STORAGE_BLOCKED": boolean;
  "SpeechRecognition": (new () => SpeechRecognitionRuntime) | undefined;
  "SpeechSynthesisUtterance": typeof SpeechSynthesisUtterance;
  "Audio": typeof Audio;
  "URL": typeof URL;
  "AudioContext": typeof AudioContext | undefined;
  "__loadStreamingTurn": () => Promise<typeof import("../chat/streamingTurn")>;
  "__socratesKeyboard": ReturnType<typeof import("../ui/keyboard/index")["initKeyboardLift"]>;
  "__testActivateMainView": (viewId: string) => boolean;
  "_activeTemplate": import("../chat/templateSystemPrompt").ActiveTemplate | null;
  "addMessage": typeof import("../chat/messages")["addMessage"];
  "addStreamingMessage": (...args: Parameters<typeof import("../chat/streamingTurn")["addStreamingMessage"]>) => ReturnType<typeof import("../chat/streamingTurn")["addStreamingMessage"]> | Promise<ReturnType<typeof import("../chat/streamingTurn")["addStreamingMessage"]>>;
  "askChatTurn": typeof import("../chat/turnController")["askChatTurn"];
  "askNextQuestion": typeof import("../tutor/socraticTurn")["askNextQuestion"];
  "cancelDiagnostic"?: () => void;
  "clearActiveTemplate": typeof import("../chat/templateSlash")["clearActiveTemplate"];
  "clearPerUserClientState": typeof import("../app/lifecycle/clientState")["clearPerUserClientState"];
  "closeTagEditor": typeof import("../session/organizeRuntime")["closeTagEditor"];
  "fetchWebContext": typeof import("../chat/webSearch")['fetchWebContext'];
  "getConnectorIconMarkup": typeof import("../sidebar/nav")["connectorIconWithFallback"];
  "getSlashApps": typeof import("../sidebar/nav")["getSlashApps"];
  "handleSendClick": typeof import("../chat/composerTurn")["handleSendClick"];
  "isInAuthGraceWindow": typeof import("../app/lifecycle")["isInAuthGraceWindow"];
  "markAuthSuccess": typeof import("../app/lifecycle")["markAuthSuccess"];
  "openAttachmentPicker": typeof import("../attachments/render")["openAttachmentPicker"];
  "refreshServerSessions": typeof import("../session/recents")["refreshServerSessions"];
  "rememberConnectorReturnContext": typeof import("../sidebar/nav")["rememberConnectorReturnContext"];
  "renderAssistantHTML": typeof import("../render/assistantHtml")["buildAssistantHtml"];
  "renderRecents": typeof import("../ui/recentsView")["renderRecents"];
  "resendLastUserMessage": typeof import("../chat/turnUi")["resendLastUserMessage"];
  "retryDiagnostic"?: () => void;
  "saveCurrentSession": typeof import("../session/persistence")["saveCurrentSession"];
  "scrollMainToBottom": (() => void) | undefined;
  "setActiveTemplate": typeof import("../chat/templateSlash")["setActiveTemplate"];
  "setChatStopState": typeof import("../chat/composerTurn")["setChatStopState"];
  "setCurrentUser": typeof import("../app/lifecycle")["setCurrentUser"];
  "showToast": typeof import("../ui/toast")["showToast"];
  "startNewChat": typeof import("../app/lifecycle")["startNewChat"];
  "startSession": typeof import("../chat/sessionBootstrap")["startSession"];
  "submitChatMessage": typeof import("../chat/sendPipeline")["submitChatMessage"];
  "toggleSidebarView": typeof import("../ui/sidebarChrome")["toggleSidebarView"];
  "tutorSocratic": import("../tutorSocratic").TutorSocraticRuntime;
  "useBuiltinDiagnostic"?: () => void;
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
