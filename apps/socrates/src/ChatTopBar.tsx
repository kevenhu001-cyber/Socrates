import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { fontStyle, type ThemePaletteHex } from '@socrates/theme';
import { Icon, type UiStrings } from '@socrates/ui';
import type { AppStrings } from './strings';
import { ModelCaret } from './ModelCaret';
import { ModelSwitcherBrand } from './ModelSwitcherBrand';
import { styles } from './appStyles';

interface ChatTopBarProps {
  compact: boolean;
  sidebarOpen: boolean;
  projectFilter: string | null;
  projectName?: string;
  hasActiveSession: boolean;
  canShare: boolean;
  activeModelLabel: string;
  language: 'en' | 'zh';
  palette: ThemePaletteHex;
  appCopy: AppStrings;
  uiCopy: UiStrings;
  onOpenSidebar(): void;
  onOpenModelMenu(): void;
  onCreateSession(): void;
  onClearProjectFilter(): void;
  onOpenFind(): void;
  onOpenShare(): void;
}

/** Baseline topbar: model switcher and conversation actions. */
export function ChatTopBar({
  compact,
  sidebarOpen,
  projectFilter,
  projectName,
  hasActiveSession,
  canShare,
  activeModelLabel,
  language,
  palette,
  appCopy,
  uiCopy,
  onOpenSidebar,
  onOpenModelMenu,
  onCreateSession,
  onClearProjectFilter,
  onOpenFind,
  onOpenShare,
}: ChatTopBarProps) {
  const fam = (weight: 'regular' | 'medium' = 'regular') => fontStyle(weight, language, Platform.OS === 'web');

  return (
    <View style={[styles.topbar, compact && styles.topbarCompact]}>
      <View style={[styles.topbarLeft, compact && styles.topbarLeftCompact]}>
        {!sidebarOpen ? (
          <Pressable accessibilityRole="button" accessibilityLabel={appCopy.toggleSidebar} onPress={onOpenSidebar} style={[styles.topbarBtn, compact && styles.topbarCircleCompact]}>
            <Icon name={compact ? 'sidebar-toggle' : 'panel'} size={compact ? 24 : 20} color={compact ? palette.text.tertiary : palette.text.primary} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel={appCopy.openModelMenu} onPress={onOpenModelMenu} style={[styles.modelSwitcher, compact && styles.modelSwitcherCompact]}>
          <ModelSwitcherBrand label={uiCopy.brand} color={palette.text.primary} compact={compact} language={language} />
          <Text nativeID="socrates-model-subtitle" testID="socrates-model-subtitle" numberOfLines={1} style={[styles.modelSub, compact && styles.modelSubCompact, { color: palette.text.tertiary }, fam()]}>{activeModelLabel}</Text>
          <ModelCaret size={compact ? 14 : 16} color={palette.text.tertiary} />
        </Pressable>
      </View>
      <View style={[styles.topbarRight, compact && styles.topbarRightCompact]}>
        {/* The phone keeps New chat beside the model switcher while a chat is open. */}
        {compact && !sidebarOpen ? (
          <Pressable accessibilityRole="button" accessibilityLabel={uiCopy.newChat} onPress={onCreateSession} style={[styles.topbarBtn, styles.topbarCircleCompact]}>
            <Icon name="compose" size={24} color={palette.text.primary} />
          </Pressable>
        ) : null}
        {projectFilter ? (
          <Pressable accessibilityRole="button" accessibilityLabel={appCopy.clearProjectFilter(projectName || '')} onPress={onClearProjectFilter} style={[styles.filterChip, compact && styles.filterChipCompact]}>
            <Text numberOfLines={1} style={[styles.filterText, { color: palette.text.primary }, fam('medium')]}>📁 {projectName || 'Project'} ✕</Text>
          </Pressable>
        ) : null}
        {hasActiveSession ? (
          <>
            {!(compact && projectFilter) ? (
              <Pressable accessibilityRole="button" accessibilityLabel={uiCopy.artifactSummary} onPress={() => undefined} style={[styles.summaryBtn, compact && styles.summaryBtnCompact]}>
                <Icon name="summary" size={compact ? 16 : 18} color={compact ? palette.text.secondary : palette.text.primary} />
                <Text nativeID="socrates-topbar-summary-label" testID="socrates-topbar-summary-label" style={[styles.summaryText, compact && styles.summaryTextCompact, { color: compact ? palette.text.secondary : palette.text.primary }, fam(compact ? 'regular' : 'medium')]}>{uiCopy.artifactSummary}</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel={uiCopy.findInConversation} onPress={onOpenFind} style={[styles.topbarBtn, compact && styles.topbarBtnCompact]}>
              <Icon name="search" size={compact ? 24 : 18} color={compact ? palette.text.tertiary : palette.text.primary} />
            </Pressable>
            {canShare ? <Pressable accessibilityRole="button" accessibilityLabel={uiCopy.shareConversation} onPress={onOpenShare} style={[styles.topbarBtn, compact && styles.topbarBtnCompact]}>
              <Icon name="share" size={compact ? 24 : 18} color={compact ? palette.text.tertiary : palette.text.primary} />
            </Pressable> : null}
          </>
        ) : null}
      </View>
    </View>
  );
}
