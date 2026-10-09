import { useCallback, useState } from 'react';
import type { Attachment } from '@socrates/contracts';
import { useChatStore } from '@socrates/chat';
import { api } from './runtime';
import { capturePhoto, extractPickedDocument, pickDocument, pickImages } from './attachments';
import { stagedToMessageAttachment, type PickedFile, type StagedAttachment } from './attachmentModels';
import { appStringsNow } from './strings';

/** Own the composer attachment lifecycle from picker through send-time parsing. */
export function useStagedAttachments() {
  const [staged, setStaged] = useState<StagedAttachment[]>([]);

  const stagePicked = useCallback((picked: PickedFile[]) => {
    setStaged((previous) => [
      ...previous,
      ...picked.map((file, index) => ({
        localId: `staged-${Date.now()}-${index}`,
        name: file.name,
        mime: file.mime,
        size: file.size,
        stagedKind: file.stagedKind,
        ...(file.dataUrl ? { dataUrl: file.dataUrl } : {}),
        ...(file.text !== undefined ? { text: file.text } : {}),
        ...(file.nativeUri ? { nativeUri: file.nativeUri } : {}),
        ...(file.webFile ? { webFile: file.webFile } : {}),
      })),
    ]);
  }, []);

  const onPickImages = useCallback(async () => {
    try {
      stagePicked(await pickImages());
    } catch (error) {
      useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().pickImagesFailed);
    }
  }, [stagePicked]);

  const onTakePhoto = useCallback(async () => {
    try {
      const photo = await capturePhoto();
      if (photo) stagePicked([photo]);
    } catch (error) {
      useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().takePhotoFailed);
    }
  }, [stagePicked]);

  const onPickFile = useCallback(async () => {
    try {
      const file = await pickDocument();
      if (file) stagePicked([file]);
    } catch (error) {
      useChatStore.getState().setStatus('error', error instanceof Error ? error.message : appStringsNow().pickFileFailed);
    }
  }, [stagePicked]);

  const removeStaged = useCallback((id: string) => {
    setStaged((previous) => previous.filter((item) => item.localId !== id));
  }, []);

  const consumeStaged = useCallback((items: ReadonlyArray<Pick<StagedAttachment, 'localId'>>) => {
    const consumed = new Set(items.map((item) => item.localId));
    setStaged((previous) => previous.filter((item) => !consumed.has(item.localId)));
  }, []);

  const clearStaged = useCallback(() => setStaged([]), []);

  const resolveStaged = useCallback(async (): Promise<Attachment[]> => {
    const attachments: Attachment[] = [];
    for (const item of staged) {
      if (item.stagedKind === 'document' && item.text === undefined) {
        const tokens = await api.readTokens();
        const extracted = await extractPickedDocument(
          {
            name: item.name,
            mime: item.mime,
            size: item.size,
            stagedKind: item.stagedKind,
            ...(item.nativeUri ? { nativeUri: item.nativeUri } : {}),
            ...(item.webFile ? { webFile: item.webFile } : {}),
          },
          { endpoint: api.files.extractUrl(), token: tokens.accessToken, fetch: api.fetchWithAuth },
        );
        attachments.push(stagedToMessageAttachment({
          ...item,
          text: extracted.text,
          truncated: extracted.truncated,
          docKind: extracted.kind,
        }));
      } else {
        attachments.push(stagedToMessageAttachment(item));
      }
    }
    return attachments;
  }, [staged]);

  return {
    staged,
    onPickImages,
    onTakePhoto,
    onPickFile,
    removeStaged,
    consumeStaged,
    clearStaged,
    resolveStaged,
  };
}
