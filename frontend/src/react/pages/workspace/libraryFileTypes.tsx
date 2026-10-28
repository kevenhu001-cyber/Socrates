import React from 'react';
import type { LibraryItemRecord } from './library.types';

/* File-type glyphs for the Library thumbnail box. Resolution order is
   `kind` (from the files.kind column) first, then the filename extension,
   so records saved before `kind` existed still get the right icon. */
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'mkv', 'avi'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
const TABLE_EXTENSIONS = ['csv', 'tsv', 'xls', 'xlsx'];
const SLIDE_EXTENSIONS = ['ppt', 'pptx', 'key', 'odp'];
const DOC_EXTENSIONS = ['doc', 'docx', 'rtf', 'odt', 'md', 'markdown', 'txt'];
const BOOK_EXTENSIONS = ['epub', 'mobi', 'azw3'];

function fileDetails(item: LibraryItemRecord): { kind: string; ext: string } {
  const kind = String(item.kind || '').toLowerCase();
  const name = String(item.name || item.title || '');
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return { kind, ext };
}

const CATEGORY_RULES: Array<{ type: string; matches: (kind: string, ext: string) => boolean }> = [
  { type: 'image', matches: (kind, ext) => kind === 'image' || IMAGE_EXTENSIONS.includes(ext) },
  { type: 'html', matches: (_kind, ext) => ['html', 'htm', 'web'].includes(ext) },
  { type: 'table', matches: (kind, ext) => kind === 'xlsx' || TABLE_EXTENSIONS.includes(ext) },
  { type: 'code', matches: (_kind, ext) => ['json', 'js', 'ts', 'py', 'css'].includes(ext) },
  { type: 'video', matches: (kind, ext) => kind === 'video' || VIDEO_EXTENSIONS.includes(ext) },
  { type: 'audio', matches: (kind, ext) => kind === 'audio' || AUDIO_EXTENSIONS.includes(ext) },
  { type: 'doc', matches: (kind, ext) => DOC_EXTENSIONS.includes(ext) || ['pdf', 'text', 'docx'].includes(kind) },
];

function getFileTypeCategory(item: LibraryItemRecord): string {
  const { kind, ext } = fileDetails(item);
  return CATEGORY_RULES.find((rule) => rule.matches(kind, ext))?.type || 'file';
}

function FileGlyph({ children }: { children: React.ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const GLYPH_RULES: Array<{ type: string; matches: (kind: string, ext: string) => boolean }> = [
  { type: 'html', matches: (_kind, ext) => ['html', 'htm', 'web'].includes(ext) },
  { type: 'code', matches: (_kind, ext) => ['json', 'js', 'ts', 'py', 'css'].includes(ext) },
  { type: 'text', matches: (_kind, ext) => ['md', 'markdown', 'txt'].includes(ext) },
  { type: 'image', matches: (kind, ext) => kind === 'image' || IMAGE_EXTENSIONS.includes(ext) },
  { type: 'video', matches: (kind, ext) => kind === 'video' || VIDEO_EXTENSIONS.includes(ext) },
  { type: 'audio', matches: (kind, ext) => kind === 'audio' || AUDIO_EXTENSIONS.includes(ext) },
  { type: 'table', matches: (kind, ext) => kind === 'xlsx' || TABLE_EXTENSIONS.includes(ext) },
  { type: 'slide', matches: (kind, ext) => kind === 'pptx' || SLIDE_EXTENSIONS.includes(ext) },
  { type: 'book', matches: (kind, ext) => kind === 'epub' || BOOK_EXTENSIONS.includes(ext) },
  { type: 'doc', matches: (kind, ext) => ['pdf', 'text', 'docx', 'rtf'].includes(kind) || DOC_EXTENSIONS.includes(ext) },
];

function glyphType(item: LibraryItemRecord): string {
  const { kind, ext } = fileDetails(item);
  return GLYPH_RULES.find((rule) => rule.matches(kind, ext))?.type || 'file';
}

const FILE_TYPE_GLYPHS: Record<string, () => React.ReactNode> = {
  html: () => (
    <FileGlyph>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18" />
    </FileGlyph>
  ),
  code: () => <FileGlyph><path d="m8 6-5 6 5 6M16 6l5 6-5 6M14 4l-4 16" /></FileGlyph>,
  text: () => <FileGlyph><rect x="4" y="2.5" width="16" height="19" rx="3" /><path d="M8 9h8M8 15h5" /></FileGlyph>,
  image: () => (
    <FileGlyph>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <circle cx="8.6" cy="8.6" r="1.6" />
      <path d="m21 15.5-4.5-4.5L5 22" />
    </FileGlyph>
  ),
  video: () => (
    <FileGlyph>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="m10 9 5 3-5 3z" />
    </FileGlyph>
  ),
  audio: () => (
    <FileGlyph>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </FileGlyph>
  ),
  table: () => (
    <FileGlyph>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </FileGlyph>
  ),
  slide: () => (
    <FileGlyph>
      <rect x="3" y="3.5" width="18" height="12.5" rx="2" />
      <path d="M12 16v5M8.5 21h7" />
    </FileGlyph>
  ),
  book: () => (
    <FileGlyph>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </FileGlyph>
  ),
  doc: () => (
    <FileGlyph>
      <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" />
      <path d="M14 2.5V8h5.5" />
      <path d="M8.5 13h7M8.5 17h4.5" />
    </FileGlyph>
  ),
  file: () => (
    <FileGlyph>
      <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" />
      <path d="M14 2.5V8h5.5" />
    </FileGlyph>
  ),
};

function fileTypeGlyph(item: LibraryItemRecord): React.ReactNode {
  return FILE_TYPE_GLYPHS[glyphType(item)]();
}

/* ------------------------------------------------------------------ */
/*  Library sub-components                                             */
/* ------------------------------------------------------------------ */

export { getFileTypeCategory, fileTypeGlyph };
