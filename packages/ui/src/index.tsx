import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { MessageContent, type MessageActions } from './MessageContent.tsx';
import type { Message, Mistake, Session } from '@socrates/contracts';
import { fontStyle, getThemePaletteHex, getUiSurfaceHex, type FontWeight, type ThemeMode } from '@socrates/theme';
import { uiStrings, type UiLanguage } from './strings';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { FlatList, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from './icons';
import { countFindMatches, findMessageMatches } from './findMessages';
import type { TeachingPlan, TeachingStage } from './tutor';
import { KnowledgeBoundaryPanel, type BoundarySnapshot, type KnowledgeBoundaryNode } from './KnowledgeBoundaryPanel';
import { getTutorLegacyPalette, tutorRgba } from './tutorTheme';

export { artifactFromFence, artifactsFromToolCalls, islandKindForLang, parseArtifactBridgeMessage, type ArtifactDescriptor } from './artifacts';
export { buildEmbeddedDocument } from './artifactDocument';
export { buildMathDocument } from './artifactDocument';
export { extractFootnoteDefinitions, splitMathSegments, stripCitationMarkers, type ContentSegment, type Footnote } from './math';
export { buildVisualizationDocument, isVisualizationSpec, paletteForDocument, visualizationSpecOf, visualizationSummary, type VisualizationSpec } from './visualization';
export { fileKindLabel, formatFileSize, isImageMime, storedFileIdFromRawUrl, storedFileIdsInText } from './fileMeta';
export { countFindMatches, findMessageMatches, type FindMessageMatch } from './findMessages';
export { buildPracticeMistake, buildQuizMistake, prependMistake, unresolvedMistakeCount, type PracticeMistakeInput, type QuizMistakeInput } from './mistakes';
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
  parseDiagResponse, stageInstruction, syncCurrentNodeFromTeachingPlan, TEACHING_STAGES, tutorProgressForTurn,
  tutorTurnDirective, type ColdStartNode, type DiagAnswerState, type DiagLevel, type DiagOption,
  type DiagQuestion, type TeachingPlan, type TeachingStage, type TeachingSubtopic,
  type TutorProgressNode, type TutorProgressPatch, type TutorProgressState,
} from './tutor';
export { detectExamLanguage, examAnswersOf, examGenerationPrompt, examProgress, examPromptTypes, gradeExam, missingExamAnswers, parseExamQuestionResponse, parseExamQuestions, type ExamQuestion, type ExamQuestionType } from './examModel';
export type { MessageActions, PracticeSubmission, QuizPick } from './MessageContent.tsx';
export { uiStrings, type UiLanguage, type UiStrings } from './strings';
export { KnowledgeBoundaryPanel, type BoundarySnapshot, type KnowledgeBoundaryNode } from './KnowledgeBoundaryPanel';
export { KNOWLEDGE_GRAPH_HEIGHT, KNOWLEDGE_GRAPH_WIDTH, knowledgeNodeRadius, layoutKnowledgeGraph, type KnowledgeGraphNode, type KnowledgeGraphPoint } from './knowledgeGraph';
export { Icon, IconRendererProvider, GLYPHS, type IconName, type IconProps, type IconRenderer } from './icons';

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
const HEADER_HEIGHT_COMPACT = 60;
const ROW_HEIGHT = 36;
const CONTENT_WIDTH = 768;
const WEB_TUTOR_SCALE = Platform.OS === 'web' ? 1.125 : 1;
const WEB_SIDEBAR_TUTOR_SCALE = Platform.OS === 'web' ? 1.035 : 1;

function sidebarTutorLineHeight(compact: boolean, fontSize = 10, scale = WEB_SIDEBAR_TUTOR_SCALE): number | undefined {
  if (Platform.OS !== 'web') return undefined;
  return compact ? fontSize * 1.5 * scale : 20;
}

function paletteFor(mode: UiMode = 'light') {
  return getThemePaletteHex(mode);
}

/** Baseline font stack per weight (`--font-sans`: Inter, then Noto Sans SC
 *  for CJK). RNW Text inherits from a parent Text, so only the outermost
 *  text of each block needs the family; nested Inline copies it. */
const fam = (language: UiLanguage, weight: FontWeight = 'regular') => fontStyle(weight, language, Platform.OS === 'web');

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

type SidebarView = 'recents' | 'knowledge' | 'mistakes';

function planStageKey(stage: TeachingStage | null | undefined): 'planStageMotivate' | 'planStageDefine' | 'planStageDevelop' | 'planStageIllustrate' | 'planStageExercise' | 'planStageCheck' {
  switch (stage) {
    case 'define': return 'planStageDefine';
    case 'develop': return 'planStageDevelop';
    case 'illustrate': return 'planStageIllustrate';
    case 'exercise': return 'planStageExercise';
    case 'check': return 'planStageCheck';
    default: return 'planStageMotivate';
  }
}

