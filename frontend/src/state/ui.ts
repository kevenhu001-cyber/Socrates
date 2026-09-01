export const UI_FLAT_KEYS = [
  '_userScrolledAway', '_examInView', '_canvasPendingId',
] as const;

export function createInitialUiState() {
  return {
    _userScrolledAway: false,
    _examInView: false,
    _canvasPendingId: null,
  };
}

export type UiState = ReturnType<typeof createInitialUiState>;
