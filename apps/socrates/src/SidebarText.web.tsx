import React from 'react';
import type { CSSProperties } from 'react';
import { WEB_FONT_FAMILY } from '@socrates/theme';
import type { UiLanguage } from '@socrates/ui';

export function SidebarLogoText({ label, color }: { label: string; color: string; language: UiLanguage }) {
  const style: CSSProperties = {
    color, fontFamily: WEB_FONT_FAMILY, fontSize: 15, fontWeight: 600, lineHeight: '20px',
    letterSpacing: '-0.45px', whiteSpace: 'nowrap',
  };
  return <span id="socrates-sidebar-logo-text" data-testid="socrates-sidebar-logo-text" style={style}>{label}</span>;
}

export function SidebarNavLabelBadge({ label, badge, color, badgeColor, borderColor, itemKey, compact }: {
  label: string; badge: string; color: string; badgeColor: string; borderColor: string; itemKey: string; language: UiLanguage; compact: boolean;
}) {
  /* `.nav-label-wrap` inherits the row's 14px/20px type, so the inline badge
   * sits on a 20px line box (an unstyled span here is 13.33px/normal Arial). */
  const wrapper: CSSProperties = compact
    ? { display: 'block', flex: '1 1 0%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'start', fontFamily: WEB_FONT_FAMILY, fontSize: 14, lineHeight: '20px' }
    : { display: 'block', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'start' };
  const labelStyle: CSSProperties = { color, fontFamily: WEB_FONT_FAMILY, fontSize: 14, fontWeight: 400, lineHeight: '20px', textAlign: 'start' };
  const badgeStyle: CSSProperties = {
    /* Same `.nav-new-badge` box on the phone drawer as on desktop (probed:
     * 2px 6px padding, 6px gap, 14px line height). */
    display: 'inline-block', marginLeft: 6,
    padding: '2px 6px', border: `1px solid ${borderColor}`, borderRadius: 999,
    color: badgeColor, fontFamily: WEB_FONT_FAMILY, fontSize: 10, fontWeight: 600,
    lineHeight: '14px', letterSpacing: '0.02em', verticalAlign: '1px', textAlign: 'start',
  };
  return <span style={wrapper}><span style={labelStyle}>{label}</span><span id={`socrates-sidebar-nav-badge-${itemKey}`} data-testid={`socrates-sidebar-nav-badge-${itemKey}`} style={badgeStyle}>{badge}</span></span>;
}
