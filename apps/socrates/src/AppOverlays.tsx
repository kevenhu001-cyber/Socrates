import React, { type ComponentProps } from 'react';
import { AssistantPicker, ModelPicker } from '@socrates/ui';
import { ArtifactViewer } from './ArtifactViewer';
import { FilePreview } from './FilePreview';
import { FindBar } from './FindBar';
import { ShareDialog } from './ShareDialog';

interface AppOverlaysProps {
  artifact: ComponentProps<typeof ArtifactViewer>;
  modelPicker: ComponentProps<typeof ModelPicker>;
  assistantPicker: ComponentProps<typeof AssistantPicker>;
  filePreview: ComponentProps<typeof FilePreview> | null;
  findBar: ComponentProps<typeof FindBar>;
  shareDialog: ComponentProps<typeof ShareDialog>;
}

/** Modal and floating surfaces owned by the authenticated app shell. */
export function AppOverlays({
  artifact,
  modelPicker,
  assistantPicker,
  filePreview,
  findBar,
  shareDialog,
}: AppOverlaysProps) {
  return (
    <>
      <ArtifactViewer {...artifact} />
      <ModelPicker {...modelPicker} />
      <AssistantPicker {...assistantPicker} />
      {filePreview ? <FilePreview {...filePreview} /> : null}
      <FindBar {...findBar} />
      <ShareDialog {...shareDialog} />
    </>
  );
}
