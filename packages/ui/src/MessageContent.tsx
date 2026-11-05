import React, { memo, useCallback, useMemo, useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { fontStyle, getThemePaletteHex, type FontWeight, type ThemeMode } from '@socrates/theme';
import type { Attachment, Message, ToolCall } from '@socrates/contracts';
import type { Token, Tokens } from 'marked';
import { parseAssistantSegments, parseMessageContent, parseRichText, plainText, safeImage, safeLink } from './messageContent';
import { paletteForDocument } from './visualization';
import { buildMathDocument } from './artifactDocument';
import { artifactFromFence, artifactsFromToolCalls, type ArtifactDescriptor } from './artifacts';
import { fileKindLabel, formatFileSize } from './fileMeta';
import {
  DefinitionCard,
  FlashcardCard,
  KeyPointCard,
  LearnHostProvider,
  ProblemCard,
  ProofCard,
  QuizCard,
  StepsCard,
  TheoremCard,
  hintLevels,
  learnStrings,
  parseAnswerKey,
  splitDerivationSteps,
  type AnswerFeedback,
  type QuizResult,
  type QuizVerdict,
} from './learn';
import { type ParsedPractice, type ParsedQuiz, type QuizOption } from './learn/model';
import { evaluatePracticeAnswer } from './learn/practiceAnswer.ts';
import { type ScaffoldBlock } from './learn/split';
import { toolArtifacts, toolDurationLabel, toolFailureText, toolInputPreview, toolInputText, toolLabel, toolOutputText, toolSearchResults, toolState } from './toolModel';
import { uiStrings, type UiLanguage, type UiStrings } from './strings';
import { getTutorLegacyPalette } from './tutorTheme';
import { findTextMatches } from './findTextMatches';

type Palette = ReturnType<typeof getThemePaletteHex>;
type FindRenderContext = { query: string; normalizedQuery: string; nextIndex: number; activeIndex: number };
export type ResolvedImageSource = { uri: string; headers?: Record<string, string> };
/** One quiz pick: the host applies stage transitions and (only when a
 * correct answer is declared and the pick is wrong) a synthetic turn. */
export type QuizPick = {
  q: string;
  options: QuizOption[];
  picked: string;
  pickedText: string;
  correct: string | null;
  isRight: boolean;
  /** Stable card slot (`<message id>:quiz`, or a redo card's slot): a
   * wrong pick records it on the mistake, a later right pick on the same
   * slot conquers the mistake (baseline `quizSlotId`). */
  slotId?: string | null;
};
/** One practice submission: the turn always goes out; `isRight: null` means
 * the answer key did not support a reliable local comparison. Hosts must not
 * turn an unverified answer into a recorded mistake. */
export type PracticeSubmission = {
  problem: string;
  answer: string;
  correct: string | null;
  isRight: boolean | null;
};
export type MessageActions = {
  onCopyText?: (text: string) => Promise<void>;
  onSpeakText?: (text: string) => void;
  /** Rewind to this user turn with new text and re-ask (edit). */
  onEditMessage?: (message: Message) => void;
  /** Rewind to the user turn behind this reply and re-ask (regenerate). */
  onRegenerateMessage?: (message: Message) => void;
  /** Fork the conversation at this message into a new session. */
  onBranchMessage?: (message: Message) => void;
  onDeleteMessage?: (message: Message) => void;
  onShareMessage?: (message: Message) => void;
  onThumbsUpMessage?: (message: Message) => void;
  onThumbsDownMessage?: (message: Message) => void;
  onReExplainMessage?: (message: Message) => void;
  onOpenArtifact?: (artifact: ArtifactDescriptor) => void;
  /** Platform resolver for server-relative image sources (file raw URLs);
   * returns null to fall back to the safe inline check. */
  resolveImage?: (src: string) => ResolvedImageSource | null;
  onOpenFile?: (attachment: Attachment) => void;
  /** HTML tool artifacts open in the sandboxed island (bytes fetched by the
   * platform layer). */
  onOpenStoredArtifact?: (file: { id: string; mimeType?: string | null; name?: string | null }) => void;
  /** Tutor scaffold proxies: absent handlers leave the widgets inert. */
  onQuizPick?: (pick: QuizPick) => void;
  onPracticeSubmit?: (submission: PracticeSubmission) => void;
  /** Redo-in-place counters per quiz slot: bumping a slot remounts that
   * card fresh (baseline `handleMistakeRedo` replaces the original card). */
  quizSlotResets?: Record<string, number>;
};

/** Slot id of the (single) interactive quiz card in a message. */
export function messageQuizSlotId(message: Pick<Message, 'clientId' | 'id'>): string {
  return `${message.clientId || message.id || 'message'}:quiz`;
}
const openLink = (url: string) => { const safe = safeLink(url); if (safe) void Linking.openURL(safe).catch(() => undefined); };

function findText(text: string, context: FindRenderContext | undefined): React.ReactNode {
  if (!context?.query) return text;
  const matches = findTextMatches(text, context.normalizedQuery);
  if (!matches.length) return text;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [offset, end] of matches) {
    if (offset > cursor) parts.push(text.slice(cursor, offset));
    const active = context.nextIndex === context.activeIndex;
    parts.push(<Text key={`find-${context.nextIndex}`} style={active ? styles.findActive : styles.findMark}>{text.slice(offset, end)}</Text>);
    context.nextIndex++;
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function Inline({ tokens, p, resolveImage, find }: { tokens: Token[]; p: Palette; resolveImage?: (src: string) => ResolvedImageSource | null; find?: FindRenderContext }) {
  return <>{tokens.map((t, i) => {
    if (t.type === 'strong' || t.type === 'em' || t.type === 'del') return <Text key={i} style={t.type === 'strong' ? { fontWeight: '700' } : t.type === 'em' ? { fontStyle: 'italic' } : { textDecorationLine: 'line-through' }}><Inline tokens={t.tokens || []} p={p} resolveImage={resolveImage} find={find} /></Text>;
    if (t.type === 'codespan') return <Text key={i} style={[styles.mono, { backgroundColor: p.bg.hover }]}>{findText(plainText(t.text), find)}</Text>;
    if (t.type === 'br') return <Text key={i}>{'\n'}</Text>;
    if (t.type === 'link') {
      const url = safeLink(t.href);
      return <Text key={i} accessibilityRole={url ? 'link' : undefined} onPress={url ? () => openLink(url) : undefined} style={url ? { color: p.accent.strong, textDecorationLine: 'underline' } : undefined}><Inline tokens={t.tokens || []} p={p} resolveImage={resolveImage} find={find} /></Text>;
    }
    if (t.type === 'image') {
      const safe = safeImage(t.href);
      const resolved = resolveImage?.(t.href) ?? (safe ? { uri: safe } : null);
      return resolved ? <Image key={i} accessibilityLabel={t.text || 'Image'} source={resolved} style={styles.image} resizeMode="contain" /> : <Text key={i}>{findText(plainText(t.text || ''), find)}</Text>;
    }
    if ('tokens' in t && t.tokens) return <Inline key={i} tokens={t.tokens || []} p={p} resolveImage={resolveImage} find={find} />;
    // HTML is selectable literal text: assistant markup never executes here.
    return <Text key={i}>{findText(plainText(('text' in t ? t.text : '') || t.raw || ''), find)}</Text>;
  })}</>;
}

function CodeBlock({ token, p, t, onCopyText, font, find }: { token: Tokens.Code; p: Palette; t: UiStrings; font?: { fontFamily: string }; compact?: boolean; find?: FindRenderContext } & MessageActions) {
  const [notice, setNotice] = useState('');
  // Long dumps collapse: the first screenful stays visible, the rest is
  // one tap away. FlatList rows with thousand-line <Text> nodes scroll
  // and measure badly on low-end devices.
  const lines = token.text.split('\n');
  const collapsible = lines.length > 40;
  const [expanded, setExpanded] = useState(false);
  const shown = expanded || !collapsible ? token.text : lines.slice(0, 30).join('\n');
  const copy = async () => {
    try { await onCopyText?.(token.text); setNotice(t.copied); }
    catch { setNotice(t.copyFailed); }
  };
  return <View style={[styles.code, { backgroundColor: p.bg.sunken, borderColor: p.border.default }]}>
    <View style={styles.codeHeader}>
      <Text style={{ color: p.text.muted }}>{token.lang || t.code}</Text>
      {onCopyText ? <Pressable accessibilityRole="button" accessibilityLabel={t.copyCode} onPress={() => void copy()}><Text style={{ color: p.text.secondary }}>{notice || t.copyCode}</Text></Pressable> : null}
    </View>
    <ScrollView horizontal><Text selectable style={[font, styles.codeText, styles.mono, { color: p.text.primary }]}>{findText(shown, find)}</Text></ScrollView>
    {collapsible ? <Pressable accessibilityRole="button" accessibilityLabel={expanded ? t.codeCollapse : t.codeExpand(lines.length - 30)} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={[styles.codeToggle, { borderColor: p.border.default }]}>
      <Text style={{ color: p.accent.strong }}>{expanded ? t.codeCollapse : t.codeExpand(lines.length - 30)}</Text>
    </Pressable> : null}
  </View>;
}

function ArtifactCard({ artifact, p, t, onOpenArtifact }: { artifact: ArtifactDescriptor; p: Palette; t: UiStrings } & MessageActions) {
  return <View style={[styles.artifact, { borderColor: p.border.default, backgroundColor: p.bg.sunken }]}>
    <View style={styles.artifactHeader}>
      <Text numberOfLines={1} style={{ color: p.text.primary, fontWeight: '600', flex: 1 }}>{artifact.title || t.visualization}</Text>
      <Text style={{ color: p.text.muted, fontSize: 12, textTransform: 'uppercase' }}>{artifact.kind}</Text>
    </View>
    {artifact.summary ? <Text numberOfLines={3} style={{ color: p.text.secondary }}>{artifact.summary}</Text> : null}
    {onOpenArtifact ? <Pressable accessibilityRole="button" accessibilityLabel={t.openArtifact(artifact.title)} onPress={() => onOpenArtifact(artifact)} style={[styles.artifactOpen, { borderColor: p.border.strong }]}>
      <Text style={{ color: p.accent.strong, fontWeight: '600' }}>{t.openInIsland}</Text>
    </Pressable> : null}
  </View>;
}

function MathCard({ tex, index, mode, p, t, onOpenArtifact }: { tex: string; index: number; mode: ThemeMode; p: Palette; t: UiStrings } & MessageActions) {
  const open = () => onOpenArtifact?.({
    id: `math-${index}`,
    kind: 'math',
    title: t.formula,
    summary: tex.slice(0, 160),
    document: () => buildMathDocument({ artifactId: `math-${index}`, title: t.formula, tex, display: true, palette: paletteForDocument(mode) }),
  });
  return <View style={[styles.math, { borderColor: p.border.default, backgroundColor: p.bg.sunken }]}>
    <View style={styles.artifactHeader}>
      <Text numberOfLines={1} style={{ color: p.text.primary, fontWeight: '600', flex: 1 }}>∑ {t.formula}</Text>
      <Text style={{ color: p.text.muted, fontSize: 12, textTransform: 'uppercase' }}>TeX</Text>
    </View>
    <Text selectable style={[styles.mono, styles.mathTex, { color: p.text.secondary }]}>{tex}</Text>
    {onOpenArtifact ? <Pressable accessibilityRole="button" accessibilityLabel={t.openArtifact(t.formula)} onPress={open} style={[styles.artifactOpen, { borderColor: p.border.strong }]}>
      <Text style={{ color: p.accent.strong, fontWeight: '600' }}>{t.openInIsland}</Text>
    </Pressable> : null}
  </View>;
}

function NotesSection({ notes, p, t, find }: { notes: Array<{ id: string; text: string }>; p: Palette; t: UiStrings; find?: FindRenderContext }) {
  return <View style={{ gap: 4 }}>
    <Text style={{ color: p.text.muted, fontWeight: '600' }}>{t.notesTitle}</Text>
    {notes.map((note, i) => <Text key={`${note.id}-${i}`} selectable style={[styles.text, { color: p.text.secondary }]}>{findText(`[${i + 1}] ${note.text}`, find)}</Text>)}
  </View>;
}

function Blocks({ tokens, p, t, mode, onCopyText, onOpenArtifact, resolveImage, font, lang = 'en', compact = false, find, nativeIdPrefix = 'socrates-richtext', path = '' }: { tokens: Token[]; p: Palette; t: UiStrings; mode: ThemeMode; font?: { fontFamily: string }; lang?: UiLanguage; compact?: boolean; find?: FindRenderContext; nativeIdPrefix?: string; path?: string } & MessageActions) {
  const visibleTokens = tokens.filter((token) => token.type !== 'space' && token.type !== 'def');
  return <>{visibleTokens.map((b, i) => {
    const last = i === visibleTokens.length - 1;
    if (b.type === 'code') {
      const code = b as Tokens.Code;
      const artifact = onOpenArtifact ? artifactFromFence({ lang: code.lang, text: code.text, mode, index: i }) : null;
      if (artifact) return <ArtifactCard key={i} artifact={artifact} p={p} t={t} onOpenArtifact={onOpenArtifact} />;
      return <CodeBlock key={i} token={code} p={p} t={t} onCopyText={onCopyText} font={font} compact={compact} find={find} />;
    }
    if (b.type === 'hr') return <View key={i} style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.border.default, marginVertical: 12 }} />;
    if (b.type === 'blockquote') return <View key={i} style={[styles.quote, { borderColor: p.border.strong }]}><Blocks tokens={b.tokens || []} p={p} t={t} mode={mode} onCopyText={onCopyText} onOpenArtifact={onOpenArtifact} resolveImage={resolveImage} font={font} lang={lang} compact={compact} find={find} nativeIdPrefix={nativeIdPrefix} path={`${path}${i}-`} /></View>;
    if (b.type === 'list') return <View key={i} style={styles.list}>{b.items.map((item: Tokens.ListItem, index: number) => <View key={index} style={styles.listRow}>
      <Text style={[styles.text, { color: p.text.muted, width: 26 }, font]}>{item.task ? item.checked ? '☑' : '☐' : b.ordered ? `${Number(b.start) + index}.` : '•'}</Text>
      <View style={{ flex: 1 }}><Blocks tokens={item.tokens || []} p={p} t={t} mode={mode} onCopyText={onCopyText} onOpenArtifact={onOpenArtifact} resolveImage={resolveImage} font={font} lang={lang} compact={compact} find={find} nativeIdPrefix={nativeIdPrefix} path={`${path}${i}-${index}-`} /></View>
    </View>)}</View>;
    if (b.type === 'table') {
      const table = b as Tokens.Table;
      return <ScrollView key={i} horizontal style={{ marginVertical: 8 }}><View>
        {[table.header, ...table.rows].map((row, index) => <View key={index} style={styles.tableRow}>{row.map((cell, col) => <Text key={col} selectable style={[styles.tableCell, { color: p.text.primary, borderColor: p.border.default, fontWeight: index === 0 ? '700' : '400' }]}><Inline tokens={cell.tokens} p={p} resolveImage={resolveImage} find={find} /></Text>)}</View>)}
      </View></ScrollView>;
    }
    return <Text key={i} nativeID={`${nativeIdPrefix}-${path}${i}`} selectable accessibilityRole={b.type === 'heading' ? 'header' : undefined} style={[styles.text, { color: p.text.primary }, font, compact && styles.textCompact, compact && styles.textCompactTracking, last && styles.textLast, b.type === 'heading' ? { ...fontStyle('semibold', lang, Platform.OS === 'web'), fontSize: Math.max(17, 28 - b.depth * 2), marginTop: 10 } : undefined]}>
      {'tokens' in b && b.tokens ? <Inline tokens={b.tokens || []} p={p} resolveImage={resolveImage} find={find} /> : findText(plainText(('text' in b ? b.text : '') || b.raw || ''), find)}
    </Text>;
  })}</>;
}

