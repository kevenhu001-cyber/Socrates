import React, { memo, useState } from 'react';
import { MessageContent, type MessageActions } from './MessageContent.tsx';
import type { Message, Session } from '@socrates/contracts';
import { fontFamily, getThemePaletteHex, getUiSurfaceHex, type FontWeight, type ThemeMode } from '@socrates/theme';
import { uiStrings, type UiLanguage } from './strings';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from './icons';

export { artifactFromFence, artifactsFromToolCalls, islandKindForLang, parseArtifactBridgeMessage, type ArtifactDescriptor } from './artifacts';
export { buildEmbeddedDocument } from './artifactDocument';
export { buildMathDocument } from './artifactDocument';
export { extractFootnoteDefinitions, splitMathSegments, stripCitationMarkers, type ContentSegment, type Footnote } from './math';
export { buildVisualizationDocument, isVisualizationSpec, paletteForDocument, visualizationSpecOf, visualizationSummary, type VisualizationSpec } from './visualization';
export { fileKindLabel, formatFileSize, isImageMime, storedFileIdFromRawUrl, storedFileIdsInText } from './fileMeta';
export { toolArtifacts, toolDurationLabel, toolInputPreview, toolLabel, toolState, type ToolArtifactRef } from './toolModel';
export { ExamView } from './ExamView.tsx';
export { DiagView } from './DiagView.tsx';
export { ModelPicker } from './ModelPicker.tsx';
export { AssistantPicker } from './AssistantPicker.tsx';
export { activeProviderOf, filterProviders, providerRowLabel, sortProvidersBuiltInFirst, type ProviderRowLabel } from './modelPicker';
export { activeAssistantOf, assistantConfigOf, assistantRowLabel, filterAssistants, type AssistantRowLabel } from './assistantPicker';
export { decodeEntities, parsePracticeInner, parseQuizInner, practiceAnswerMatches, splitTutorScaffolds, stripTags, type ParsedPractice, type ParsedQuiz, type QuizOption, type ScaffoldSegment } from './scaffolds';
export {
  applyDiagnosticResults, BASELINE_LEVEL, buildColdStartNodes, buildDiagPrompt, buildTeachingPlanFromKB,
  buildTutorVoice, cleanTopicDomain, DIAG_ASPECTS, diagError, diagnosticPointsForNode,
  extractDiagQuestionsBalanced,
  fromBasicsDirective, isSubstantiveAnswer, nextTeachingStage, normalizeDiagQuestions,
  parseDiagResponse, stageInstruction, syncCurrentNodeFromTeachingPlan, TEACHING_STAGES,
  tutorTurnDirective, type ColdStartNode, type DiagAnswerState, type DiagLevel, type DiagOption,
  type DiagQuestion, type TeachingPlan, type TeachingStage, type TeachingSubtopic,
} from './tutor';
export { detectExamLanguage, examAnswersOf, examGenerationPrompt, examProgress, examPromptTypes, gradeExam, missingExamAnswers, parseExamQuestionResponse, parseExamQuestions, type ExamQuestion, type ExamQuestionType } from './examModel';
export type { MessageActions, PracticeSubmission, QuizPick } from './MessageContent.tsx';
export { uiStrings, type UiLanguage, type UiStrings } from './strings';
export { Icon, GLYPHS, type IconName } from './icons';

// Legacy light-only export kept for compat; new code should pass mode
// explicitly (frontend baseline supports light + dark).
export const colors = { bg: '#ffffff', sidebar: '#f7f7f8', text: '#0d0d0d', muted: '#6b6b6b', border: '#e5e5e5', user: '#f4f4f4' } as const;

export type UiMode = ThemeMode;

/* ── Baseline metrics (frontend/src/styles) ───────────────────────────────
 * Sidebar  : parity/sidebar.css — 260px column, 52px header, 36px rows
 *            (radius 10, 6/10 padding, 20px glyphs), 32px footer buttons.
 * Transcript: parity/transcript.css — 768px column, 16/28 prose, user
 *            bubble radius 18 / max 70% / #202020, 32px icon toolbar.
 * Composer : parity/composer-unified.css — 52px capsule, radius 28,
 *            padding 7/10/7/8, 36px round controls, 4px gaps.
 * Tokens   : styles/tokens.css + styles/themes.css (dark values shown).
 * ---------------------------------------------------------------------- */
const SIDEBAR_WIDTH = 260;
const SIDEBAR_WIDTH_COMPACT = 254;
const HEADER_HEIGHT = 52;
const HEADER_HEIGHT_COMPACT = 56;
const ROW_HEIGHT = 36;
const CONTENT_WIDTH = 768;

function paletteFor(mode: UiMode = 'light') {
  return getThemePaletteHex(mode);
}

/** Baseline font stack per weight (`--font-sans`: Inter, then Noto Sans SC
 *  for CJK). RNW Text inherits from a parent Text, so only the outermost
 *  text of each block needs the family; nested Inline copies it. */
