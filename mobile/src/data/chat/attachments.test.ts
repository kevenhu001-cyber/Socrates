import { pickChatAttachment } from './attachments';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { filesApi } from '../api/client';
import { native } from '../../native/native';

jest.mock('../api/client', () => ({
  filesApi: {
    upload: jest.fn(),
    content: jest.fn(),
  },
}));
jest.mock('../../native/native', () => ({
  native: {
    pickFile: jest.fn(),
    pickImage: jest.fn(),
    capturePhoto: jest.fn(),
  },
}));
jest.mock('../../i18n', () => ({ tSync: (key: string) => key }));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

const mockFilesApi = filesApi as jest.Mocked<typeof filesApi>;
const mockNative = native as jest.Mocked<typeof native>;

describe('pickChatAttachment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a file above the Web 25 MiB per-file limit before uploading', async () => {
    mockNative.pickFile.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///oversize.pdf', name: 'oversize.pdf', mimeType: 'application/pdf', size: 25 * 1024 * 1024 + 1 }],
    });

    await expect(pickChatAttachment('file', 'session-1')).rejects.toThrow('chat.fileTooLarge');
    expect(mockFilesApi.upload).not.toHaveBeenCalled();
  });

  it('resizes/re-encodes a selected image and persists it with an inline preview', async () => {
    mockNative.pickImage.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///photo.jpeg', name: 'photo.jpeg', mimeType: 'image/jpeg', size: 5_000_000, width: 4096, height: 2048 }],
    });
    (manipulateAsync as jest.Mock).mockResolvedValue({ uri: 'file:///optimized.jpg', base64: 'c21hbGw=', width: 2048, height: 1024 });
    mockFilesApi.upload.mockResolvedValue({ id: 'file-image-1', name: 'photo.jpg', mimeType: 'image/jpeg', size: 5, kind: 'image' });

    const attachment = await pickChatAttachment('image', 'session-1');

    expect(manipulateAsync).toHaveBeenCalledWith('file:///photo.jpeg', [{ resize: { width: 2048, height: 1024 } }], {
      compress: 0.82, format: SaveFormat.JPEG, base64: true,
    });
    expect(mockFilesApi.upload).toHaveBeenCalledWith({ uri: 'file:///optimized.jpg', name: 'photo.jpg', mimeType: 'image/jpeg', size: 5 }, 'session-1');
    expect(attachment).toMatchObject({ fileId: 'file-image-1', id: 'file-image-1', kind: 'image', dataUrl: 'data:image/jpeg;base64,c21hbGw=' });
  });

  it('keeps large optimized images server-backed without embedding oversized base64', async () => {
    mockNative.pickImage.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///large.png', name: 'large.png', mimeType: 'image/png', width: 1200, height: 900 }],
    });
    (manipulateAsync as jest.Mock).mockResolvedValue({ uri: 'file:///large-optimized.png', base64: 'a'.repeat(1_900_001), width: 1200, height: 900 });
    mockFilesApi.upload.mockResolvedValue({ id: 'file-image-2', name: 'large.png', mimeType: 'image/png', size: 1_425_000, kind: 'image' });

    const attachment = await pickChatAttachment('image', 'session-2');
    expect(attachment).toMatchObject({ fileId: 'file-image-2', id: 'file-image-2' });
    expect(attachment?.dataUrl).toBeUndefined();
    expect(mockFilesApi.upload).toHaveBeenCalledTimes(1);
  });
});
