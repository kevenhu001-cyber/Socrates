import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  safe: { flex: 1 },
  shell: { flex: 1, flexDirection: 'row', position: 'relative' },
  /* parity (web): the SPA's `.main-bg` carries `will-change: transform`, so
     Chrome promotes `#mainContent` to its own composited layer (reason:
     Overlap) whose origin is the column's left edge. Rasterising the
     composer's rounded border in a layer at that origin is what produces
     the baseline's anti-aliased edge (probe: (1233,842) RGB 32 vs 33 when
     painted into the root layer). `translateZ(0)` gives the Universal
     column the same layer origin. Desktop web only: the phone shell
     measures 0 without it and 62 with it. */
  main: { flex: 1, paddingBottom: 20 },
  mainDesktopWebLayer: { transform: 'translateZ(0)' },
  /* parity: the phone chat column gives `.chat-input-bar` a 16px bottom
     pad, and the composer slot adds its own 6px — 22px under the shell,
     which is what the SPA measures at 390x844. */
  mainCompact: { paddingBottom: 16, zIndex: 0 },
  sidebarBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 80 },
  list: { flex: 1 },
  /* Baseline topbar (parity/topbar.css): borderless 52px bar on the page
     color, model switcher at the left, ghost icon actions at the right. */
  topbar: { height: 52, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 8 },
  topbarCompact: { height: 56, minHeight: 56 },
  topbarLeft: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0, flexShrink: 1 },
  topbarLeftCompact: { flex: 1, gap: 8 },
  topbarRight: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  topbarRightCompact: { gap: 8 },
  topbarBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  /* polish/mobile-shell.css: the phone header's toggle and new-chat circles
     are 40px (layout/app-shell.css) while find/share and the summary pill
     take --ui-control-touch (44px). Glyphs step to 24px on the phone and
     the groups gap 8px (parity/topbar.css keeps 4px only at ≥769px). */
  topbarBtnCompact: { width: 44, minWidth: 44, height: 44, minHeight: 44, borderRadius: 22 },
  topbarCircleCompact: { width: 40, minWidth: 40, height: 40, minHeight: 40, borderRadius: 20 },
  summaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, minWidth: 48, paddingHorizontal: 10, borderRadius: 18 },
  summaryBtnCompact: { height: 44, minWidth: 44, minHeight: 44, paddingHorizontal: 8, borderRadius: 22, gap: 0, alignItems: 'stretch', justifyContent: 'flex-start' },
  summaryText: { fontSize: 14, lineHeight: 20 },
  summaryTextCompact: { fontSize: 12, lineHeight: 20 },
  modelSwitcher: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 360, height: 36, paddingLeft: 10, paddingRight: 8, borderRadius: 10, minWidth: 0 },
  modelName: { fontSize: 18, lineHeight: 28, fontWeight: '600', flexShrink: 1 },
  modelSub: { fontSize: 18, lineHeight: 28, flexShrink: 1 },
  /* parity/topbar.css phone block: flex 1 1 0, height 36, padding 0 4px,
     gap 4px, name 600/15/24, model 13 tertiary, caret 14. */
  modelSwitcherCompact: { flex: 1, height: 36, maxWidth: '100%', gap: 4, paddingLeft: 4, paddingRight: 4, overflow: 'hidden' },
  modelNameCompact: { fontSize: 15, lineHeight: 24, fontWeight: '600', flexShrink: 0 },
  modelSubCompact: { fontSize: 13, lineHeight: 24, flexShrink: 1 },
  filterChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, maxWidth: '40%' },
  filterChipCompact: { maxWidth: 88, flexShrink: 1 },
  filterText: { fontSize: 13, lineHeight: 18 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8 },
  errorText: { flex: 1 },
  retryChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  noticeText: { paddingHorizontal: 12, paddingBottom: 4, fontSize: 13 },
  editBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 12 },
  editBannerText: { flex: 1, fontSize: 13 },
  editCancel: { paddingHorizontal: 8, paddingVertical: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
