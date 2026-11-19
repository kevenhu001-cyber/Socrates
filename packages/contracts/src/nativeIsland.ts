/** Platform-neutral inputs for isolated preview surfaces. The host selects
 * sandbox capabilities from the kind and owns the platform view lifecycle. */
export type NativeIslandFrame = { title: string } & (
  { kind: 'visualization' | 'creation'; html: string } | { kind: 'artifact'; url: string }
);

/** UI-level inputs for the editor island. The platform editor instance and
 * draft ownership stay inside the host. */
export interface NativeIslandEditorProps {
  placeholder: string;
  onSubmit: () => void;
  onEscape?: () => void;
  showToolbar?: boolean;
}
