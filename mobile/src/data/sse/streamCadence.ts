/**
 * Perceptual repaint cadence for streamed assistant text. This mirrors
 * frontend/src/render/streaming.ts: keep the first screen responsive, then
 * progressively coalesce transport chunks as whole-message Markdown becomes
 * more expensive to parse. The first non-empty delta is committed immediately
 * by appStore; these intervals gate later frames only.
 */
export function getMobileStreamRenderInterval(textLength: number | null | undefined): number {
  const length = Math.max(0, Number(textLength) || 0);
  if (length < 2000) return 50;
  if (length < 8000) return 80;
  return 120;
}
