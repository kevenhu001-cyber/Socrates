import assert from 'node:assert/strict';
import test from 'node:test';

import { compressImageFile, scaledImageDimensions } from '../src/attachments/imageCompression.js';

async function withGlobalOverrides(overrides, fn) {
  const descriptors = new Map(Object.keys(overrides).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(overrides)) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    return await fn();
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('image resize steps preserve aspect ratio and do not enlarge small sources', () => {
  assert.deepEqual(scaledImageDimensions(4000, 2000, 2048), { width: 2048, height: 1024 });
  assert.deepEqual(scaledImageDimensions(1000, 3000, 1600), { width: 533, height: 1600 });
  assert.deepEqual(scaledImageDimensions(640, 480, 2048), { width: 640, height: 480 });
});

test('oversized decoded images are closed before canvas allocation', async () => {
  let closed = false;
  let canvasAllocated = false;

  await withGlobalOverrides({
    OffscreenCanvas: class {
      constructor() { canvasAllocated = true; }
    },
    createImageBitmap: async () => ({ width: 7000, height: 6000, close() { closed = true; } }),
    document: undefined,
    Image: undefined,
  }, async () => {
    assert.equal(await compressImageFile({ size: 10 }), null);
    assert.equal(closed, true);
    assert.equal(canvasAllocated, false);
  });
});

test('legacy image fallback uses JPEG when WebP returns a different format and releases its URL', async () => {
  let revokedUrl = '';
  const formats = [];
  const context = {
    fillRect() {},
    drawImage() {},
  };
  const canvas = {
    getContext() { return context; },
    toDataURL(type) {
      formats.push(type);
      return type === 'image/webp' ? 'data:image/png;base64,AAAA' : 'data:image/jpeg;base64,AAAA';
    },
  };
  class MockImage {
    constructor() {
      this.naturalWidth = 4000;
      this.naturalHeight = 2000;
    }
    set src(value) {
      this.source = value;
      queueMicrotask(() => this.onload());
    }
  }

  await withGlobalOverrides({
    OffscreenCanvas: undefined,
    createImageBitmap: undefined,
    document: { createElement: () => canvas },
    Image: MockImage,
    URL: {
      createObjectURL: () => 'blob:test-image',
      revokeObjectURL: (value) => { revokedUrl = value; },
    },
  }, async () => {
    assert.equal(await compressImageFile({ size: 10 }), 'data:image/jpeg;base64,AAAA');
  });

  assert.deepEqual(formats, ['image/webp', 'image/jpeg']);
  assert.equal(revokedUrl, 'blob:test-image');
  assert.equal(canvas.width, 2048);
  assert.equal(canvas.height, 1024);
});