/** Field text for tutor widgets: markdown + the same math transform the
 * transcript pipeline applies (inline TeX as codespan, display TeX as an
 * island card). */
function RichText({ text, mode, p, t, resolveImage, onOpenArtifact, font, lang = 'en' }: { text: string; mode: ThemeMode; p: Palette; t: UiStrings; resolveImage?: (src: string) => ResolvedImageSource | null; font?: { fontFamily: string }; lang?: UiLanguage } & MessageActions) {
  const parts = useMemo(() => parseRichText(text), [text]);
  return <>{parts.map((part, i) => part.kind === 'math'
    ? <MathCard key={i} tex={part.tex} index={i} mode={mode} p={p} t={t} onOpenArtifact={onOpenArtifact} />
    : <Blocks key={i} tokens={part.tokens} p={p} t={t} mode={mode} onOpenArtifact={onOpenArtifact} resolveImage={resolveImage} font={font} lang={lang} />)}</>;
}

/** The shared quiz card, wired to the host's pick handler: the card owns the
 * selection and the verdict, the host applies the stage transitions, records
 * a mistake and sends the tutor a follow-up. */
function TutorQuizCard({ quiz, slotId = null, language, onQuizPick }: {
  quiz: ParsedQuiz;
  slotId?: string | null;
  language: UiLanguage;
  onQuizPick?: (pick: QuizPick) => void;
}) {
  const t = uiStrings(language);
  const answerKey = parseAnswerKey(quiz.correct);
  const onSubmit = (letters: string[]): QuizResult => {
    const picked = letters.join('');
    const chosen = quiz.options.filter((option) => letters.includes(option.letter));
    const isRight = answerKey.length > 0 && answerKey.join('') === picked;
    onQuizPick?.({
      q: quiz.q,
      options: quiz.options,
      picked,
      pickedText: chosen.map((option) => option.text).join('; '),
      correct: quiz.correct,
      isRight,
      slotId,
    });
    const verdict: QuizVerdict = answerKey.length ? (isRight ? 'correct' : 'incorrect') : 'recorded';
    const feedback = answerKey.length
      ? (isRight ? t.quizCorrect(answerKey.join('')) : t.quizWrong(answerKey.join('')))
      : t.quizRecorded(picked);
    return { verdict, feedback };
  };
  return (
    <QuizCard
      question={quiz.q}
      options={quiz.options}
      answerKey={answerKey}
      multi={Boolean(quiz.multi)}
      explanation={quiz.explanation}
      onSubmit={onSubmit}
    />
  );
}

