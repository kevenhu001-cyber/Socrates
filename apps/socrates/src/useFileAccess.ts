import { useCallback, useMemo, useState } from 'react';
import type { Message } from '@socrates/contracts';
import type { ThemeMode } from '@socrates/theme';
import {
  buildEmbeddedDocument,
  paletteForDocument,
  storedFileIdFromRawUrl,
  type ArtifactDescriptor,
} from '@socrates/ui';
import { api } from './runtime';
import type { FileAccessTarget, FileImageSource, StoredFileRef } from './fileAccess';
import { useFileImages } from './useFileImages';

interface UseFileAccessOptions {
  messages: Message[] | undefined;
  mode: ThemeMode;
  onOpenArtifact(artifact: ArtifactDescriptor): void;
}

/** Owns authenticated file access, transcript images, previews, and stored HTML artifacts. */
export function useFileAccess({ messages, mode, onOpenArtifact }: UseFileAccessOptions) {
  const [previewFile, setPreviewFile] = useState<StoredFileRef | null>(null);
  const target = useMemo<FileAccessTarget>(() => ({
    rawUrl: (id) => api.files.rawUrl(id),
    fetch: api.fetchWithAuth,
    readToken: async () => (await api.readTokens()).accessToken,
  }), []);
  const fileImages = useFileImages(messages, target);

  const resolveImage = useCallback((src: string): FileImageSource | null => {
    const id = storedFileIdFromRawUrl(src);
    return id ? fileImages[id] ?? null : null;
  }, [fileImages]);

  const openPreview = useCallback((file: StoredFileRef) => setPreviewFile(file), []);
  const closePreview = useCallback(() => setPreviewFile(null), []);
  const reset = closePreview;

  const openAttachment = useCallback((attachment: { fileId?: string; name: string; mime: string; size: number; kind: string }) => {
    if (attachment.fileId) {
      setPreviewFile({
        id: attachment.fileId,
        name: attachment.name,
        mimeType: attachment.mime,
        size: attachment.size,
        kind: attachment.kind,
      });
    }
  }, []);

  const openStoredArtifact = useCallback((file: { id: string; mimeType?: string | null; name?: string | null }) => {
    const title = file.name || 'Artifact';
    const artifactId = `artifact-file-${file.id}`;
    onOpenArtifact({
      id: artifactId,
      kind: 'html',
      title,
      summary: '',
      document: () => '',
      loadDocument: async () => {
        const response = await api.files.fetchRaw(file.id);
        if (!response.ok) throw new Error(`File request failed (${response.status})`);
        return buildEmbeddedDocument({
          artifactId,
          kind: 'html',
          title,
          source: await response.text(),
          palette: paletteForDocument(mode),
        });
      },
    });
  }, [mode, onOpenArtifact]);

  const listFiles = useCallback(() => api.files.list(), []);
  const removeFile = useCallback((id: string) => api.files.remove(id), []);
  const loadPreview = useCallback((id: string) => api.files.preview(id), []);

  return {
    target,
    previewFile,
    openPreview,
    closePreview,
    reset,
    resolveImage,
    openAttachment,
    openStoredArtifact,
    listFiles,
    removeFile,
    loadPreview,
  };
}
