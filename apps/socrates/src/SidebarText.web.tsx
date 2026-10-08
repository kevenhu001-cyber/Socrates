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
  const wrapper: CSSProperties = { display: 'block', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'start' };
  const labelStyle: CSSProperties = { color, fontFamily: WEB_FONT_FAMILY, fontSize: 14, fontWeight: 400, lineHeight: '20px', textAlign: 'start' };
  const badgeStyle: CSSProperties = {
    display: 'inline-block', marginLeft: compact ? 4 : 6,
    padding: compact ? '1px 6px 2px' : '2px 6px', border: `1px solid ${borderColor}`, borderRadius: 999,
    color: badgeColor, fontFamily: WEB_FONT_FAMILY, fontSize: 10, fontWeight: 600,
    lineHeight: compact ? '16px' : '14px', letterSpacing: '0.02em', verticalAlign: '1px', textAlign: 'start',
  };
  return <span style={wrapper}><span style={labelStyle}>{label}</span><span id={`socrates-sidebar-nav-badge-${itemKey}`} data-testid={`socrates-sidebar-nav-badge-${itemKey}`} style={badgeStyle}>{badge}</span></span>;
}
