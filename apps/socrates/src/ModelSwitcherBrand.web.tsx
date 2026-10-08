import React from 'react';
import type { CSSProperties } from 'react';
import { WEB_FONT_FAMILY } from '@socrates/theme';
import type { UiLanguage } from '@socrates/ui';

export function ModelSwitcherBrand({ label, color, compact }: { label: string; color: string; compact: boolean; language: UiLanguage }) {
  const style: CSSProperties = {
    color, fontFamily: WEB_FONT_FAMILY, fontSize: compact ? 15 : 18, fontWeight: 600,
    lineHeight: compact ? '24px' : '28px', flexShrink: compact ? 0 : 1, whiteSpace: 'nowrap',
  };
  return <span id="socrates-model-name" data-testid="socrates-model-name" style={style}>{label}</span>;
}