const fam = (language: UiLanguage, weight: FontWeight = 'regular') => ({ fontFamily: fontFamily(weight, language) });

/* ── Sidebar ─────────────────────────────────────────────────────────────── */

export interface SidebarNavItem {
  key: string;
  label: string;
  icon: IconName;
  accessibilityLabel?: string;
  /** Trailing keyboard hint on the primary row (baseline: ⌘K). */
  kbd?: string;
  /** Trailing pill (baseline: "New" on Sites). */
  badge?: string;
  /** Highlighted like the active nav row. */
  active?: boolean;
  /** Submenu entries (baseline "More"): pressing the row opens them. */
  menu?: Array<{ label: string; onPress(): void }>;
  onPress(): void;
}

export interface SidebarUser {
  initials: string;
  name: string;
  /** Plan tier line under the name (baseline: "Free"). */
  plan: string;
}

export interface SidebarSessionActions {
  archive?(id: string): void;
  unarchive?(id: string): void;
  remove?(id: string): void;
  move?(id: string): void;
}

/** Pure navigation chrome: the baseline sidebar renders the logo header,
 *  the nav rows, the search row, the recents list and the account footer —
 *  no session actions inline (they live in the row's ⋯ menu). */
export function Sidebar({
  sessions,
  activeId,
  onSelect,
  onNewChat,
  nav = [],
  onOpenSearch,
  user = null,
  themeIcon = 'moon',
  onToggleTheme,
  onOpenDisplaySettings,
  onOpenSettings,
  onToggleSidebar,
  /** Brand logo (host supplies the asset so the package stays require-free). */
  logoSource,
  sessionActions,
  archived = [],
  onSelectArchived,
  mode = 'light',
  language = 'en',
  compact = false,
}: {
  sessions: Session[];
  activeId: string | null;
  onSelect(id: string): void;
  onNewChat(): void;
  /** Extra nav rows between New chat and the search row; defaults to the
   *  baseline set when omitted. */
  nav?: SidebarNavItem[];
  onOpenSearch?(): void;
  user?: SidebarUser | null;
  /** Which theme glyph the footer shows (the one you switch *to*). */
  themeIcon?: 'sun' | 'moon';
  onToggleTheme?(): void;
  onOpenDisplaySettings?(): void;
  onOpenSettings?(): void;
  /** Header toggle: collapses the rail on desktop, closes the drawer on phones. */
  onToggleSidebar?(): void;
  logoSource?: { uri: string };
  sessionActions?: SidebarSessionActions;
  /** Archived rows stay in the list, muted, with Unarchive in the ⋯ menu. */
  archived?: Session[];
  onSelectArchived?(id: string): void;
  mode?: UiMode;
  language?: UiLanguage;
  /** ≤768px: the 254px drawer. */
  compact?: boolean;
}) {
  const p = paletteFor(mode);
  const s = getUiSurfaceHex(mode);
  const t = uiStrings(language);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [navMenu, setNavMenu] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const titleOf = (item: Session) => item.title || item.topic || t.untitled;
  const rows = [...sessions.map((item) => ({ item, isArchived: false }))];
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groupedRows = rows.map((row) => {
    const date = new Date(row.item.updatedAt || row.item.createdAt || now);
    const time = Number.isFinite(date.getTime()) ? date.getTime() : now.getTime();
    const group = row.item.pinned ? 'pinned'
      : time >= todayStart ? 'today'
        : time >= todayStart - 86_400_000 ? 'yesterday'
          : time >= todayStart - 7 * 86_400_000 ? 'previous7Days'
            : time >= todayStart - 30 * 86_400_000 ? 'previous30Days'
              : date.getFullYear() === now.getFullYear() ? `month:${date.getMonth()}` : `year:${date.getFullYear()}`;
    const label = group === 'today' ? t.today
      : group === 'yesterday' ? t.yesterday
        : group === 'previous7Days' ? t.previous7Days
          : group === 'previous30Days' ? t.previous30Days
            : group === 'pinned' ? t.pinned
              : group.startsWith('month:') ? new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'long' }).format(date)
                : group.slice('year:'.length);
    return { ...row, group, label };
  });
  const openRow = (id: string) => {
    const archivedRow = archived.some((item) => item.id === id);
    if (archivedRow) onSelectArchived?.(id);
    else onSelect(id);
  };
  return (
    <View style={[styles.sidebar, compact && styles.sidebarCompact, { backgroundColor: s.sidebar, borderRightColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.10)' }]}>
      {/* Header: logo · new chat · toggle; search stays in the nav row below. */}
      <View style={[styles.header, compact && { height: HEADER_HEIGHT_COMPACT }]}>
        <View style={styles.logo}>
          {logoSource ? <Image source={logoSource} style={styles.logoImg} resizeMode="cover" accessibilityLabel={t.brand} /> : null}
          <Text numberOfLines={1} style={[styles.logoText, { color: p.text.primary }, fam(language, 'semibold')]}>{t.brand}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={t.startNewChat} onPress={onNewChat} style={styles.headerBtn}><Icon name="new-chat" size={20} color={p.text.secondary} /></Pressable>
          {onToggleSidebar ? (
            <Pressable accessibilityRole="button" accessibilityLabel={compact ? t.closeSidebar : t.closeSidebar} onPress={onToggleSidebar} style={styles.headerBtn}><Icon name={compact ? 'close' : 'panel'} size={20} color={p.text.secondary} /></Pressable>
          ) : null}
        </View>
      </View>

      {/* Nav rows */}
      <View style={styles.nav}>
        {nav.map((item) => (
          <View key={item.key}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.accessibilityLabel || item.label}
              accessibilityState={item.active ? { selected: true } : item.menu ? { expanded: navMenu === item.key } : undefined}
              onPress={() => {
                if (item.menu) setNavMenu((key) => (key === item.key ? null : item.key));
                item.onPress();
              }}
              style={[styles.navRow, compact && styles.navRowCompact, (item.active || hoverId === item.key || navMenu === item.key) && { backgroundColor: p.bg.hover }]}
              onHoverIn={() => setHoverId(item.key)}
              onHoverOut={() => setHoverId((id) => (id === item.key ? null : id))}
            >
              <Icon name={item.icon} size={20} color={p.text.primary} />
              <Text numberOfLines={1} style={[styles.rowLabel, { color: p.text.primary }, fam(language)]}>{item.label}</Text>
              {item.kbd ? <Text style={[styles.rowKbd, { color: p.text.muted }, fam(language)]}>{item.kbd}</Text> : null}
              {item.badge ? <View style={[styles.rowBadge, { backgroundColor: p.bg.hover }]}><Text style={[styles.rowBadgeText, { color: p.text.secondary }, fam(language, 'medium')]}>{item.badge}</Text></View> : null}
            </Pressable>
            {item.menu && navMenu === item.key ? (
              <View style={[styles.rowMenu, { backgroundColor: p.bg.overlay, borderColor: p.border.subtle }]}>
                {item.menu.map((entry) => (
                  <Pressable key={entry.label} accessibilityRole="button" accessibilityLabel={entry.label} onPress={() => { setNavMenu(null); entry.onPress(); }} style={styles.menuItem}>
                    <Text style={[styles.menuItemText, { color: p.text.primary }, fam(language)]}>{entry.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </View>

      {/* Search row */}
      {onOpenSearch ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t.openSearch} onPress={onOpenSearch} style={[styles.searchRow, compact && styles.searchRowCompact]}>
          <Icon name="search" size={20} color={p.text.primary} />
          <Text numberOfLines={1} style={[styles.rowLabel, { color: p.text.primary }, fam(language)]}>{t.searchChats}</Text>
        </Pressable>
      ) : null}

      {/* Recents */}
      <ScrollView style={styles.recents} contentContainerStyle={styles.recentsContent}>
        <Text style={[styles.recentsTitle, { color: p.text.tertiary }, fam(language)]}>{t.recents}</Text>
        {groupedRows.map(({ item, isArchived, group, label }, index) => {
          const active = item.id === activeId;
          const showGroup = !compact && groupedRows[index - 1]?.group !== group;
          return (
            <View key={item.id} style={menuId === item.id && styles.sessionMenuOpen}>
              {showGroup ? <Text style={[styles.recentsTimeLabel, index === 0 && styles.recentsTimeLabelFirst, { color: p.text.muted }, fam(language, 'medium')]}>{label}</Text> : null}
              <View
                onPointerEnter={() => setHoverId(item.id)}
                onPointerLeave={() => setHoverId((id) => (id === item.id ? null : id))}
                style={[styles.sessionRow, compact && styles.sessionRowCompact, (active || hoverId === item.id) && { backgroundColor: p.bg.hover }]}
              >
                <Pressable
                accessibilityRole="button"
                accessibilityLabel={titleOf(item)}
                accessibilityState={{ selected: active }}
                onPress={() => openRow(item.id)}
                style={styles.sessionRowMain}
              >
                {!compact ? <View style={[styles.modeDot, { backgroundColor: p.text.muted }]} /> : null}
                <Text numberOfLines={1} style={[styles.rowLabel, isArchived ? { color: p.text.muted } : { color: p.text.primary }, fam(language)]}>{titleOf(item)}</Text>
                </Pressable>
                {sessionActions ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={t.sessionActionsOf(titleOf(item))} onPress={() => setMenuId((id) => (id === item.id ? null : item.id))} style={[styles.overflowBtn, !compact && hoverId !== item.id && styles.overflowHidden]}>
                    <Icon name="more" size={16} color={p.text.tertiary} />
                  </Pressable>
                ) : null}
              </View>
              {menuId === item.id && sessionActions ? (
                <View style={[styles.rowMenu, { backgroundColor: p.bg.overlay, borderColor: p.border.subtle }]}>
                  {sessionActions.move ? <Pressable accessibilityRole="button" accessibilityLabel={t.moveToProjectOf(titleOf(item))} onPress={() => { setMenuId(null); sessionActions.move!(item.id); }} style={styles.menuItem}><Text style={[styles.menuItemText, { color: p.text.primary }, fam(language)]}>{t.moveToProject}</Text></Pressable> : null}
                  {isArchived
                    ? sessionActions.unarchive ? <Pressable accessibilityRole="button" accessibilityLabel={t.unarchiveSessionOf(titleOf(item))} onPress={() => { setMenuId(null); sessionActions.unarchive!(item.id); }} style={styles.menuItem}><Text style={[styles.menuItemText, { color: p.text.primary }, fam(language)]}>{t.restoreSession(titleOf(item))}</Text></Pressable> : null
                    : sessionActions.archive ? <Pressable accessibilityRole="button" accessibilityLabel={t.archiveSessionOf(titleOf(item))} onPress={() => { setMenuId(null); sessionActions.archive!(item.id); }} style={styles.menuItem}><Text style={[styles.menuItemText, { color: p.text.primary }, fam(language)]}>{t.archiveSession}</Text></Pressable> : null}
                  {sessionActions.remove ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={confirmId === item.id ? t.confirmDeleteSessionOf(titleOf(item)) : t.deleteSessionOf(titleOf(item))}
                      onPress={() => {
                        if (confirmId === item.id) { setMenuId(null); setConfirmId(null); sessionActions.remove!(item.id); }
                        else setConfirmId(item.id);
                      }}
                      style={[styles.menuItem, confirmId === item.id && { backgroundColor: p.danger }]}
                    >
                      <Text style={[styles.menuItemText, { color: confirmId === item.id ? p.onAccent : p.danger }, fam(language)]}>
                        {confirmId === item.id ? t.confirmDeleteSessionOf(titleOf(item)) : t.deleteSessionOf(titleOf(item))}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
        {/* Baseline keeps archived rows out of Recents (they live in the
            storage modal); the app surfaces them behind this opt-in until
            that modal exists. */}
        {archived.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel={showArchived ? t.hideArchived : t.showArchived(archived.length)} onPress={() => setShowArchived((open) => !open)} style={styles.archivedToggle}>
            <Text numberOfLines={1} style={[styles.rowLabel, { color: p.text.muted }, fam(language)]}>{showArchived ? t.hideArchived : t.showArchived(archived.length)}</Text>
          </Pressable>
        ) : null}
        {archived.length && showArchived ? archived.map((item) => (
          <View key={item.id} style={menuId === item.id && styles.sessionMenuOpen}>
            <View
              onPointerEnter={() => setHoverId(item.id)}
              onPointerLeave={() => setHoverId((id) => (id === item.id ? null : id))}
              style={[styles.sessionRow, compact && styles.sessionRowCompact, hoverId === item.id && { backgroundColor: p.bg.hover }]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={titleOf(item)}
                accessibilityState={{ selected: false }}
                onPress={() => onSelectArchived?.(item.id)}
                style={styles.sessionRowMain}
              >
                <Text numberOfLines={1} style={[styles.rowLabel, { color: p.text.muted }, fam(language)]}>{titleOf(item)}</Text>
              </Pressable>
              {sessionActions ? (
                <Pressable accessibilityRole="button" accessibilityLabel={t.sessionActionsOf(titleOf(item))} onPress={() => setMenuId((id) => (id === item.id ? null : item.id))} style={[styles.overflowBtn, !compact && hoverId !== item.id && styles.overflowHidden]}>
                  <Icon name="more" size={16} color={p.text.tertiary} />
                </Pressable>
              ) : null}
              {sessionActions?.unarchive ? (
                <Pressable accessibilityRole="button" accessibilityLabel={t.restoreSession(titleOf(item))} onPress={() => sessionActions.unarchive!(item.id)} style={styles.overflowBtn}>
                  <Icon name="regenerate" size={16} color={p.text.tertiary} />
                </Pressable>
              ) : null}
            </View>
            {menuId === item.id && sessionActions ? (
              <View style={[styles.rowMenu, { backgroundColor: p.bg.overlay, borderColor: p.border.subtle }]}>
                {sessionActions.unarchive ? <Pressable accessibilityRole="button" accessibilityLabel={t.restoreSession(titleOf(item))} onPress={() => { setMenuId(null); sessionActions.unarchive!(item.id); }} style={styles.menuItem}><Text style={[styles.menuItemText, { color: p.text.primary }, fam(language)]}>{t.restoreSession(titleOf(item))}</Text></Pressable> : null}
                {sessionActions.remove ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={confirmId === item.id ? t.confirmDeleteSessionOf(titleOf(item)) : t.deleteSessionOf(titleOf(item))}
                    onPress={() => {
                      if (confirmId === item.id) { setMenuId(null); setConfirmId(null); sessionActions.remove!(item.id); }
                      else setConfirmId(item.id);
                    }}
                    style={[styles.menuItem, confirmId === item.id && { backgroundColor: p.danger }]}
                  >
                    <Text style={[styles.menuItemText, { color: confirmId === item.id ? p.onAccent : p.danger }, fam(language)]}>
                      {confirmId === item.id ? t.confirmDeleteSessionOf(titleOf(item)) : t.deleteSessionOf(titleOf(item))}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        )) : null}
      </ScrollView>

      {/* Footer: account row + quick actions */}
      <View style={[styles.footer, { borderTopColor: p.border.subtle }]}>
        <View style={styles.userRow}>
          <View style={[styles.avatar, { backgroundColor: s.avatar }]}>
            <Text style={[styles.avatarText, fam(language, 'semibold')]}>{user?.initials || '?'}</Text>
          </View>
          <View style={styles.identity}>
            <Text numberOfLines={1} style={[styles.userName, { color: p.text.primary }, fam(language, 'medium')]}>{user?.name || t.brand}</Text>
            <Text numberOfLines={1} style={[styles.userPlan, { color: p.text.muted }, fam(language)]}>{user?.plan || ''}</Text>
          </View>
        </View>
        <View style={styles.footerActions}>
          {onToggleTheme ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t.toggleTheme} onPress={onToggleTheme} style={styles.footerBtn}><Icon name={themeIcon} size={16} color={p.text.secondary} /></Pressable>
          ) : null}
          {onOpenDisplaySettings ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t.displaySettings} onPress={onOpenDisplaySettings} style={styles.footerBtn}><Icon name="sliders" size={16} color={p.text.secondary} /></Pressable>
          ) : null}
          {onOpenSettings ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t.openSettings} onPress={onOpenSettings} style={styles.footerBtn}><Icon name="gear" size={16} color={p.text.secondary} /></Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/* ── Message toolbar (baseline .msg-toolbar) ─────────────────────────────── */

function ToolbarButton({ label, icon, onPress, color, hover, size = 18 }: { label: string; icon: IconName; onPress(): void; color: string; hover: string; size?: number }) {
  const [over, setOver] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onHoverIn={() => setOver(true)}
      onHoverOut={() => setOver(false)}
      style={[styles.toolBtn, size === 16 && styles.toolBtnCompact, over && { backgroundColor: hover }]}
    >
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

function MessageToolbar({ message, language, actions, ghost, hover, compact, hovered }: { message: Message; language: UiLanguage; actions: MessageActions; ghost: string; hover: string; compact: boolean; hovered: boolean }) {
  const t = uiStrings(language);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await actions.onCopyText?.(message.rawText || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); }
  };
  const user = message.role === 'user';
  const assistant = message.role === 'assistant' && (message.rawText || '').trim().length > 0;
  const userEditable = user && (message.rawText || '').trim().length > 0;
  if (!actions.onCopyText && !actions.onEditMessage && !actions.onDeleteMessage && !actions.onShareMessage && !actions.onRegenerateMessage && !actions.onThumbsUpMessage && !actions.onThumbsDownMessage && !actions.onBranchMessage && !actions.onReExplainMessage && !actions.onSpeakText) return null;
  const iconSize = compact ? 16 : 18;
  const opacity = user ? (compact ? (hovered ? 1 : 0.7) : hovered ? 1 : 0) : 1;
  return (
    <View style={[styles.toolbar, compact && styles.toolbarCompact, user ? styles.toolbarUser : styles.toolbarAssistant, { opacity }]}>
      {actions.onCopyText ? <ToolbarButton size={iconSize} label={copied ? t.copiedMessage : t.copyMessage} icon={copied ? 'check' : 'copy'} onPress={() => void copy()} color={ghost} hover={hover} /> : null}
      {userEditable && actions.onEditMessage ? <ToolbarButton size={iconSize} label={t.editMessage} icon="edit" onPress={() => actions.onEditMessage!(message)} color={ghost} hover={hover} /> : null}
      {userEditable ? <ToolbarButton size={iconSize} label={t.deleteMessage} icon="delete" onPress={() => actions.onDeleteMessage?.(message)} color={ghost} hover={hover} /> : null}
      {assistant ? <>
        <ToolbarButton size={iconSize} label={t.shareConversation} icon="share" onPress={() => actions.onShareMessage?.(message)} color={ghost} hover={hover} />
        <ToolbarButton size={iconSize} label={t.regenerateMessage} icon="regenerate" onPress={() => actions.onRegenerateMessage?.(message)} color={ghost} hover={hover} />
        <ToolbarButton size={iconSize} label={t.helpful} icon="thumb-up" onPress={() => actions.onThumbsUpMessage?.(message)} color={ghost} hover={hover} />
        <ToolbarButton size={iconSize} label={t.notHelpful} icon="thumb-down" onPress={() => actions.onThumbsDownMessage?.(message)} color={ghost} hover={hover} />
        <ToolbarButton size={iconSize} label={t.branchMessage} icon="branch" onPress={() => actions.onBranchMessage?.(message)} color={ghost} hover={hover} />
        <ToolbarButton size={iconSize} label={t.reExplain} icon="bulb" onPress={() => actions.onReExplainMessage?.(message)} color={ghost} hover={hover} />
        <ToolbarButton size={iconSize} label={t.listenMessage} icon="speaker" onPress={() => actions.onSpeakText?.(message.rawText || '')} color={ghost} hover={hover} />
      </> : null}
    </View>
  );
}

const MessageRow = memo(function MessageRow({ message, mode = 'light', language = 'en', compact = false, previousRole, first, ...actions }: { message: Message; mode?: UiMode; language?: UiLanguage; compact?: boolean; previousRole?: string; first?: boolean } & MessageActions) {
  const p = paletteFor(mode);
  const s = getUiSurfaceHex(mode);
  const user = message.role === 'user';
  const [hovered, setHovered] = useState(false);
  // Baseline rhythm: first turn has no top gap, every later turn 20px, and
  // an assistant turn followed by a user turn gets 40px.
  const gapTop = first ? 0 : user && previousRole === 'assistant' ? 40 : compact && previousRole === 'user' ? 24 : 20;
  return (
    <Animated.View
      layout={LinearTransition}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={[styles.msg, { marginTop: gapTop }, user && styles.msgUser]}
    >
      <View style={user ? [styles.bubble, compact && styles.bubbleCompact, { backgroundColor: compact ? s.bubbleStrong : s.bubble }] : undefined}>
        <MessageContent message={message} mode={mode} language={language} compact={compact} {...actions} />
      </View>
      <MessageToolbar message={message} language={language} actions={actions} ghost={p.text.secondary} hover={s.hoverGhost} compact={compact} hovered={hovered} />
    </Animated.View>
  );
});

export function ChatMessageList({
  messages,
  mode = 'light',
  language = 'en',
  emptyText,
  compact = false,
  style,
  ...actions
}: {
  messages: Message[];
  mode?: UiMode;
  language?: UiLanguage;
  emptyText?: string;
  /** ≤768px: 16px gutters, 20px top pad, 15px bubble radius. */
  compact?: boolean;
  /** Host layout (the list is the flex child that scrolls). */
  style?: StyleProp<ViewStyle>;
} & MessageActions) {
  const p = paletteFor(mode);
  const t = uiStrings(language);
  if (!messages.length) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: p.text.muted }, fam(language)]}>{emptyText ?? t.emptyChat}</Text>
      </View>
    );
  }
  return (
<FlatList
      style={style}
      contentContainerStyle={[styles.messages, compact && styles.messagesCompact]}
      data={messages}
      keyExtractor={(item, index) => item.id || item.clientId || String(index)}
      renderItem={({ item, index }) => <MessageRow message={item} mode={mode} language={language} compact={compact} first={index === 0} previousRole={index > 0 ? messages[index - 1].role : undefined} {...actions} />}
    />
  );
}

/* ── Composer (baseline .composer-shell) ─────────────────────────────────── */

export function Composer({
  value,
  streaming,
  onChangeText,
  onSend,
  onStop,
  mode = 'light',
  language = 'en',
  attachments = [],
  canCapturePhoto = false,
  voiceInputSupported = false,
  listening = false,
  compact = false,
  onPickImages,
  onTakePhoto,
  onPickFile,
  onRemoveAttachment,
  onToggleListen,
}: {
  value: string;
  streaming?: boolean;
  onChangeText(value: string): void;
  onSend(): void;
  onStop(): void;
  mode?: UiMode;
  language?: UiLanguage;
  /** Staged files (chips with remove); picking stays in the host app. */
  attachments?: Array<{ id: string; name: string }>;
  canCapturePhoto?: boolean;
  voiceInputSupported?: boolean;
  listening?: boolean;
  /** ≤768px: two storeys (editor over the control rail), filled controls. */
  compact?: boolean;
  onPickImages?(): void;
  onTakePhoto?(): void;
  onPickFile?(): void;
  onRemoveAttachment?(id: string): void;
  onToggleListen?(): void;
}) {
  const p = paletteFor(mode);
  const s = getUiSurfaceHex(mode);
  const t = uiStrings(language);
  const [menuOpen, setMenuOpen] = useState(false);
  const enabled = value.trim().length > 0 || attachments.length > 0;
  const idleVoice = !streaming && !enabled && voiceInputSupported && !!onToggleListen;
  const attachItems = [
    onPickImages ? { label: t.attachPhotos, run: onPickImages } : null,
    canCapturePhoto && onTakePhoto ? { label: t.takePhoto, run: onTakePhoto } : null,
    onPickFile ? { label: t.attachFile, run: onPickFile } : null,
  ].filter(Boolean) as Array<{ label: string; run(): void }>;
  // Baseline primary control: stop while streaming, send with a draft,
  // disabled otherwise (baseline's idle voice glyph needs voice mode).
  const primary = streaming ? 'stop' : enabled ? 'send' : idleVoice ? 'voice' : 'send';
  const primaryLabel = streaming ? t.stopGenerating : t.sendMessage;
  const primaryRun = () => {
    if (streaming) { onStop(); return; }
    if (enabled) onSend();
    else if (idleVoice) onToggleListen?.();
  };
  const input = (
    <TextInput
      accessibilityLabel={t.messagePlaceholder}
      multiline
      numberOfLines={1}
      value={value}
      onChangeText={onChangeText}
      placeholder={t.messagePlaceholder}
      placeholderTextColor={s.placeholder}
      style={[styles.input, compact && styles.inputCompact, { color: p.text.primary }, fam(language)]}
      onSubmitEditing={() => enabled && !streaming && onSend()}
    />
  );
  return (
    <View style={[styles.composerSlot, compact && styles.composerSlotCompact, { backgroundColor: p.bg.page }]}>
      <View style={[styles.shell, compact && styles.shellCompact, { borderColor: s.composerBorder, backgroundColor: s.composer }]}>
        {attachments.length > 0 ? (
          <View style={styles.attachBar}>
            {attachments.map((attachment) => (
              <View key={attachment.id} style={[styles.chip, { backgroundColor: s.chip }]}>
                <Text numberOfLines={1} style={[styles.chipText, { color: p.text.secondary }, fam(language, 'medium')]}>📎 {attachment.name}</Text>
                {onRemoveAttachment ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={t.removeAttachment(attachment.name)} onPress={() => onRemoveAttachment(attachment.id)} style={styles.chipX}>
                    <Text style={[styles.chipText, { color: p.text.muted }, fam(language)]}>✕</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
        {compact ? input : null}
        <View style={[styles.controlsRow, compact && styles.controlsRowCompact]}>
          {attachItems.length ? (
            <View>
              <Pressable accessibilityRole="button" accessibilityLabel={t.addAttachments} accessibilityState={{ expanded: menuOpen }} onPress={() => setMenuOpen((open) => !open)} style={[styles.roundBtn, compact && { backgroundColor: p.bg.hover }]}>
                <Icon name="plus" size={20} color={p.text.primary} />
              </Pressable>
              {menuOpen ? (
                <View style={[styles.plusMenu, { backgroundColor: p.bg.overlay, borderColor: p.border.subtle }]}>
                  {attachItems.map((item) => (
                    <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => { setMenuOpen(false); item.run(); }} style={styles.menuItem}>
                      <Text style={[styles.menuItemText, { color: p.text.primary }, fam(language)]}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
          {compact ? <View style={styles.controlsSpacerCompact} /> : null}
          {!compact ? input : null}
          {!compact ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t.reasoning} onPress={() => undefined} style={styles.effortBtn}>
              <Text style={[styles.effortText, { color: p.text.secondary }, fam(language)]}>{t.thinkingEffort}</Text>
              <Text style={[styles.effortText, { color: p.text.secondary }, fam(language)]}>{t.effortMedium}</Text>
              <Icon name="caret" size={14} color={p.text.muted} />
            </Pressable>
          ) : null}
          {voiceInputSupported && onToggleListen ? (
            <Pressable accessibilityRole="button" accessibilityLabel={listening ? t.stopVoiceInput : t.startVoiceInput} accessibilityState={{ expanded: listening }} onPress={onToggleListen} style={[styles.roundBtn, compact && { backgroundColor: p.bg.hover }]}>
              <Icon name="mic" size={20} color={listening ? p.danger : p.text.primary} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            disabled={!streaming && !enabled && !idleVoice}
            onPress={primaryRun}
            style={[styles.roundBtn, styles.send, { backgroundColor: p.text.primary }, !streaming && !enabled && !idleVoice && styles.sendDisabled]}
          >
            <Icon name={primary} size={20} color={p.onAccent} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Sidebar — baseline renders `.btn`-floored 40px header buttons, 36px rows
     with the 12px radius (parity/sidebar.css ≥769px override) and 32px
     footer buttons. */
  sidebar: { width: SIDEBAR_WIDTH, height: '100%', padding: 0, borderRightWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  sidebarCompact: { width: SIDEBAR_WIDTH_COMPACT },
  header: { height: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 8, borderRadius: 10, minWidth: 0 },
  logoImg: { width: 24, height: 24, borderRadius: 6 },
  logoText: { fontSize: 15, lineHeight: 20 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  nav: { paddingHorizontal: 6, paddingBottom: 8, gap: 0 },
  /* ≥769px rows use --ui-radius-lg (12px); the phone drawer keeps
     --ui-radius-row (10px) — parity/sidebar.css:504 + tokens.css. */
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%', height: ROW_HEIGHT, minHeight: ROW_HEIGHT, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  navRowCompact: { borderRadius: 10 },
  rowLabel: { fontSize: 14, lineHeight: 20, flexShrink: 1 },
  rowKbd: { fontSize: 12, lineHeight: 16, marginLeft: 'auto' },
  rowBadge: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 4 },
  rowBadgeText: { fontSize: 11, lineHeight: 16 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 6, height: ROW_HEIGHT, paddingHorizontal: 10, borderRadius: 12 },
  searchRowCompact: { borderRadius: 10 },
  recents: { flex: 1, paddingHorizontal: 6, paddingBottom: 8 },
  recentsContent: { paddingBottom: 8 },
  archivedToggle: { height: 32, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8 },
  recentsTitle: { fontSize: 14, lineHeight: 20, paddingTop: 20, paddingBottom: 6, paddingHorizontal: 10, textTransform: 'uppercase' },
  recentsTimeLabel: { paddingHorizontal: 10, paddingTop: 12, paddingBottom: 4, fontSize: 12, lineHeight: 16, fontWeight: '500' },
  recentsTimeLabelFirst: { paddingTop: 0 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', height: ROW_HEIGHT, minHeight: ROW_HEIGHT, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  sessionRowCompact: { borderRadius: 10 },
  sessionRowMain: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, height: '100%' },
  modeDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  overflowBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 6, marginLeft: 'auto' },
  overflowHidden: { opacity: 0 },
  sessionMenuOpen: { position: 'relative', zIndex: 60 },
  rowMenu: { position: 'absolute', top: ROW_HEIGHT - 2, right: 6, zIndex: 60, minWidth: 180, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 6, gap: 2 },
  menuItem: { height: 32, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8 },
  menuItemText: { fontSize: 14, lineHeight: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, borderTopWidth: StyleSheet.hairlineWidth },
  userRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ffffff', fontSize: 12, lineHeight: 16 },
  identity: { flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 },
  userName: { fontSize: 13, lineHeight: 17 },
  userPlan: { fontSize: 12, lineHeight: 16 },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  footerBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },

  /* Transcript */
  messages: { width: '100%', maxWidth: CONTENT_WIDTH + 40, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24 },
  msg: { width: '100%', padding: 0 },
  msgUser: { alignItems: 'flex-end' },
  /* ≤768px the bubble switches to --ui-bg-bubble-strong and 15px radius. */
  bubble: { maxWidth: '70%', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10 },
  bubbleCompact: { maxWidth: '88%', borderRadius: 15 },
  messagesCompact: { paddingHorizontal: 16, paddingTop: 20 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 0, height: 28, marginTop: 4 },
  toolbarCompact: { height: 32, marginTop: 6, gap: 4 },
  toolbarAssistant: { marginLeft: -6 },
  toolbarUser: { marginRight: -6, justifyContent: 'flex-end' },
  toolBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  toolBtnCompact: { width: 32, height: 32 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 16, lineHeight: 28, textAlign: 'center' },

  /* ── Composer ───────────────────────────────────────────────────────── */
  composerSlot: { width: '100%', alignItems: 'center', paddingBottom: 6 },
  composerSlotCompact: { paddingHorizontal: 16 },
  shell: { width: '100%', maxWidth: CONTENT_WIDTH, minHeight: 52, borderRadius: 28, borderWidth: 1, paddingTop: 7, paddingBottom: 7, paddingLeft: 8, paddingRight: 10, gap: 4 },
  shellCompact: { paddingTop: 12, paddingBottom: 8, rowGap: 3 },
  attachBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingTop: 8, paddingHorizontal: 2, marginLeft: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, gap: 8, maxWidth: 220 },
  chipText: { fontSize: 14, lineHeight: 20, flexShrink: 1 },
  chipX: { paddingHorizontal: 4 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
  controlsRowCompact: { width: '100%', minHeight: 36 },
  controlsSpacerCompact: { flex: 1 },
  roundBtn: { width: 36, height: 36, minWidth: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  send: { backgroundColor: '#e8e8e8' },
  sendDisabled: { opacity: 0.3 },
  effortBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 36, minHeight: 36, paddingLeft: 12, paddingRight: 10, borderRadius: 18 },
  effortText: { fontSize: 14, lineHeight: 20 },
  plusMenu: { position: 'absolute', bottom: 44, left: 0, zIndex: 60, minWidth: 180, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 6, gap: 2 },
  input: { flex: 1, height: 36, minHeight: 24, maxHeight: 336, fontSize: 16, lineHeight: 24, paddingVertical: 6, paddingHorizontal: 8 },
  inputCompact: { width: '100%', height: 24, flex: 0, fontSize: 15.75, lineHeight: 23.625, paddingVertical: 0 },
});
