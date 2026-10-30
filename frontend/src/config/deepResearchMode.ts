let deepResearchEnabled = false;

/** Whether the next composer submission should enter the research workflow. */
export function isDeepResearchEnabled(): boolean {
  return deepResearchEnabled;
}

/** Update the selected Deep Research mode from its extension lifecycle. */
export function setDeepResearchEnabled(enabled: boolean): void {
  deepResearchEnabled = enabled;
}
