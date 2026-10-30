type ResetExamSaveState = () => void;

let resetLoadedExamSaveState: ResetExamSaveState | null = null;

/** Register the save-timer reset without eagerly loading the exam feature. */
export function registerExamSaveReset(reset: ResetExamSaveState) {
  resetLoadedExamSaveState = reset;
}

/** Reset exam persistence only after its lazy module has loaded. */
export function resetExamSaveStateIfLoaded() {
  resetLoadedExamSaveState?.();
}
