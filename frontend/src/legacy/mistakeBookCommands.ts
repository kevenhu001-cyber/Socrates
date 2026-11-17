type MistakeRedoAction = (mistakeId: string) => void;

let activeRedoAction: MistakeRedoAction | null = null;

export function registerMistakeRedoAction(action: MistakeRedoAction): () => void {
  activeRedoAction = action;
  return () => {
    if (activeRedoAction === action) activeRedoAction = null;
  };
}

export function requestMistakeRedo(mistakeId: string): void {
  activeRedoAction?.(mistakeId);
}