/** The shared practice card: the typed answer always reaches the tutor; only
 * an answer the key can compare is graded locally. */
function TutorPracticeCard({ practice, language, onPracticeSubmit }: {
  practice: ParsedPractice;
  language: UiLanguage;
  onPracticeSubmit?: (submission: PracticeSubmission) => void;
}) {
  const t = uiStrings(language);
  const correct = practice.correct ?? null;
  const onSubmitAnswer = (answer: string): AnswerFeedback => {
    const assessment = correct ? evaluatePracticeAnswer(answer, correct) : 'unverified';
    const isRight = assessment === 'correct' ? true : assessment === 'incorrect' ? false : null;
    onPracticeSubmit?.({ problem: practice.problem, answer, correct, isRight });
    if (assessment === 'correct') return { state: 'ok', text: t.practiceSelfCorrect };
    if (assessment === 'incorrect') return { state: 'bad', text: t.practiceSelfWrong(correct || '') };
    return { state: 'recorded', text: t.practiceSent };
  };
  const onRevealAnswer = (): AnswerFeedback => ({ state: 'recorded', text: '', rich: correct || '' });
  return (
    <ProblemCard
      kind="practice"
      title={practice.title}
      problem={practice.problem}
      hints={hintLevels(practice)}
      solution={practice.solution}
      hasAnswerKey={Boolean(correct)}
      onSubmitAnswer={onSubmitAnswer}
      onRevealAnswer={onRevealAnswer}
    />
  );
}

