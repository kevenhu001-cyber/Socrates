/** Existing imperative shell hooks. This local contract adds no browser globals.
 * Publishers remain the owners; consumers share their exported signatures. */
export type RuntimeWindow = Window & {
  "__loadStreamingTurn": () => Promise<typeof import("../chat/streamingTurn")>;
  "__socratesLegacy"?: unknown;
  "addMessage": typeof import("../chat/messages")["addMessage"];
  "addStreamingMessage": (...args: Parameters<typeof import("../chat/streamingTurn")["addStreamingMessage"]>) => ReturnType<typeof import("../chat/streamingTurn")["addStreamingMessage"]> | Promise<ReturnType<typeof import("../chat/streamingTurn")["addStreamingMessage"]>>;
  "askChatTurn": typeof import("../chat/turnController")["askChatTurn"];
  "askNextQuestion": typeof import("../tutor/socraticTurn")["askNextQuestion"];
  "clearPerUserClientState": typeof import("../app/lifecycle/clientState")["clearPerUserClientState"];
  "fetchWebContext": typeof import("../chat/webSearch")['fetchWebContext'];
  "handleSendClick": typeof import("../chat/composerTurn")["handleSendClick"];
  "isInAuthGraceWindow": typeof import("../app/lifecycle")["isInAuthGraceWindow"];
  "loadSession": typeof import("../session/loader")["loadSession"];
  "markAuthSuccess": typeof import("../app/lifecycle")["markAuthSuccess"];
  "openAttachmentPicker": typeof import("../attachments/render")["openAttachmentPicker"];
  "refreshServerSessions": typeof import("../session/recents")["refreshServerSessions"];
  "renderAssistantHTML": typeof import("../render/assistantHtml")["buildAssistantHtml"];
  "renderRecents": typeof import("../ui/recentsView")["renderRecents"];
  "resendLastUserMessage": typeof import("../chat/turnUi")["resendLastUserMessage"];
  "resetApp": typeof import("../app/lifecycle")["resetApp"];
  "saveCurrentSession": typeof import("../session/persistence")["saveCurrentSession"];
  "setChatStopState": typeof import("../chat/composerTurn")["setChatStopState"];
  "setCurrentUser": typeof import("../app/lifecycle")["setCurrentUser"];
  "showToast": typeof import("../ui/toast")["showToast"];
  "startNewChat": typeof import("../app/lifecycle")["startNewChat"];
  "startSession": typeof import("../chat/sessionBootstrap")["startSession"];
  "submitChatMessage": typeof import("../chat/sendPipeline")["submitChatMessage"];
  "toggleSidebarView": typeof import("../ui/sidebarChrome")["toggleSidebarView"];
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
