/* Client-side limits mirror the server upload and chat payload caps. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENTS = 6;

/* Aborting a send-time wait must not kill an upload still allowed to run. */
export const XHR_TIMEOUT_MS = 300_000;
export const ATTACHMENT_READY_TIMEOUT_MS = XHR_TIMEOUT_MS;

/* Keep below the server's 2,000,000-character inline image payload cap. */
export const MAX_IMAGE_DATAURL_CHARS = 1_900_000;
/* Base64 expands input by about 4/3; larger files decode directly from Blob. */
export const MAX_IMAGE_SOURCE_BYTES_BEFORE_DATAURL = Math.floor(
  (MAX_IMAGE_DATAURL_CHARS - 64) * 3 / 4,
);
