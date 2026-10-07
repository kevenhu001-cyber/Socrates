import type { FetchLike } from '@socrates/api';
import type { PickedFile } from './attachmentModels';

export const supportsCamera = false;

export async function pickImages(): Promise<PickedFile[]> {
  throw new Error('Attachments are unavailable on this platform');
}

export async function capturePhoto(): Promise<PickedFile | null> {
  throw new Error('Attachments are unavailable on this platform');
}

export async function pickDocument(): Promise<PickedFile | null> {
  throw new Error('Attachments are unavailable on this platform');
}

export async function extractPickedDocument(
  _picked: PickedFile,
  _input: { endpoint: string; token?: string; fetch?: FetchLike },
): Promise<{ text: string; truncated: boolean; kind?: string }> {
  throw new Error('Attachments are unavailable on this platform');
}