/** One scaffold block, drawn with the shared cards the web shell mounts. */
function ScaffoldView({ block, language, slotId, onQuizPick, onPracticeSubmit }: {
  block: ScaffoldBlock;
  language: UiLanguage;
  slotId?: string | null;
  onQuizPick?: (pick: QuizPick) => void;
  onPracticeSubmit?: (submission: PracticeSubmission) => void;
}) {
  switch (block.kind) {
    case 'quiz':
      return <TutorQuizCard quiz={block.parsed} slotId={slotId ?? block.slotId} language={language} onQuizPick={onQuizPick} />;
    case 'practice':
      return <TutorPracticeCard practice={block.parsed} language={language} onPracticeSubmit={onPracticeSubmit} />;
    case 'example':
      return (
        <ProblemCard
          kind="example"
          title={block.parsed.title}
          problem={block.parsed.problem}
          hints={hintLevels(block.parsed)}
          solution={block.parsed.solution}
        />
      );
    case 'flashcard':
      return <FlashcardCard front={block.parsed.front} back={block.parsed.back} />;
    case 'definition':
      return <DefinitionCard term={block.parsed.term} body={block.parsed.body} />;
    case 'key-point':
      return <KeyPointCard body={block.parsed.body} />;
    case 'theorem':
      return (
        <TheoremCard
          title={block.parsed.title}
          statement={block.parsed.statement}
          proofTitle={block.parsed.proofTitle}
          proofBody={block.parsed.proofBody}
        />
      );
    case 'proof':
      return <ProofCard title={block.parsed.title} body={block.parsed.body} />;
    case 'derivation':
      return (
        <StepsCard
          kind="derivation"
          title={block.parsed.title}
          steps={splitDerivationSteps(block.parsed.body).map((body, index) => ({ n: index + 1, body }))}
        />
      );
    case 'step':
      return <StepsCard kind="step" steps={[{ n: block.parsed.n, body: block.parsed.body }]} />;
    default:
      return null;
  }
}

