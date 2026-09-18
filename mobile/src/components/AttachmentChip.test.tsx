import { attachmentIconName } from './AttachmentChip';

/* Mirrors the web `pickIcon` resolution order in
 * frontend/src/react/attachments/fileIcons.tsx: docKind wins, then the
 * mime prefix, then the filename extension. */
describe('attachmentIconName', () => {
  it('prefers the extractor docKind for office files', () => {
    expect(attachmentIconName({ kind: 'file', docKind: 'docx', name: 'a.bin', mime: '' })).toBe('reader-outline');
    expect(attachmentIconName({ kind: 'file', docKind: 'xlsx', name: 'a.bin', mime: '' })).toBe('grid-outline');
    expect(attachmentIconName({ kind: 'file', docKind: 'pptx', name: 'a.bin', mime: '' })).toBe('easel-outline');
    expect(attachmentIconName({ kind: 'file', docKind: 'pdf', name: 'a.bin', mime: '' })).toBe('document-text-outline');
  });

  it('falls back to mime prefix for images, pdf, and media', () => {
    expect(attachmentIconName({ kind: 'file', name: 'shot.png', mime: 'image/png' })).toBe('image-outline');
    expect(attachmentIconName({ kind: 'file', name: 'paper', mime: 'application/pdf' })).toBe('document-text-outline');
    expect(attachmentIconName({ kind: 'file', name: 'clip', mime: 'video/mp4' })).toBe('play-outline');
  });

  it('classifies code and text files by extension', () => {
    expect(attachmentIconName({ kind: 'file', name: 'app.tsx', mime: '' })).toBe('code-slash-outline');
    expect(attachmentIconName({ kind: 'file', name: 'notes.md', mime: '' })).toBe('document-outline');
  });

  it('defaults to the generic document glyph', () => {
    expect(attachmentIconName({ kind: 'file', name: 'archive.zip', mime: 'application/zip' })).toBe('document-outline');
  });
});
