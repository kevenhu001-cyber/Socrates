import { buildChatHistory } from '@socrates/core';
import type { Message } from '@socrates/contracts';
import { appendAttachmentPointers } from './attachmentPointers';

const image = {
  id: 'img-1',
  kind: 'image',
  name: 'diagram.png',
  mime: 'image/png',
  size: 512,
  fileId: 'file-uuid-1',
  dataUrl: 'data:image/png;base64,abc',
};

describe('appendAttachmentPointers', () => {
  it('adds the server pointer beside inline image content', () => {
    const messages: Message[] = [{ role: 'user', rawText: 'Describe this', attachments: [image] }];
    const history = buildChatHistory(messages);
    const result = appendAttachmentPointers(history, messages);
    expect(result[0].content).toEqual([
      { type: 'text', text: 'Describe this' },
      { type: 'image_url', image_url: { url: image.dataUrl, detail: 'auto' } },
      { type: 'text', text: '[Attached file: "diagram.png" (image/png, 512 bytes) — fileId: file-uuid-1]' },
    ]);
    expect(history[0].content).toHaveLength(2);
  });

  it('makes an uploaded large image discoverable when it has no inline data URL', () => {
    const messages: Message[] = [{
      role: 'user',
      rawText: 'What is in this image?',
      attachments: [{ ...image, dataUrl: undefined, size: 8_000_000 }],
    }];
    const result = appendAttachmentPointers(buildChatHistory(messages), messages);
    expect(result[0].content).toBe(
      'What is in this image?\n\n[Attached file: "diagram.png" (image/png, 8000000 bytes) — fileId: file-uuid-1]',
    );
  });

  it('does not invent a server pointer for an attachment without fileId', () => {
    const messages: Message[] = [{
      role: 'user',
      rawText: 'Question',
      attachments: [{ ...image, fileId: undefined }],
    }];
    const history = buildChatHistory(messages);
    const result = appendAttachmentPointers(history, messages);
    expect(result[0]).toBe(history[0]);
  });
});