function ToolCard({ tool, p, t, resolveImage, onOpenStoredArtifact, onOpenFile }: { tool: ToolCall; p: Palette; t: UiStrings } & MessageActions) {
  const [expanded, setExpanded] = useState(false);
  const { width } = useWindowDimensions();
  const state = toolState(tool);
  const status = state === 'failed' ? t.toolFailed : state === 'completed' ? t.toolCompleted : t.toolRunning;
  const duration = toolDurationLabel(tool.durationMs);
  const preview = toolInputPreview(tool.name, tool.input);
  const results = toolSearchResults(tool);
  const artifacts = toolArtifacts(tool);
  const output = toolOutputText(tool);
  const failure = state === 'failed' ? toolFailureText(tool) : '';
  const inputText = toolInputText(tool);
  const asAttachment = (artifact: { id: string; mimeType: string; name: string; kind: string }): Attachment => ({
    id: artifact.id, kind: artifact.kind === 'image' ? 'image' : 'file', name: artifact.name,
    mime: artifact.mimeType || (artifact.kind === 'image' ? 'image/*' : 'application/octet-stream'), size: 0, fileId: artifact.id,
  });
  return <View style={[styles.tool, { borderColor: p.border.default }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={t.toggleToolDetails(tool.name)} accessibilityState={{ expanded }} aria-expanded={expanded} onPress={() => setExpanded(!expanded)} style={[styles.toolHeader, { minHeight: width < 768 ? 44 : 40 }]}>
      <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: p.text.primary, fontWeight: '600', flexShrink: 1, minWidth: 0, maxWidth: '42%' }}>{toolLabel(tool.name)}</Text>
      {preview ? <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: p.text.muted, flex: 1, minWidth: 0 }}>{preview}</Text> : <View style={{ flex: 1, minWidth: 0 }} />}
      <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: state === 'failed' ? p.danger : p.text.muted, flexShrink: 0, maxWidth: '42%' }}>{status}{duration ? ` · ${duration}` : ''}</Text>
      <Text accessible={false} style={{ color: p.text.muted, fontSize: 16, lineHeight: 18, flexShrink: 0 }}>{expanded ? '⌃' : '⌄'}</Text>
    </Pressable>
    {expanded ? <View style={{ gap: 8, marginTop: 8 }}>
      {inputText ? <Text selectable style={[styles.mono, styles.toolInput, { color: p.text.muted, borderColor: p.border.default }]}>{inputText}</Text> : null}
      {failure ? <Text selectable accessibilityRole="alert" style={{ color: p.danger }}>{failure}</Text> : null}
      {output ? <ScrollView style={[styles.toolOutput, { borderColor: p.border.default, backgroundColor: p.bg.sunken }]} nestedScrollEnabled>
        <Text selectable style={[styles.mono, { color: state === 'failed' ? p.danger : p.text.secondary }]}>{output}</Text>
      </ScrollView> : null}
      {results.length ? <View style={{ gap: 8 }}>{results.map((result, index) => <View key={`${result.rawUrl}-${index}`} style={styles.resultRow}>
        <Text style={{ color: p.text.muted, width: 26 }}>[{index + 1}]</Text>
        <View style={{ flex: 1, gap: 2 }}>
          {result.url ? <Text accessibilityRole="link" onPress={() => openLink(result.url!)} style={{ color: p.accent.strong }}>{result.title}</Text> : <Text style={{ color: p.text.muted }}>{result.title}</Text>}
          {result.host || result.date || result.source ? <Text style={{ color: p.text.muted, fontSize: 12 }}>{[result.host, result.date, result.source].filter(Boolean).join(' · ')}</Text> : null}
          {result.snippet ? <Text numberOfLines={3} style={{ color: p.text.secondary, fontSize: 13 }}>{result.snippet}</Text> : null}
        </View>
      </View>)}</View> : null}
      {artifacts.map((artifact) => {
        const source = artifact.kind === 'image' ? resolveImage?.(`/api/files/${artifact.id}/raw`) ?? null : null;
        return <View key={artifact.id} style={{ gap: 6 }}>
          {source ? <Pressable accessibilityRole="button" accessibilityLabel={t.openFile(artifact.name)} onPress={() => onOpenFile?.(asAttachment(artifact))}>
            <Image accessibilityLabel={artifact.name} source={source} style={styles.image} resizeMode="contain" />
          </Pressable> : null}
          <View style={styles.artifactRow}>
            <Text numberOfLines={1} style={{ color: p.text.primary, flex: 1 }}>{artifact.name}</Text>
            {artifact.kind === 'html' && onOpenStoredArtifact ? <Pressable accessibilityRole="button" accessibilityLabel={t.openArtifact(artifact.name)} onPress={() => onOpenStoredArtifact({ id: artifact.id, mimeType: artifact.mimeType, name: artifact.name })} style={[styles.artifactOpen, { borderColor: p.border.strong }]}>
              <Text style={{ color: p.accent.strong, fontWeight: '600' }}>{t.openInIsland}</Text>
            </Pressable> : null}
            {artifact.kind === 'file' && onOpenFile ? <Pressable accessibilityRole="button" accessibilityLabel={t.openFile(artifact.name)} onPress={() => onOpenFile(asAttachment(artifact))} style={[styles.artifactOpen, { borderColor: p.border.strong }]}>
              <Text style={{ color: p.accent.strong, fontWeight: '600' }}>{t.openInIsland}</Text>
            </Pressable> : null}
          </View>
        </View>;
      })}
    </View> : null}
  </View>;
}