function TeachingPlanPanel({ plan, stage, substantiveCount, mode, language, compact }: { plan: TeachingPlan | null; stage: TeachingStage | null; substantiveCount: number; mode: UiMode; language: UiLanguage; compact: boolean }) {
  const p = paletteFor(mode);
  const legacy = getTutorLegacyPalette(mode);
  const t = uiStrings(language);
  const subtopics = Array.isArray(plan?.subtopics) ? plan.subtopics : [];
  const total = subtopics.length;
  const done = subtopics.filter((item) => item.status === 'internalized').length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const current = Math.max(0, Math.min(plan?.currentSubtopicIdx ?? 0, total - 1));
  return (
    <View testID="socrates-teaching-plan" style={[styles.teachingPlan, { borderBottomColor: tutorRgba(legacy.border, 0.12) }]}>
      <Text testID="socrates-teaching-plan-title" style={[styles.teachingPlanTitle, { color: legacy.text.muted, fontSize: 10 * WEB_SIDEBAR_TUTOR_SCALE, lineHeight: sidebarTutorLineHeight(compact) }, fam(language, 'semibold')]}>{t.teachingPlan}</Text>
      {total ? (
        <>
          <View testID="socrates-teaching-plan-progress" style={styles.teachingPlanProgress}>
            <View style={[styles.teachingPlanTrack, { backgroundColor: legacy.bg.soft }]}>
              <View style={[styles.teachingPlanFill, { width: `${percent}%`, backgroundColor: legacy.accent }]} />
            </View>
            <Text testID="socrates-teaching-plan-progress-text" style={[styles.teachingPlanProgressText, { color: legacy.text.muted, fontSize: 10 * WEB_TUTOR_SCALE, lineHeight: sidebarTutorLineHeight(compact, 10, WEB_TUTOR_SCALE) }, fam(language)]}>{t.planProgress(done, total, percent)}</Text>
          </View>
          {subtopics.map((subtopic, index) => {
            const isDone = subtopic.status === 'internalized';
            const isCurrent = index === current && !isDone;
            const statusLabel = isDone ? t.planStatusInternalized : subtopic.status === 'fuzzy' ? t.planStatusFuzzy : t.planStatusBlank;
            return (
              <View key={`${index}:${subtopic.name}`} testID={`socrates-teaching-plan-row-${index}`} style={[styles.teachingPlanRow, compact && Platform.OS === 'web' && { minHeight: 0 }, isCurrent && { backgroundColor: legacy.rgba.accent08 }]}>
                <Text style={[styles.teachingPlanMarker, { color: isDone ? legacy.success : isCurrent ? legacy.accent : legacy.text.muted, fontSize: 10 * WEB_SIDEBAR_TUTOR_SCALE, lineHeight: sidebarTutorLineHeight(compact) }, fam(language, 'semibold'), Platform.OS === 'web' ? { fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace' } : undefined]}>{isDone ? t.planDone : isCurrent ? '›' : '·'}</Text>
                <Text numberOfLines={1} style={[styles.teachingPlanName, { color: isCurrent ? legacy.text.primary : isDone ? legacy.text.muted : legacy.text.tertiary, fontSize: 12 * WEB_SIDEBAR_TUTOR_SCALE, lineHeight: sidebarTutorLineHeight(compact, 12) }, fam(language)]}>{subtopic.name}</Text>
                <Text style={[styles.teachingPlanStatus, { color: legacy.text.muted, fontSize: 9 * WEB_SIDEBAR_TUTOR_SCALE, lineHeight: sidebarTutorLineHeight(compact, 9), letterSpacing: 9 * WEB_SIDEBAR_TUTOR_SCALE * 0.04 }, fam(language)]}>{statusLabel}</Text>
                {isCurrent ? (
                  <>
                    <Text testID="socrates-teaching-plan-stage" style={[styles.teachingPlanStage, { color: legacy.accent, backgroundColor: legacy.rgba.accent12, fontSize: 9 * WEB_SIDEBAR_TUTOR_SCALE, lineHeight: sidebarTutorLineHeight(compact, 9), letterSpacing: 9 * WEB_SIDEBAR_TUTOR_SCALE * 0.04 }, fam(language, 'semibold')]}>{t[planStageKey(stage)]}</Text>
                    <Text accessibilityLabel={t.planDepthHint} style={[styles.teachingPlanDepth, { color: legacy.text.caption, backgroundColor: legacy.rgba.soft80, fontSize: 9 * WEB_SIDEBAR_TUTOR_SCALE, lineHeight: sidebarTutorLineHeight(compact, 9), letterSpacing: 9 * WEB_SIDEBAR_TUTOR_SCALE * 0.03 }, fam(language, 'semibold')]}>{t.planDepth(substantiveCount)}</Text>
                  </>
                ) : null}
              </View>
            );
          })}
        </>
      ) : <Text style={[styles.teachingPlanEmpty, { color: p.text.muted }, fam(language)]}>{t.noTeachingPlan}</Text>}
    </View>
  );
}

/** Tutor-only mistake book (baseline `#mistakesPanel` + `#mistakesList`):
 * title row plus the empty state, or one row per collected mistake. */
function MistakesPanel({ mistakes, mode, language, compact }: { mistakes: Mistake[]; mode: UiMode; language: UiLanguage; compact: boolean }) {
  const p = paletteFor(mode);
  const t = uiStrings(language);
  const rows = Array.isArray(mistakes) ? mistakes : [];
  return (
    <View testID="socrates-mistakes-panel" style={styles.mistakesPanel}>
      <Text testID="socrates-mistakes-title" style={[styles.recentsTitle, compact && styles.recentsTitleCompact, { color: p.text.tertiary }, fam(language)]}>{t.mistakeBook}</Text>
      {rows.length === 0 ? (
        <View style={styles.mistakesEmpty}>
          <Text style={[styles.mistakesEmptyText, { color: p.text.muted }, fam(language)]}>{t.mistakesEmpty}</Text>
          <Text style={[styles.mistakesEmptyText, { color: p.text.muted }, fam(language)]}>{t.mistakesEmptyHint}</Text>
        </View>
      ) : rows.map((mistake) => (
        <View key={mistake.id} style={styles.mistakeRow}>
          <Text numberOfLines={2} style={[styles.mistakeQuestion, { color: p.text.primary }, fam(language)]}>{mistake.questionContent}</Text>
          <Text numberOfLines={1} style={[styles.mistakeMeta, { color: p.text.muted }, fam(language)]}>
            {`${mistake.source === 'practice' ? t.mistakeTypePractice : t.mistakeTypeQuiz}${mistake.nodeName ? ` · ${mistake.nodeName}` : ''}`}
          </Text>
        </View>
      ))}
    </View>
  );
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
  logoTextRenderer: LogoTextRenderer,
  navLabelBadgeRenderer: NavLabelBadgeRenderer,
  sessionActions,
  archived = [],
  onSelectArchived,
  tutorActive = false,
  teachingPlan = null,
  teachingStage = null,
  substantiveCount = 0,
  knowledgeNodes = [],
  currentNode = -1,
  boundariesHistory = [],
  onUpdateKnowledgeNode,
  onSaveKnowledgeSnapshot,
  onJumpToKnowledgeNode,
  mistakes = [],
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
  /** Platform-owned text surfaces can replace RNW text only where Web needs native HTML flow. */
  logoTextRenderer?: React.ComponentType<{ label: string; color: string; language: UiLanguage }>;
  navLabelBadgeRenderer?: React.ComponentType<{ label: string; badge: string; color: string; badgeColor: string; borderColor: string; itemKey: string; language: UiLanguage; compact: boolean }>;
  sessionActions?: SidebarSessionActions;
  /** Archived rows stay in the list, muted, with Unarchive in the ⋯ menu. */
  archived?: Session[];
  onSelectArchived?(id: string): void;
  /** Tutor-only sidebar knowledge view. */
  tutorActive?: boolean;
  teachingPlan?: TeachingPlan | null;
  teachingStage?: TeachingStage | null;
  substantiveCount?: number;
  knowledgeNodes?: KnowledgeBoundaryNode[];
  currentNode?: number;
  boundariesHistory?: BoundarySnapshot[];
  onUpdateKnowledgeNode?(index: number, patch: Partial<KnowledgeBoundaryNode>): void;
  onSaveKnowledgeSnapshot?(): void;
  onJumpToKnowledgeNode?(index: number): void;
  /** Tutor-only mistake book rows (baseline `#mistakesList`). */
  mistakes?: Mistake[];
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
  const [sidebarView, setSidebarView] = useState<SidebarView>('recents');
  const [compactSearchOpen, setCompactSearchOpen] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  useEffect(() => { if (!tutorActive) setSidebarView('recents'); }, [tutorActive]);
  const titleOf = (item: Session) => item.title || item.topic || t.untitled;
  const recentModeColor = (item: Session) => {
    const kind = item.kind === 'exam' ? 'exam' : item.mode === 'chat' || item.phase === 'chat' ? 'chat' : 'tutor';
    const colors = mode === 'dark'
      ? { chat: '#e0e0e0', tutor: '#b8b8b8', exam: '#999999' }
      : { chat: '#333333', tutor: '#666666', exam: '#8c8c8c' };
    return colors[kind];
  };
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
    <View nativeID="socrates-sidebar" style={[styles.sidebar, compact && styles.sidebarCompact, { backgroundColor: s.sidebar, borderRightColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.10)' }]}>
      {/* Header: logo · new chat · toggle; search stays in the nav row below. */}
      <View style={[styles.header, compact && styles.headerCompact]}>
        <View style={[styles.logo, compact && styles.logoCompact]}>
          {logoSource ? <Image source={logoSource} style={[styles.logoImg, compact && styles.logoImgCompact]} resizeMode="cover" accessibilityLabel={t.brand} /> : null}
          {!compact && LogoTextRenderer
            ? <LogoTextRenderer label={t.brand} color={p.text.primary} language={language} />
            : !compact ? <Text nativeID="socrates-sidebar-logo-text" numberOfLines={1} style={[styles.logoText, { color: p.text.primary }, fam(language, 'semibold')]}>{t.brand}</Text> : null}
        </View>
        <View style={[styles.headerActions, compact && styles.headerActionsCompact]}>
          {compact ? <Pressable accessibilityRole="button" accessibilityLabel={t.searchChats} accessibilityState={{ expanded: compactSearchOpen }} onPress={() => {
            if (tutorActive) setCompactSearchOpen((open) => !open);
            else onOpenSearch?.();
          }} style={[styles.headerBtn, styles.headerBtnCompact]}><Icon name="search" size={20} color={p.text.secondary} /></Pressable>
            : <Pressable accessibilityRole="button" accessibilityLabel={t.startNewChat} onPress={onNewChat} style={styles.headerBtn}><Icon name="new-chat" size={20} color={p.text.secondary} strokeWidth={2} /></Pressable>}
          {onToggleSidebar ? (
            <Pressable accessibilityRole="button" accessibilityLabel={compact ? t.closeSidebar : t.closeSidebar} onPress={() => { if (compact) setCompactSearchOpen(false); onToggleSidebar(); }} style={[styles.headerBtn, compact && styles.headerBtnCompact]}><Icon name={compact ? 'close' : 'panel'} size={20} color={p.text.secondary} /></Pressable>
          ) : null}
        </View>
      </View>

      {/* Nav rows. When any submenu (the More dropdown) is open the nav
         container also has to step above the recents ScrollView, otherwise
         the dropdown's z-index is trapped inside the nav's stacking
         context and the later-painted Recents row wins the click. */}
      <View style={[styles.nav, compact && styles.navCompact, navMenu ? styles.navMenuOpen : undefined]}>
        {(compact ? [...nav].sort((left, right) => {
          const order: Record<string, number> = { new: 0, library: 1, scheduled: 2, plugins: 3, projects: 4, sites: 5, more: 6 };
          return (order[left.key] ?? 99) - (order[right.key] ?? 99);
        }) : nav).map((item) => (
          /* Without `position: relative` here, `rowMenu`'s absolute top/right
             resolves against the nearest positioned ancestor instead of the
             More button — the dropdown then floats above the page and a
             different control (the active Recents row) ends up under the
             click target. Mirrors `sessionMenuOpen` for the recents row. */
          <View key={item.key} style={item.menu ? (navMenu === item.key ? styles.navRowMenuOpen : styles.navRowWithMenu) : undefined}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.accessibilityLabel || item.label}
              accessibilityState={item.active ? { selected: true } : item.menu ? { expanded: navMenu === item.key } : undefined}
              onPress={() => {
                if (item.menu) setNavMenu((key) => (key === item.key ? null : item.key));
                item.onPress();
              }}
              style={[styles.navRow, compact && styles.navRowCompact, compact && item.key === 'new' && { backgroundColor: p.bg.hover }, (item.active || hoverId === item.key || navMenu === item.key) && { backgroundColor: p.bg.hover }]}
              onHoverIn={() => setHoverId(item.key)}
              onHoverOut={() => setHoverId((id) => (id === item.key ? null : id))}
            >
              <Icon name={item.icon} size={20} color={p.text.primary} />
              {item.badge && NavLabelBadgeRenderer
                ? <NavLabelBadgeRenderer label={item.label} badge={item.badge} color={p.text.primary} badgeColor={p.text.tertiary} borderColor={mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'} itemKey={item.key} language={language} compact={compact} />
                : <Text numberOfLines={1} style={[styles.rowLabel, { color: p.text.primary }, fam(language)]}>{item.label}</Text>}
              {item.kbd ? <Text style={[styles.rowKbd, { color: p.text.muted }, fam(language)]}>{item.kbd}</Text> : null}
              {item.badge && !NavLabelBadgeRenderer ? <View style={[styles.rowBadge, { borderColor: p.border.default }]}><Text nativeID={`socrates-sidebar-nav-badge-${item.key}`} style={[styles.rowBadgeText, { color: p.text.tertiary }, fam(language, 'semibold')]}>{item.badge}</Text></View> : null}
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

      {/* Search row. The Knowledge view appears only in tutor sessions. */}
      {tutorActive && (!compact || compactSearchOpen) ? (
        <View style={[styles.searchToolbar, compact && styles.searchToolbarCompact]}>
          {onOpenSearch ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t.openSearch} onPress={onOpenSearch} style={[styles.searchRow, styles.searchRowFill, compact && styles.searchRowCompact]}>
              <Icon name="search" size={20} width={20} height={Platform.OS === 'web' ? 15 : 20} color={p.text.primary} />
              <Text numberOfLines={1} style={[styles.rowLabel, { color: p.text.primary }, fam(language)]}>{t.searchChats}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.knowledge}
            accessibilityState={{ selected: sidebarView === 'knowledge' }}
            onPress={() => setSidebarView((view) => view === 'knowledge' ? 'recents' : 'knowledge')}
            style={[styles.sidebarViewBtn, compact && styles.sidebarViewBtnCompact, sidebarView === 'knowledge' && { backgroundColor: s.surface }]}
          >
            <Icon name="knowledge" size={compact ? 18 : 17} color={sidebarView === 'knowledge' ? p.text.primary : p.text.tertiary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.mistakes}
            accessibilityState={{ selected: sidebarView === 'mistakes' }}
            onPress={() => setSidebarView((view) => view === 'mistakes' ? 'recents' : 'mistakes')}
            style={[styles.sidebarViewBtn, compact && styles.sidebarViewBtnCompact, sidebarView === 'mistakes' && { backgroundColor: s.surface }]}
          >
            <Icon name="bookmark" size={compact ? 18 : 17} color={sidebarView === 'mistakes' ? p.text.primary : p.text.tertiary} />
          </Pressable>
        </View>
      ) : onOpenSearch && (!compact || compactSearchOpen) ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t.openSearch} onPress={onOpenSearch} style={[styles.searchRow, compact && styles.searchRowCompact]}>
          <Icon name="search" size={20} width={20} height={Platform.OS === 'web' ? 15 : 20} color={p.text.primary} />
          <Text numberOfLines={1} style={[styles.rowLabel, { color: p.text.primary }, fam(language)]}>{t.searchChats}</Text>
        </Pressable>
      ) : null}

      {/* Recents */}
      <ScrollView
        nativeID="socrates-sidebar-recents"
        style={[styles.recents, sidebarView === 'knowledge' && tutorActive && styles.recentsKnowledge]}
        contentContainerStyle={[
          styles.recentsContent,
          sidebarView === 'knowledge' && tutorActive && (compact ? styles.knowledgeContentCompact : styles.knowledgeContent),
        ]}
      >
        {sidebarView === 'mistakes' && tutorActive ? (
          <MistakesPanel mistakes={mistakes} mode={mode} language={language} compact={compact} />
        ) : sidebarView === 'knowledge' && tutorActive ? <>
          <TeachingPlanPanel plan={teachingPlan} stage={teachingStage} substantiveCount={substantiveCount} mode={mode} language={language} compact={compact} />
          <KnowledgeBoundaryPanel
            nodes={knowledgeNodes}
            currentNode={currentNode}
            history={boundariesHistory}
            mode={mode}
            language={language}
            compact={compact}
            onUpdateNode={onUpdateKnowledgeNode || (() => {})}
            onSaveSnapshot={onSaveKnowledgeSnapshot || (() => {})}
            onJumpToNode={onJumpToKnowledgeNode || (() => {})}
          />
        </> : <>
        <Text nativeID="socrates-sidebar-recents-title" style={[styles.recentsTitle, compact && styles.recentsTitleCompact, { color: p.text.tertiary }, fam(language)]}>{t.recents}</Text>
        {groupedRows.map(({ item, isArchived, group, label }, index) => {
          const active = item.id === activeId;
          const showGroup = !compact && groupedRows[index - 1]?.group !== group;
          return (
            <View key={item.id} style={menuId === item.id && styles.sessionMenuOpen}>
              {showGroup ? <Text nativeID={`socrates-sidebar-recents-time-${item.id}`} style={[styles.recentsTimeLabel, index === 0 && styles.recentsTimeLabelFirst, { color: p.text.muted }, fam(language, 'medium')]}>{label}</Text> : null}
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
                {!compact ? <View style={[styles.modeDot, { backgroundColor: recentModeColor(item) }]} /> : null}
                <Text nativeID={`socrates-sidebar-session-title-${item.id}`} testID="socrates-sidebar-session-title" numberOfLines={1} style={[styles.rowLabel, isArchived ? { color: p.text.muted } : { color: p.text.primary }, fam(language)]}>{titleOf(item)}</Text>
                </Pressable>
                {sessionActions ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={t.sessionActionsOf(titleOf(item))} onPress={() => setMenuId((id) => (id === item.id ? null : item.id))} style={[styles.overflowBtn, !compact && hoverId !== item.id && styles.overflowHidden]}>
                    <Icon name="session-more" size={16} color={p.text.tertiary} />
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
                  <Icon name="session-more" size={16} color={p.text.tertiary} />
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
        </>}
      </ScrollView>

      {/* Footer: account row + quick actions */}
      <View style={[styles.footer, compact && styles.footerCompact, { borderTopColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)' }]}>
        <View style={styles.userRow}>
          <View style={[styles.avatar, { backgroundColor: s.avatar }]}>
            <Text nativeID="socrates-sidebar-user-avatar-text" style={[styles.avatarText, fam(language, 'semibold')]}>{user?.initials || '?'}</Text>
          </View>
          <View style={styles.identity}>
            <Text nativeID="socrates-sidebar-user-name" testID="socrates-sidebar-user-name" numberOfLines={1} style={[styles.userName, { color: p.text.primary }, fam(language, 'medium')]}>{user?.name || t.brand}</Text>
            <Text nativeID="socrates-sidebar-user-plan" numberOfLines={1} style={[styles.userPlan, { color: p.text.muted }, fam(language)]}>{user?.plan || ''}</Text>
          </View>
        </View>
        <View style={[styles.footerActions, compact && styles.footerActionsCompact]}>
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
      style={[styles.toolBtn, size === 16 && styles.toolBtnCompact, over && { backgroundColor: hover }, Platform.OS === 'web' ? { color } as unknown as ViewStyle : null]}
    >
      <Icon name={icon} size={size} color={color} strokeWidth={1.7} />
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
  // Mobile SPA toolbar opacity resolves to .6 (the tutor-inline-tools
  // override wins over the older .7 hover:none rule in the same viewport).
  const opacity = user ? (compact ? (hovered ? 1 : 0.6) : hovered ? 1 : 0) : 1;
  return (
      <View nativeID="socrates-message-toolbar" style={[styles.toolbar, compact && styles.toolbarCompact, user ? styles.toolbarUser : styles.toolbarAssistant, compact && (user ? styles.toolbarUserCompact : styles.toolbarAssistantCompact), { opacity }]}>
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

const MessageRow = memo(function MessageRow({ message, mode = 'light', language = 'en', compact = false, previousRole, first, findQuery = '', findStartIndex = 0, activeFindIndex = -1, ...actions }: { message: Message; mode?: UiMode; language?: UiLanguage; compact?: boolean; previousRole?: string; first?: boolean; findQuery?: string; findStartIndex?: number; activeFindIndex?: number } & MessageActions) {
  const p = paletteFor(mode);
  const s = getUiSurfaceHex(mode);
  const user = message.role === 'user';
  const [hovered, setHovered] = useState(false);
  // Baseline rhythm: first turn has no top gap, every later turn 20px, and
  // an assistant turn followed by a user turn gets 40px.
  const gapTop = first ? 0 : user && previousRole === 'assistant' ? 40 : compact && previousRole === 'user' ? 24 : 20;
  return (
    <Animated.View
      nativeID={`socrates-message-row-${message.clientId}`}
      layout={LinearTransition}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={[styles.msg, { marginTop: gapTop }, user && styles.msgUser]}
    >
      <View style={user ? [styles.bubble, compact && styles.bubbleCompact, { backgroundColor: compact ? s.bubbleStrong : s.bubble }] : undefined}>
        <MessageContent message={message} mode={mode} language={language} compact={compact} findQuery={findQuery} findStartIndex={findStartIndex} activeFindIndex={activeFindIndex} {...actions} />
      </View>
      <MessageToolbar message={message} language={language} actions={actions} ghost={compact ? p.text.muted : p.text.secondary} hover={s.hoverGhost} compact={compact} hovered={hovered} />
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
  findQuery = '',
  activeFindIndex = -1,
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
  /** Current in-transcript query and zero-based active hit. */
  findQuery?: string;
  activeFindIndex?: number;
} & MessageActions) {
  const p = paletteFor(mode);
  const t = uiStrings(language);
  const listRef = useRef<FlatList<Message>>(null);
  const matches = useMemo(() => findMessageMatches(messages, findQuery), [messages, findQuery]);
  const findOffsets = useMemo(() => {
    let offset = 0;
    return messages.map((message) => {
      const start = offset;
      offset += countFindMatches(message.rawText || message.content || '', findQuery);
      return start;
    });
  }, [messages, findQuery]);
  useEffect(() => {
    if (!matches.length || activeFindIndex < 0) return;
    const hit = matches[activeFindIndex % matches.length];
    listRef.current?.scrollToIndex({ index: hit.messageIndex, animated: true, viewPosition: 0.5 });
  }, [activeFindIndex, matches]);
  if (!messages.length) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: p.text.muted }, fam(language)]}>{emptyText ?? t.emptyChat}</Text>
      </View>
    );
  }
  return (
<FlatList
      ref={listRef}
      nativeID="socrates-message-list"
      style={style}
      contentContainerStyle={[styles.messages, compact && styles.messagesCompact]}
      data={messages}
      keyExtractor={(item, index) => item.id || item.clientId || String(index)}
      onScrollToIndexFailed={({ index }) => listRef.current?.scrollToOffset({ offset: Math.max(0, index * 120), animated: true })}
      renderItem={({ item, index }) => <MessageRow message={item} mode={mode} language={language} compact={compact} first={index === 0} previousRole={index > 0 ? messages[index - 1].role : undefined} findQuery={findQuery} findStartIndex={findOffsets[index] || 0} activeFindIndex={activeFindIndex} {...actions} />}
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
      nativeID="socrates-composer-input"
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
    <View nativeID="socrates-composer-slot" style={[styles.composerSlot, compact && styles.composerSlotCompact, { backgroundColor: p.bg.page }]}>
      <View nativeID="socrates-composer-shell" style={[styles.shell, compact && styles.shellCompact, { borderColor: compact ? s.composerBorderCompact : s.composerBorder, backgroundColor: s.composer }]}>
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
              <Pressable accessibilityRole="button" accessibilityLabel={t.addAttachments} accessibilityState={{ expanded: menuOpen }} onPress={() => setMenuOpen((open) => !open)} style={[styles.roundBtn, compact && { backgroundColor: s.controlCompact }]}>
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
                      <Text nativeID="socrates-effort-text-label" style={[styles.effortText, { color: p.text.secondary }, fam(language)]}>{t.thinkingEffort}</Text>
                      <Text nativeID="socrates-effort-text-value" style={[styles.effortText, { color: p.text.secondary }, fam(language)]}>{t.effortMedium}</Text>
              <View nativeID="socrates-effort-caret" style={[styles.effortCaret, compact && styles.effortCaretCompact]}>
                <Icon name="caret" size={compact ? 14 : 16} color={p.text.muted} />
              </View>
            </Pressable>
          ) : null}
          {voiceInputSupported && onToggleListen ? (
            <Pressable accessibilityRole="button" accessibilityLabel={listening ? t.stopVoiceInput : t.startVoiceInput} accessibilityState={{ expanded: listening }} onPress={onToggleListen} style={[styles.roundBtn, compact && { backgroundColor: s.controlCompact }]}>
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
            {/* `.composer-primary-btn` paints its glyph with `--ui-bg-page`. */}
            <Icon name={primary} size={20} color={p.bg.page} />
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
  sidebarCompact: {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: SIDEBAR_WIDTH_COMPACT,
    zIndex: 90, elevation: 8,
    shadowColor: '#000000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.25, shadowRadius: 28,
  },
  header: { height: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  headerCompact: { height: HEADER_HEIGHT_COMPACT, alignItems: 'flex-start', paddingHorizontal: 4, paddingTop: 10, paddingBottom: 16 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 8, borderRadius: 10, minWidth: 0 },
  logoCompact: { height: 32, paddingHorizontal: 6, borderRadius: 0 },
  logoImg: { width: 24, height: 24, borderRadius: 6 },
  logoImgCompact: { width: 20, height: 20, borderRadius: 0 },
  logoText: { fontSize: 15, lineHeight: 20, letterSpacing: -0.45 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headerActionsCompact: { gap: 0, marginRight: 8 },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  headerBtnCompact: { width: 32, height: 32, borderRadius: 8 },
  nav: { paddingHorizontal: 6, paddingBottom: 8, gap: 0 },
  navCompact: { paddingBottom: 6 },
  /* Lift the entire nav above the recents ScrollView while any submenu
     is open — otherwise the dropdown's z-index stays trapped inside the
     nav's stacking context and the later-painted Recents row covers it. */
  navMenuOpen: { zIndex: 80 },
  /* ≥769px rows use --ui-radius-lg (12px); the phone drawer keeps
     --ui-radius-row (10px) — parity/sidebar.css:504 + tokens.css. */
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%', height: ROW_HEIGHT, minHeight: ROW_HEIGHT, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  navRowCompact: { height: 40, minHeight: 40, paddingVertical: 0, borderRadius: 10 },
  /* Anchor `rowMenu`'s absolute top/right to the More row itself. The
     z-index has to out-rank the recents ScrollView (z:0 + transform
     stacking context) so the dropdown paints on top of the active
     Recents row that sits at the same y-range. */
  navRowWithMenu: { position: 'relative' },
  navRowMenuOpen: { position: 'relative', zIndex: 80 },
  rowLabel: { fontSize: 14, lineHeight: 20, flexShrink: 1 },
  rowKbd: { fontSize: 12, lineHeight: 16, marginLeft: 'auto' },
  rowBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  rowBadgeText: { fontSize: 10, lineHeight: 14, letterSpacing: 0.2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 6, height: ROW_HEIGHT, paddingHorizontal: 10, borderRadius: 10 },
  searchRowCompact: { height: 44, borderRadius: 10 },
  recents: { flex: 1, paddingHorizontal: 6, paddingBottom: 8 },
  recentsContent: { paddingBottom: 8 },
  recentsKnowledge: { paddingHorizontal: 0, paddingBottom: 0 },
  knowledgeContent: { gap: 6, paddingHorizontal: 8, paddingTop: 12, paddingBottom: 10 },
  knowledgeContentCompact: { gap: 6, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 },
  archivedToggle: { height: 32, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8 },
  recentsTitle: { fontSize: 14, lineHeight: 20, paddingTop: 20, paddingBottom: 6, paddingHorizontal: 10, textTransform: 'uppercase', letterSpacing: 0.84 },
  recentsTitleCompact: { letterSpacing: 0 },
  recentsTimeLabel: { paddingHorizontal: 10, paddingTop: 12, paddingBottom: 4, fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.36 },
  recentsTimeLabelFirst: { paddingTop: 0 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', height: ROW_HEIGHT, minHeight: ROW_HEIGHT, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  sessionRowCompact: { borderRadius: 10 },
  sessionRowMain: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, height: '100%' },
  modeDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  overflowBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 6, marginLeft: 'auto' },
  overflowHidden: { opacity: 0 },
  sessionMenuOpen: { position: 'relative', zIndex: 60 },
  rowMenu: { position: 'absolute', top: ROW_HEIGHT - 2, right: 6, zIndex: 80, minWidth: 180, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 6, gap: 2 },
  menuItem: { height: 32, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8 },
  menuItemText: { fontSize: 14, lineHeight: 20 },
  searchToolbar: { height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 2, marginHorizontal: 6 },
  searchToolbarCompact: { height: 54, paddingBottom: 8, marginHorizontal: 6 },
  searchRowFill: { flex: 1, marginHorizontal: 0 },
  sidebarViewBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  sidebarViewBtnCompact: { width: 44, height: 44 },
  teachingPlan: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 10, marginBottom: 6, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  teachingPlanTitle: { fontSize: 10, fontWeight: '600', letterSpacing: 10 * WEB_SIDEBAR_TUTOR_SCALE * 0.06, textTransform: 'uppercase', paddingHorizontal: 8, paddingTop: 4, paddingBottom: 6 },
  teachingPlanProgress: { gap: 4, paddingHorizontal: 10, paddingTop: 2, paddingBottom: 8 },
  teachingPlanTrack: { height: 4, borderRadius: 99, overflow: 'hidden' },
  teachingPlanFill: { height: '100%', borderRadius: 99 },
  teachingPlanProgressText: { fontSize: 10, textAlign: 'right', fontVariant: ['tabular-nums'] },
  teachingPlanRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  teachingPlanMarker: { width: 38, flexShrink: 0, fontSize: 10 },
  teachingPlanName: { flex: 1, minWidth: 0, fontSize: 12 },
  teachingPlanStage: { fontSize: 9, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, textTransform: 'uppercase', flexShrink: 0 },
  teachingPlanStatus: { fontSize: 9, textTransform: 'uppercase', flexShrink: 0 },
  teachingPlanDepth: { fontSize: 9, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, letterSpacing: 0.3, flexShrink: 0, fontVariant: ['tabular-nums'] },
  teachingPlanEmpty: { paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, lineHeight: 18 },
  mistakesPanel: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 10, gap: 2 },
  mistakesEmpty: { paddingHorizontal: 12, paddingVertical: 32, gap: 0, alignItems: 'center' },
  mistakesEmptyText: { fontSize: 11, lineHeight: 17.6, textAlign: 'center' },
  mistakeRow: { gap: 2, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  mistakeQuestion: { fontSize: 13, lineHeight: 18 },
  mistakeMeta: { fontSize: 11, lineHeight: 15 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, borderTopWidth: StyleSheet.hairlineWidth, minHeight: 59 },
  footerCompact: { padding: 8, gap: 0 },
  userRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ffffff', fontSize: 12, lineHeight: 12, letterSpacing: 0.24 },
  identity: { flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 },
  userName: { fontSize: 13, lineHeight: 17 },
  userPlan: { fontSize: 12, lineHeight: 16 },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  footerActionsCompact: { gap: 4, flexShrink: 0 },
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
  toolbarAssistantCompact: { marginLeft: 2 },
  toolbarUserCompact: { marginRight: 0 },
  toolBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  toolBtnCompact: { width: 32, height: 32 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 16, lineHeight: 28, textAlign: 'center' },

  /* ── Composer ───────────────────────────────────────────────────────── */
  composerSlot: { width: '100%', alignItems: 'center', paddingBottom: 6 },
  composerSlotCompact: { paddingHorizontal: 16 },
  shell: { width: '100%', maxWidth: CONTENT_WIDTH, minHeight: 52, borderRadius: 28, borderWidth: 1, paddingTop: 7, paddingBottom: 7, paddingLeft: 8, paddingRight: 10, gap: 4 },
  /* parity/composer-unified.css phone block: `padding: 12px 8px 8px` — the
     desktop 10px right inset drops to 8px, and the rail is a second row. */
  shellCompact: { paddingTop: 12, paddingBottom: 8, paddingLeft: 8, paddingRight: 8, rowGap: 3 },
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
  effortBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 36, minHeight: 36, paddingLeft: 12, paddingRight: 10, borderRadius: 999 },
  effortCaret: { width: 16, height: 16, opacity: 0.65 },
  effortCaretCompact: { width: 14, height: 14 },
  effortText: { fontSize: 14, lineHeight: 20 },
  plusMenu: { position: 'absolute', bottom: 44, left: 0, zIndex: 60, minWidth: 180, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 6, gap: 2 },
  input: { flex: 1, height: 36, minHeight: 24, maxHeight: 336, fontSize: 16, lineHeight: 24, paddingVertical: 6, paddingHorizontal: 8 },
  inputCompact: { width: '100%', height: 24, flex: 0, fontSize: 16, lineHeight: 24, paddingVertical: 0 },
});
