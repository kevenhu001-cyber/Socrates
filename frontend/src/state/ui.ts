export function createInitialUiState() {
  return {
    _userScrolledAway: false,
    _examInView: false,
    _canvasPendingId: null,
  };
}

export type UiState = ReturnType<typeof createInitialUiState>;
