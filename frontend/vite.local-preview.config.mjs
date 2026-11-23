// Local preview launcher config — Windows workaround.
// Vite 8's rolldown dependency optimizer fails on `@tldraw/assets`'
// `xxx.json?url` imports with os error 123 (the `?url` suffix is treated as
// part of the filename). The whiteboard module is a lazy dynamic import, so
// excluding it from pre-bundling lets Vite serve it unbundled instead.
import base from './vite.config.js';

export default {
  ...base,
  optimizeDeps: {
    ...base.optimizeDeps,
    exclude: ['@tldraw/assets'],
  },
};
