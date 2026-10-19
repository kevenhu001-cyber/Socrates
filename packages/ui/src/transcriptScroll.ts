const FOLLOW_THRESHOLD_PX = 96;

/** Whether the viewport is close enough to the transcript end to follow updates. */
export function isNearTranscriptBottom(contentHeight: number, offsetY: number, viewportHeight: number): boolean {
  return contentHeight - (offsetY + viewportHeight) < FOLLOW_THRESHOLD_PX;
}

/** Content growth does not mean the reader scrolled up; preserve follow intent. */
export function nextTranscriptFollowState(following: boolean, contentHeight: number, offsetY: number, viewportHeight: number, previousOffsetY: number): boolean {
  if (isNearTranscriptBottom(contentHeight, offsetY, viewportHeight)) return true;
  return following && offsetY >= previousOffsetY - 1;
}