/** A redo appended to the transcript (baseline `handleMistakeRedo` when the
 * original card is gone, and always for practice rows): the muted banner
 * line over a fresh quiz or practice widget. Local-only, never persisted. */
export type MistakeRedoItem =
  | { id: string; kind: 'quiz'; q: string; options: QuizOption[]; correct: string | null; slotId: string }
  | { id: string; kind: 'practice'; problem: string; correct: string | null };

export function MistakeRedoCard({ item, mode, language = 'en', onQuizPick, onPracticeSubmit }: { item: MistakeRedoItem; mode: ThemeMode; language?: UiLanguage } & MessageActions) {
  const t = uiStrings(language);
  const scale = Platform.OS === 'web' ? 1.125 : 1;
  const renderRich = useCallback((source: string, _part: string): React.ReactNode => (
    <RichText text={source} mode={mode} p={getThemePaletteHex(mode)} t={t} font={fontStyle('regular', language, Platform.OS === 'web')} lang={language} />
  ), [mode, t, language]);
  return <View testID={`socrates-mistake-redo-card-${item.id}`} style={styles.redoCard}>
    <Text style={[{ color: getTutorLegacyPalette(mode).text.muted, fontSize: 12 * scale, marginBottom: 6 }, fontStyle('regular', language, Platform.OS === 'web')]}>{t.mistakeRedoBanner}</Text>
    <LearnHostProvider value={{ strings: learnStrings(language), renderRich }}>
      {item.kind === 'quiz'
        ? <TutorQuizCard quiz={{ q: item.q, options: item.options, correct: item.correct }} slotId={item.slotId} language={language} onQuizPick={onQuizPick} />
        : <TutorPracticeCard practice={{ title: '', problem: item.problem, hint: '', correct: item.correct }} language={language} onPracticeSubmit={onPracticeSubmit} />}
    </LearnHostProvider>
  </View>;
}

export const MessageContent = memo(function MessageContent({ message, mode, language = 'en', compact = false, findQuery = '', findStartIndex = 0, activeFindIndex = -1, onCopyText, onSpeakText, onEditMessage, onRegenerateMessage, onBranchMessage, onOpenArtifact, onOpenStoredArtifact, resolveImage, onOpenFile, onQuizPick, onPracticeSubmit, quizSlotResets }: { message: Message; mode: ThemeMode; language?: UiLanguage; compact?: boolean; findQuery?: string; findStartIndex?: number; activeFindIndex?: number } & MessageActions) {
  const p = getThemePaletteHex(mode);
  const userTextColor = compact ? '#ffffff' : p.text.primary;
  const t = uiStrings(language);
  const content = useMemo(() => parseMessageContent(message), [message.rawText, message.content, message.reasoningContent]);
  const artifacts = useMemo(() => artifactsFromToolCalls(message.toolCalls, mode), [message.toolCalls, mode]);
  // Assistant pipeline (strip [1] noise → footnote Notes → display-math
  // cards). User messages keep whatever was typed, verbatim.
  const segments = useMemo(
    () => message.role === 'assistant' ? parseAssistantSegments(content.text) : null,
    [message.role, content.text],
  );
  const [showReasoning, setShowReasoning] = useState(false);
  const font = fontStyle('regular', language, Platform.OS === 'web');
  const renderRich = useCallback((source: string, _part: string): React.ReactNode => (
    <RichText text={source} mode={mode} p={p} t={t} resolveImage={resolveImage} onOpenArtifact={onOpenArtifact} font={font} lang={language} />
  ), [mode, p, t, resolveImage, onOpenArtifact, font, language]);
  const messageId = (message.clientId || message.id || 'message').replace(/[^A-Za-z0-9_-]/g, '-');
  const nativeIdPrefix = `socrates-message-assistant-${messageId}`;
  const normalizedFindQuery = findQuery.trim();
  const find: FindRenderContext | undefined = normalizedFindQuery ? { query: normalizedFindQuery, normalizedQuery: normalizedFindQuery.toLocaleLowerCase(), nextIndex: findStartIndex, activeIndex: activeFindIndex } : undefined;
  return <View style={{ gap: 8 }}>
    {content.reasoning ? <View style={[styles.reasoning, { borderColor: p.border.default }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.toggleReasoning} accessibilityState={{ expanded: showReasoning }} onPress={() => setShowReasoning(!showReasoning)}><Text style={{ color: p.text.muted }}>{t.reasoning} {showReasoning ? '⌃' : '⌄'}</Text></Pressable>
      {showReasoning ? <Text selectable style={[styles.text, { color: p.text.secondary }]}>{content.reasoning}</Text> : null}
    </View> : null}
    {message.role === 'user' ? <Text nativeID={`socrates-message-user-${messageId}`} selectable style={[styles.text, styles.userText, compact && styles.userTextCompact, { color: userTextColor }, font]}>{findText(content.text, find)}</Text> : segments && segments.length ? <LearnHostProvider value={{ strings: learnStrings(language), renderRich }}>{segments.map((segment, i) => {
      if (segment.kind === 'math') return <MathCard key={i} tex={segment.tex} index={i} mode={mode} p={p} t={t} onOpenArtifact={onOpenArtifact} />;
      if (segment.kind === 'notes') return <NotesSection key={i} notes={segment.notes} p={p} t={t} find={find} />;
      if (segment.kind === 'scaffold') {
        const slotId = messageQuizSlotId(message);
        return <ScaffoldView key={`${i}:${quizSlotResets?.[slotId] || 0}`} block={segment.block} language={language} slotId={slotId} onQuizPick={onQuizPick} onPracticeSubmit={onPracticeSubmit} />;
      }
      if (segment.kind === 'scaffoldFallback') return <View key={i} style={styles.scaffold}>
        <Text style={{ color: p.text.muted, fontWeight: '600' }}>{t.scaffoldFallback}</Text>
        <Text selectable style={[styles.mono, { color: p.text.secondary }]}>{findText(segment.text, find)}</Text>
      </View>;
      return <Blocks key={i} tokens={segment.tokens} p={p} t={t} mode={mode} onCopyText={onCopyText} onOpenArtifact={onOpenArtifact} resolveImage={resolveImage} font={font} lang={language} compact={compact} find={find} nativeIdPrefix={`${nativeIdPrefix}-segment-${i}`} />;
    })}</LearnHostProvider> : content.tokens.length ? <Blocks tokens={content.tokens} p={p} t={t} mode={mode} onCopyText={onCopyText} onOpenArtifact={onOpenArtifact} resolveImage={resolveImage} font={font} lang={language} compact={compact} find={find} nativeIdPrefix={nativeIdPrefix} /> : <Text nativeID={`${nativeIdPrefix}-thinking`} style={[styles.text, { color: p.text.muted }, font, compact && styles.textCompact]}>{t.thinking}</Text>}
    {message.attachments?.map((attachment) => {
      const inline = attachment.kind === 'image' && attachment.dataUrl ? safeImage(attachment.dataUrl) : null;
      const rawSrc = attachment.fileId ? `/api/files/${attachment.fileId}/raw` : '';
      const preview = inline ? { uri: inline } : (rawSrc ? resolveImage?.(rawSrc) ?? null : null);
      return <View key={attachment.id} style={[styles.attachment, { borderColor: p.border.default, backgroundColor: p.bg.sunken }]}>
        {preview ? <Image accessibilityLabel={attachment.name} source={preview} style={styles.attachmentImage} resizeMode="contain" /> : null}
        <View style={styles.attachmentRow}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: p.text.primary, fontWeight: '500' }}>{attachment.name || t.file}</Text>
            <Text style={{ color: p.text.muted, fontSize: 12 }}>{fileKindLabel(attachment.name, attachment.mime)}{attachment.size ? ` · ${formatFileSize(attachment.size)}` : ''}</Text>
          </View>
          {attachment.fileId && onOpenFile ? <Pressable accessibilityRole="button" accessibilityLabel={t.openFile(attachment.name)} onPress={() => onOpenFile(attachment)} style={[styles.artifactOpen, { borderColor: p.border.strong }]}>
            <Text style={{ color: p.accent.strong, fontWeight: '600' }}>{t.openInIsland}</Text>
          </Pressable> : null}
        </View>
      </View>;
    })}
    {message.toolCalls?.map((tool) => <ToolCard key={tool.id} tool={tool} p={p} t={t} resolveImage={resolveImage} onOpenArtifact={onOpenArtifact} onOpenStoredArtifact={onOpenStoredArtifact} onOpenFile={onOpenFile} />)}
    {artifacts.map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} p={p} t={t} onOpenArtifact={onOpenArtifact} />)}
    {message.citations?.map((citation) => safeLink(citation.url) ? <Text key={citation.id} accessibilityRole="link" style={{ color: p.accent.strong }} onPress={() => openLink(citation.url)}>{citation.title || citation.url}</Text> : null)}
  </View>;
});
const styles = StyleSheet.create({
  /* RN-14: find matches in neutral grey that reads on both modes; the active one is solid. */
  findMark: { backgroundColor: 'rgba(128, 128, 128, 0.28)' },
  findActive: { backgroundColor: '#5d5d5d', color: '#ffffff' },
  text: { fontSize: 16, lineHeight: 28, marginBottom: 12 },
  textLast: { marginBottom: 0 },
  userText: { marginBottom: 0 },
  userTextCompact: { fontSize: 16.875, lineHeight: 27.84375, letterSpacing: -0.10125 },
  /* ≤768px baseline: 15px at --app-font-scale 1.125 with 1.65 line-height
     (styles/components/chat.css mobile block). */
  textCompact: { fontSize: 16.875, lineHeight: 27.8438, marginBottom: 10 },
  textCompactTracking: { letterSpacing: -0.10125 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14 },
  code: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginVertical: 8 },
  codeHeader: { padding: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  codeText: { padding: 12, lineHeight: 22 },
  codeToggle: { padding: 10, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  quote: { paddingLeft: 12, borderLeftWidth: 3, marginVertical: 8 },
  list: { marginVertical: 4 }, listRow: { flexDirection: 'row', gap: 6 },
  tableRow: { flexDirection: 'row' }, tableCell: { width: 160, padding: 8, borderWidth: StyleSheet.hairlineWidth },
  tool: { width: '100%', minWidth: 0, padding: 12, borderWidth: 1, borderRadius: 12 }, toolHeader: { width: '100%', minWidth: 0, flexDirection: 'row', flexWrap: 'nowrap', gap: 8, alignItems: 'center' },
  toolInput: { borderWidth: 1, borderRadius: 8, padding: 8, maxHeight: 160 },
  toolOutput: { borderWidth: 1, borderRadius: 8, padding: 8, maxHeight: 260 },
  resultRow: { flexDirection: 'row', gap: 6 },
  artifactRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reasoning: { padding: 12, borderWidth: 1, borderRadius: 12, gap: 8 },
  artifact: { padding: 12, borderWidth: 1, borderRadius: 12, gap: 8 },
  artifactHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  artifactOpen: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  math: { padding: 12, borderWidth: 1, borderRadius: 12, gap: 8, marginVertical: 8 },
  mathTex: { lineHeight: 22 },
  attachment: { padding: 10, borderWidth: 1, borderRadius: 12, gap: 8 },
  attachmentImage: { width: '100%', maxHeight: 220, borderRadius: 8 },
  attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  image: { width: 260, maxWidth: '100%', height: 180 },
  scaffold: { padding: 12, borderRadius: 12, gap: 10, marginVertical: 6 },
  redoCard: { marginTop: 20 },
});
