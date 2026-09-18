import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { native } from '../native/native';
import { setClipboardText } from '../native/clipboard';
import {
  hasMath,
  hideUnclosedWidgetTail,
  inlineToHtml,
  inlineToText,
  parseInline,
  parseMarkdown,
  safeHref,
  stripChatArtifacts,
  stripCitationMarkers,
  type Block,
  type InlineNode,
  type QuizOption,
} from './markdown';
import { chartBody, mathBody, mermaidBody, RichBlock, type RichLib } from './RichBlock';
import { highlightedTokens, hlStyleFor } from './highlight';

// Stable module-level arrays: RichBlock memoises its HTML on `libs` identity.
const KATEX_ONLY: RichLib[] = ['katex'];
const MERMAID_LIBS: RichLib[] = ['mermaid'];
const ECHARTS_LIBS: RichLib[] = ['echarts'];
const HTML_LIBS: RichLib[] = [];

/** Trailing caret shown while a message is still streaming. */
const CARET = '▍';

function HighlightedText({ text, highlightKey }: { text: string; highlightKey: string }) {
  const { colors } = useTheme();
  const q = highlightKey.trim().toLowerCase();
  if (!q) return <Text>{text}</Text>;
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let pos = 0;
  let k = 0;
  while (pos < text.length) {
    const found = lower.indexOf(q, pos);
    if (found === -1) {
      parts.push(<Text key={k++}>{text.slice(pos)}</Text>);
      break;
    }
    if (found > pos) parts.push(<Text key={k++}>{text.slice(pos, found)}</Text>);
    parts.push(
      <Text key={k++} style={{ backgroundColor: colors.accentSoft, color: colors.text }}>
        {text.slice(found, found + q.length)}
      </Text>,
    );
    pos = found + q.length;
  }
  return <Text>{parts}</Text>;
}

function Inline({ nodes, style, highlight }: { nodes: InlineNode[]; style?: StyleProp<TextStyle>; highlight?: string }) {
  const { colors, typography, fontScale } = useTheme();

  const render = (list: InlineNode[], keyPrefix: string): React.ReactNode[] => list.map((node, index) => {
    const key = `${keyPrefix}.${index}`;
    switch (node.type) {
      case 'text':
        return highlight?.trim()
          ? <Text key={key}><HighlightedText text={node.text} highlightKey={highlight} /></Text>
          : <Text key={key}>{node.text}</Text>;
      case 'code':
        /* Real padding instead of the old literal-space hack — RN `<Text>`
         * honours padding/borderRadius on a backgrounded span. */
        return (
          <Text key={key} style={{
            fontFamily: typography.mono,
            fontSize: 13 * fontScale,
            color: colors.codeFg,
            backgroundColor: colors.codeBg,
            paddingHorizontal: 5,
            paddingVertical: 2,
            borderRadius: 3,
          }}>
            {node.text}
          </Text>
        );
      case 'math':
        // Inline math inside a paragraph cannot host a WebView (a `<View>` is
        // illegal inside `<Text>`), so keep the LaTeX legible in the accent
        // colour. Standalone formulas get a real RichBlock below.
        return (
          <Text key={key} style={{ fontFamily: typography.mono, fontSize: 14 * fontScale, color: colors.accent }}>
            {node.text}
          </Text>
        );
      case 'link': {
        const href = safeHref(node.href);
        return (
          <Text
            key={key}
            accessibilityRole={href ? 'link' : undefined}
            onPress={href ? () => { void native.openBrowser(href); } : undefined}
            style={href ? { color: colors.accent, textDecorationLine: 'underline' } : undefined}
          >
            {render(node.children, key)}
          </Text>
        );
      }
      case 'strong':
        return <Text key={key} style={styles.strong}>{render(node.children, key)}</Text>;
      case 'em':
        return <Text key={key} style={styles.em}>{render(node.children, key)}</Text>;
      case 'del':
        return <Text key={key} style={styles.del}>{render(node.children, key)}</Text>;
      default:
        return null;
    }
  });

  return <Text selectable style={style}>{render(nodes, 'i')}</Text>;
}

/**
 * Collapsible section inside tutor widgets (solution / hint / proof),
 * mirroring the web show/hide toggles (`tutor.showSolution` etc.).
 */
function Disclosure({
  showLabel,
  hideLabel,
  children,
}: {
  showLabel: string;
  hideLabel: string;
  children: React.ReactNode;
}) {
  const { colors, typography } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: 8 }}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={{ alignSelf: 'flex-start', paddingVertical: 4 }}
      >
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.accent, fontFamily: typography.medium }}>
          {open ? hideLabel : showLabel}
        </Text>
      </AnimatedPressable>
      {open ? <View style={{ marginTop: 4 }}>{children}</View> : null}
    </View>
  );
}

/* Self-grading quiz card — ports `mountQuizWidget`/`handleQuizPick` in
 * `frontend/src/main.js:8452-8563`: tap locks the options, the pick is
 * marked selected + correct/wrong, the right answer is revealed, and a
 * feedback line reads `tutor.quizCorrect/quizWrong/quizRecorded`.
 * Mistake-book recording + AI follow-up are deferred (tutor phase). */
export interface TutorQuizAnswer {
  q: string;
  options: QuizOption[];
  correct: string | null;
  picked: QuizOption;
}

export interface TutorPracticeAnswer {
  problem: string;
  answer: string;
  correct: string | null;
  isCorrect: boolean | null;
}

function QuizWidget({ q, options, correct, interactive, highlight, onAnswer }: {
  q: string;
  options: QuizOption[];
  correct: string | null;
  interactive: boolean;
  highlight?: string;
  onAnswer?: (answer: TutorQuizAnswer) => void | Promise<void>;
}) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const [picked, setPicked] = useState<string | null>(null);
  const locked = !interactive || picked !== null;
  const feedback = picked === null
    ? null
    : !correct
      ? (t('tutor.quizRecorded') || 'Recorded: {letter}.').replace('{letter}', picked)
      : picked === correct
        ? (t('tutor.quizCorrect') || 'Correct ({answer}).').replace('{answer}', correct)
        : (t('tutor.quizWrong') || 'Not quite. The correct answer is {answer}.').replace('{answer}', correct);
  return (
    <View>
      <Text style={[styles.widgetKicker, { color: colors.textSubtle }]}>{t('tutor.quickCheck') || 'Quick check'}</Text>
      <Inline nodes={parseInline(q)} style={{ ...styles.quizQ, color: colors.text }} highlight={highlight} />
      <View style={{ gap: 6, marginTop: 8 }}>
        {options.map((o) => {
          const isPicked = picked === o.letter;
          const isAnswer = correct !== null && o.letter === correct;
          const showRight = picked !== null && isAnswer;
          const showWrong = isPicked && correct !== null && o.letter !== correct;
          return (
            <AnimatedPressable
              key={o.letter}
              accessibilityRole="button"
              accessibilityState={{ selected: isPicked, disabled: locked }}
              disabled={locked}
              onPress={() => {
                setPicked(o.letter);
                void Promise.resolve(onAnswer?.({ q, options, correct, picked: o }));
              }}
              style={[
                styles.quizOpt,
                {
                  borderColor: showRight ? colors.success : showWrong ? colors.danger : isPicked ? colors.accent : colors.border,
                  backgroundColor: showRight ? colors.successSoft : showWrong ? colors.dangerSoft : colors.surface,
                  borderRadius: radius.sm,
                },
              ]}
            >
              <Text style={[styles.quizLetter, { color: showRight ? colors.success : showWrong ? colors.danger : colors.textMuted, fontFamily: typography.semibold }]}>
                {o.letter}.
              </Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Inline nodes={parseInline(o.text)} style={[styles.quizOptText, { color: colors.text }]} highlight={highlight} />
              </View>
            </AnimatedPressable>
          );
        })}
      </View>
      {feedback ? (
        <Text style={[styles.quizFeedback, { color: picked === correct || !correct ? colors.success : colors.danger }]}>
          {feedback}
        </Text>
      ) : null}
    </View>
  );
}

function normalizePracticeAnswer(value: string) {
  return String(value || '').toLowerCase().replace(/[\s.,;:!?()[\]'"]+/g, '').trim();
}

function PracticeWidget({
  title,
  problem,
  hint,
  correct,
  highlight,
  onSubmit,
}: {
  title: string;
  problem: string;
  hint: string;
  correct: string | null;
  highlight?: string;
  onSubmit?: (answer: TutorPracticeAnswer) => void | Promise<void>;
}) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const trimmed = answer.trim();
  const isCorrect = correct
    ? normalizePracticeAnswer(trimmed) === normalizePracticeAnswer(correct)
    : null;
  const feedback = !submitted
    ? null
    : correct
      ? isCorrect
        ? (t('tutor.practiceSelfCorrect') || 'Correct.')
        : (t('tutor.practiceSelfWrong') || 'Not quite.') + ` ${correct}`
      : (t('tutor.practiceSent') || 'Answer sent to Socrates.');

  const submit = () => {
    if (!trimmed || submitted || revealed) return;
    setSubmitted(true);
    void Promise.resolve(onSubmit?.({
      problem,
      answer: trimmed,
      correct,
      isCorrect,
    }));
  };

  return (
    <View>
      <Text style={[styles.widgetKicker, { color: colors.textMuted }]}>{title}</Text>
      <Markdown text={problem} highlight={highlight} />
      {hint ? (
        <Disclosure
          showLabel={t('tutor.showHint') || 'Show hint'}
          hideLabel={t('tutor.hideHint') || 'Hide hint'}
        >
          <Markdown text={hint} highlight={highlight} />
        </Disclosure>
      ) : null}
      <TextInput
        value={answer}
        onChangeText={setAnswer}
        editable={!submitted && !revealed}
        multiline
        placeholder={t('tutor.practicePlaceholder') || 'Write your answer…'}
        placeholderTextColor={colors.textSubtle}
        style={[
          styles.practiceInput,
          {
            color: colors.text,
            borderColor: colors.border,
            backgroundColor: colors.background,
            borderRadius: radius.sm,
            fontFamily: typography.body,
          },
        ]}
      />
      <View style={styles.practiceActions}>
        {correct ? (
          <AnimatedPressable
            disabled={submitted || revealed}
            onPress={() => setRevealed(true)}
            style={styles.practiceTextButton}
          >
            <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: typography.medium }}>
              {t('tutor.revealAnswer') || 'Reveal answer'}
            </Text>
          </AnimatedPressable>
        ) : null}
        <AnimatedPressable
          disabled={!trimmed || submitted || revealed}
          onPress={submit}
          style={[
            styles.practiceSubmit,
            {
              backgroundColor: trimmed && !submitted && !revealed ? colors.text : colors.surfaceRaised,
              borderRadius: radius.sm,
            },
          ]}
        >
          <Text
            style={{
              color: trimmed && !submitted && !revealed ? colors.background : colors.textSubtle,
              fontSize: 12,
              fontFamily: typography.semibold,
            }}
          >
            {t('tutor.submitAnswer') || 'Submit answer'}
          </Text>
        </AnimatedPressable>
      </View>
      {revealed && correct ? (
        <View style={[styles.practiceReveal, { borderTopColor: colors.border }]}>
          <Markdown text={correct} highlight={highlight} />
        </View>
      ) : null}
      {feedback ? (
        <Text style={[styles.quizFeedback, { color: isCorrect === false ? colors.danger : colors.success }]}>
          {feedback}
        </Text>
      ) : null}
    </View>
  );
}

/* Tap-to-flip flashcard — mirrors `.inline-flashcard` (front always
 * visible, back behind a dashed rule once flipped). */
function FlashcardWidget({ front, back, highlight }: { front: string; back: string; highlight?: string }) {
  const { colors } = useTheme();
  const t = useT();
  const [flipped, setFlipped] = useState(false);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={t('tutor.flashcardAria') || 'Flashcard — click to flip'}
      accessibilityState={{ expanded: flipped }}
      onPress={() => setFlipped((v) => !v)}
    >
      <Markdown text={front} highlight={highlight} />
      {flipped && back ? (
        <View style={[styles.flashBack, { borderTopColor: colors.border }]}>
          <Markdown text={back} highlight={highlight} />
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

function WidgetView({
  block,
  highlight,
  onQuizAnswer,
  onPracticeSubmit,
}: {
  block: Extract<Block, { type: 'widget' }>;
  highlight?: string;
  onQuizAnswer?: (answer: TutorQuizAnswer) => void | Promise<void>;
  onPracticeSubmit?: (answer: TutorPracticeAnswer) => void | Promise<void>;
}) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const card = [styles.widgetCard, { backgroundColor: withAlpha(colors.surface, 0.7), borderColor: colors.border }];
  switch (block.kind) {
    case 'quiz':
      return (
        <View style={card}>
          <QuizWidget
            q={block.q}
            options={block.options}
            correct={block.correct}
            interactive={block.interactive !== false}
            highlight={highlight}
            onAnswer={onQuizAnswer}
          />
        </View>
      );
    case 'flashcard':
      return (
        <View style={card}>
          <FlashcardWidget front={block.front} back={block.back} highlight={highlight} />
        </View>
      );
    case 'example':
      return (
        <View style={card}>
          <Text style={[styles.widgetKicker, { color: colors.textMuted }]}>{block.title}</Text>
          {block.problem ? <Markdown text={block.problem} highlight={highlight} /> : null}
          {block.solution ? (
            <Disclosure
              showLabel={t('tutor.showSolution') || 'Show solution'}
              hideLabel={t('tutor.hideSolution') || 'Hide solution'}
            >
              <Markdown text={block.solution} highlight={highlight} />
            </Disclosure>
          ) : null}
        </View>
      );
    case 'practice':
      return (
        <View style={card}>
          <PracticeWidget
            title={block.title}
            problem={block.problem}
            hint={block.hint}
            correct={block.answerKey || null}
            highlight={highlight}
            onSubmit={onPracticeSubmit}
          />
        </View>
      );
    case 'definition':
      return (
        <View style={card}>
          {block.term ? (
            <Text style={[styles.widgetTitle, { color: colors.text, fontFamily: typography.semibold }]}>{block.term}</Text>
          ) : null}
          {block.body ? <Markdown text={block.body} highlight={highlight} /> : null}
        </View>
      );
    case 'theorem':
      return (
        <View style={card}>
          <Text style={[styles.widgetKicker, { color: colors.accent }]}>{t('tutor.theoremLabel') || 'Theorem'}</Text>
          {block.title ? (
            <Text style={[styles.widgetTitle, { color: colors.text, fontFamily: typography.semibold }]}>{block.title}</Text>
          ) : null}
          <Markdown text={block.statement} highlight={highlight} />
          {block.proof ? (
            <Disclosure
              showLabel={t('tutor.showProof') || 'Show proof'}
              hideLabel={t('tutor.hideProof') || 'Hide proof'}
            >
              <Markdown text={block.proof} highlight={highlight} />
            </Disclosure>
          ) : null}
        </View>
      );
    case 'proof':
      return (
        <View style={card}>
          <Text style={[styles.widgetKicker, { color: colors.accent }]}>{t('tutor.proofLabel') || 'Proof'}</Text>
          {block.title ? (
            <Text style={[styles.widgetTitle, { color: colors.text, fontFamily: typography.semibold }]}>{block.title}</Text>
          ) : null}
          <Markdown text={block.body} highlight={highlight} />
        </View>
      );
    case 'derivation':
      return (
        <View style={card}>
          {block.title ? (
            <Text style={[styles.widgetTitle, { color: colors.text, fontFamily: typography.semibold }]}>{block.title}</Text>
          ) : null}
          <Markdown text={block.body} highlight={highlight} />
        </View>
      );
    case 'step':
      return (
        <View style={[card, styles.stepRow]}>
          <Text style={[styles.stepNumber, { color: colors.textMuted }]}>
            {block.stepNumber > 0 ? `${block.stepNumber}.` : '·'}
          </Text>
          <View style={styles.listBody}>
            <Markdown text={block.body} highlight={highlight} />
          </View>
        </View>
      );
    case 'key-point':
      return (
        <View style={[card, styles.keyPointCard]}>
          <Text style={[styles.keyPointBullet, { color: colors.accent }]}>•</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.widgetKicker, { color: colors.textSubtle }]}>{t('tutor.keyPointLabel') || 'Key Point'}</Text>
            <Markdown text={block.body} highlight={highlight} />
          </View>
        </View>
      );
    default:
      return null;
  }
}

/**
 * A paragraph whose inline math is worth typesetting. Rendering the whole
 * paragraph in one WebView keeps the formulas on the same baseline as the
 * surrounding words, which is the point of having math inline at all.
 */
function MathParagraph({ nodes, fontSize }: { nodes: InlineNode[]; fontSize: number }) {
  /* Key the memo on node content, not identity: a re-parse (streaming delta,
   * highlight toggle) yields an equal-but-new array, and rebuilding the HTML
   * would remount the WebView and flash the spinner. */
  const nodesKey = useMemo(() => JSON.stringify(nodes), [nodes]);
  const html = useMemo(
    // nodesKey serialises nodes, so this only recomputes on real content change.
    () => `<div style="text-align:left;font-size:${fontSize}px">${inlineToHtml(JSON.parse(nodesKey) as InlineNode[])}</div>`,
    [nodesKey, fontSize],
  );
  return <RichBlock body={html} libs={KATEX_ONLY} fallbackText={inlineToText(nodes)} center={false} initialHeight={fontSize * 1.6} />;
}

/* Fenced code block — mirrors the web card: 28px header bar (language
 * label left, copy button right), radius 16, 12px mono, and a horizontal
 * scroll for long lines. */
function CodeBlock({
  lang,
  text,
  dimmed,
}: {
  lang: string;
  text: string;
  /** Muted variant for unterminated streaming blocks. */
  dimmed?: boolean;
}) {
  const { colors, typography, fontScale, mode } = useTheme();
  const t = useT();
  const [copied, setCopied] = useState(false);
  /* Tokenised once per code+lang (bounded cache in highlight.ts) so a
   * streaming delta doesn't re-run the tokenizer for finished blocks. Dimmed
   * (unterminated) blocks stay plain — partial code highlights poorly. */
  const tokens = useMemo(() => (dimmed ? null : highlightedTokens(text, lang)), [text, lang, dimmed]);
  return (
    <View style={[styles.code, { backgroundColor: colors.codeBg, borderColor: colors.codeBorder }]}>
      <View style={[styles.codeHeader, { borderBottomColor: colors.codeBorder }]}>
        <Text style={[styles.codeLang, { color: colors.textSubtle }]}>{lang || 'code'}</Text>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={t('composer.canvas.copy') || 'Copy'}
          onPress={() => {
            void setClipboardText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            });
          }}
          hitSlop={8}
        >
          <Text style={{ fontSize: 11 * fontScale, fontWeight: '600', color: copied ? colors.success : colors.textMuted }}>
            {copied ? (t('common.copied') || 'Copied') : (t('composer.canvas.copy') || 'Copy')}
          </Text>
        </AnimatedPressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.codeScroll}>
        <Text selectable style={[styles.codeText, { color: dimmed ? colors.textMuted : colors.codeFg, fontFamily: typography.mono, fontSize: 12 * fontScale, lineHeight: 19 * fontScale }]}>
          {tokens
            ? tokens.map((token, i) => (
                <Text key={i} style={hlStyleFor(token.scope, mode === 'dark')}>{token.text}</Text>
              ))
            : text}
        </Text>
      </ScrollView>
    </View>
  );
}

function BlockView({
  block,
  index,
  highlight,
  muted,
  onQuizAnswer,
  onPracticeSubmit,
}: {
  block: Block;
  index: number;
  highlight?: string;
  /** Render children in the muted blockquote tone. */
  muted?: boolean;
  onQuizAnswer?: (answer: TutorQuizAnswer) => void | Promise<void>;
  onPracticeSubmit?: (answer: TutorPracticeAnswer) => void | Promise<void>;
}) {
  const { colors, radius, spacing, typography, fontScale } = useTheme();
  const sizes = typography.sizes;

  switch (block.type) {
    case 'heading': {
      const level = Math.min(4, block.level);
      const fontSize = [sizes.h2, sizes.h3, sizes.h4, sizes.bodyLg][level - 1];
      const lineHeight = [sizes.lineHeights.h2, sizes.lineHeights.h3, sizes.lineHeights.h4, sizes.lineHeights.bodyLg][level - 1];
      const style = { fontSize, lineHeight, color: colors.text, fontWeight: '700' as const, marginTop: index === 0 ? 0 : spacing.sm, marginBottom: 4 };
      if (hasMath(block.inline)) {
        return <View style={{ marginTop: index === 0 ? 0 : spacing.sm }}><MathParagraph nodes={block.inline} fontSize={fontSize} /></View>;
      }
      return <Inline nodes={block.inline} style={style} highlight={highlight} />;
    }

    case 'paragraph': {
      if (hasMath(block.inline)) {
        return <View style={styles.spaced}><MathParagraph nodes={block.inline} fontSize={15 * fontScale} /></View>;
      }
      return (
        <Inline
          nodes={block.inline}
          style={{
            fontSize: 15 * fontScale,
            lineHeight: 24.4 * fontScale,
            color: muted ? colors.textMuted : colors.text,
            fontStyle: muted ? 'italic' : 'normal',
            marginBottom: 6,
          }}
          highlight={highlight}
        />
      );
    }

    case 'code':
      return <CodeBlock lang={block.lang} text={block.text} />;

    case 'math':
      // An unterminated `$$` block is still arriving; typesetting it would only
      // flash a syntax error, so show the source until the closer lands.
      if (!block.closed) {
        return <CodeBlock lang="" text={block.text} dimmed />;
      }
      return (
        <View style={styles.spaced}>
          <RichBlock body={mathBody(block.text, true)} libs={KATEX_ONLY} fallbackText={block.text} initialHeight={52} />
        </View>
      );

    case 'viz': {
      if (!block.closed) {
        return <CodeBlock lang="" text={block.text} dimmed />;
      }
      if (block.kind === 'mermaid') {
        return (
          <View style={styles.spaced}>
            {/* Web `.visualization-stage` mermaid: auto, min-height 300px. */}
            <RichBlock body={mermaidBody(block.text)} libs={MERMAID_LIBS} fallbackText={block.text} initialHeight={300} />
          </View>
        );
      }
      if (block.kind === 'plot') {
        return (
          <View style={styles.spaced}>
            {/* Web default stage 350px, 292px at ≤520px (`styles.css:509,527`).
             * Phones are the primary native surface → 292. */}
            <RichBlock body={chartBody(block.text)} libs={ECHARTS_LIBS} fallbackText={block.text} initialHeight={292} />
          </View>
        );
      }
      // Model-authored HTML/SVG: rendered as-is, which is exactly what the web
      // client does for a `viz` fence.
      return (
        <View style={styles.spaced}>
          <RichBlock body={block.text} libs={HTML_LIBS} fallbackText={block.text} initialHeight={292} />
        </View>
      );
    }

    case 'list':
      return (
        <View style={styles.spaced}>
          {block.items.map((item, itemIndex) => (
            <View key={itemIndex} style={[styles.listRow, { paddingLeft: item.depth * spacing.md }]}>
              <Text style={[styles.bullet, { fontSize: 15 * fontScale, lineHeight: 24.4 * fontScale, color: item.checked === undefined ? colors.textSubtle : colors.accent }]}>
                {item.checked === undefined
                  ? (block.ordered && item.index ? `${item.index}.` : '•')
                  : (item.checked ? '☑' : '☐')}
              </Text>
              <View style={styles.listBody}>
                {hasMath(item.inline)
                  ? <MathParagraph nodes={item.inline} fontSize={15 * fontScale} />
                  : <Inline nodes={item.inline} style={{ fontSize: 15 * fontScale, lineHeight: 24.4 * fontScale, color: muted ? colors.textMuted : colors.text, fontStyle: muted ? 'italic' : 'normal' }} highlight={highlight} />}
              </View>
            </View>
          ))}
        </View>
      );

    case 'quote':
      return (
        <View style={[styles.quote, { borderLeftColor: withAlpha(colors.accent, 0.4), paddingLeft: spacing.sm }]}>
          {block.blocks.map((child, childIndex) => (
            <BlockView
              key={childIndex}
              block={child}
              index={childIndex}
              highlight={highlight}
              muted
              onQuizAnswer={onQuizAnswer}
              onPracticeSubmit={onPracticeSubmit}
            />
          ))}
        </View>
      );

    case 'hr':
      return <View style={[styles.hr, { backgroundColor: colors.border }]} />;

    case 'widget':
      return (
        <WidgetView
          block={block}
          highlight={highlight}
          onQuizAnswer={onQuizAnswer}
          onPracticeSubmit={onPracticeSubmit}
        />
      );

    case 'table': {
      const columns = Math.max(block.header.length, ...block.rows.map((row) => row.length), 1);
      const cellStyle = { minWidth: 90, paddingHorizontal: 12, paddingVertical: 8 };
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={[styles.table, { borderColor: colors.border, borderRadius: radius.sm }]}>
            <View style={[styles.tableRow, { backgroundColor: colors.surfaceHover, borderBottomColor: colors.border }]}>
              {Array.from({ length: columns }, (_, column) => (
                <View key={column} style={cellStyle}>
                  <Inline nodes={block.header[column] || []} style={{ fontSize: 13 * fontScale, fontWeight: '600', color: colors.text }} highlight={highlight} />
                </View>
              ))}
            </View>
            {block.rows.map((row, rowIndex) => (
              <View key={rowIndex} style={[styles.tableRow, { borderBottomColor: colors.border, borderBottomWidth: rowIndex === block.rows.length - 1 ? 0 : StyleSheet.hairlineWidth }]}>
                {Array.from({ length: columns }, (_, column) => (
                  <View key={column} style={cellStyle}>
                    <Inline nodes={row[column] || []} style={{ fontSize: 13 * fontScale, lineHeight: 19 * fontScale, color: muted ? colors.textMuted : colors.text }} highlight={highlight} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    }

    default:
      return null;
  }
}

export interface MarkdownProps {
  text: string;
  onQuizAnswer?: (answer: TutorQuizAnswer) => void | Promise<void>;
  onPracticeSubmit?: (answer: TutorPracticeAnswer) => void | Promise<void>;
  /** Appends a caret to the last block while the message is still arriving. */
  streaming?: boolean;
  /** In-session find query — matching substrings get an accent wash,
   * mirroring frontend `findInSession` highlight. */
  highlight?: string;
}

/**
 * Hybrid Markdown renderer: prose, lists, tables and code are native views,
 * and only math/diagram blocks mount a WebView. Memoised on the raw text so a
 * streaming delta reparses once per update rather than once per child.
 */
export const Markdown = React.memo(function Markdown({
  text,
  streaming,
  highlight,
  onQuizAnswer,
  onPracticeSubmit,
}: MarkdownProps) {
  const { colors, fontScale } = useTheme();
  /* Strip chat-template artifacts (`<|im_start|>`, `<s>`, `[INST]`,
   * `<think>` reasoning blocks and `<mistake>` blocks — the web routes
   * mistakes to the mistake book; mobile just hides them for now) and
   * search-citation markers before parsing, matching `formatMsg` +
   * `renderAssistantHTML` in the web client. Unclosed widget tails are
   * held back like the web live tail, and only the first quiz per
   * message self-grades (one-question-per-turn). */
  const blocks = useMemo(() => {
    const parsed = parseMarkdown(hideUnclosedWidgetTail(stripCitationMarkers(stripChatArtifacts(text))));
    let quizSeen = false;
    for (const block of parsed) {
      if (block.type !== 'widget' || block.kind !== 'quiz') continue;
      block.interactive = !quizSeen;
      quizSeen = true;
    }
    return parsed;
  }, [text]);
  if (!blocks.length) {
    return streaming ? <Text style={{ color: colors.textSubtle, fontSize: 15 * fontScale }}>{CARET}</Text> : null;
  }
  return (
    <View>
      {blocks.map((block, index) => (
        <BlockView
          key={index}
          block={block}
          index={index}
          highlight={highlight}
          onQuizAnswer={onQuizAnswer}
          onPracticeSubmit={onPracticeSubmit}
        />
      ))}
      {streaming ? <Text style={{ color: colors.textSubtle, fontSize: 15 * fontScale, lineHeight: 20 * fontScale }}>{CARET}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  strong: { fontWeight: '700' },
  em: { fontStyle: 'italic' },
  del: { textDecorationLine: 'line-through' },
  spaced: { marginBottom: 8 },
  /* Tutor widget cards sit on the raised surface like exam question cards. */
  widgetCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginVertical: 7 },
  widgetKicker: { fontSize: 11, letterSpacing: 0.8, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  widgetTitle: { fontSize: 14, lineHeight: 20, marginBottom: 6 },
  /* frontend `.inline-quiz-q`: semibold; `.inline-quiz-opt`: 13px,
   * padding 7/10, radius 6; feedback 12.5px ok/bad. */
  quizQ: { fontSize: 15, lineHeight: 22, fontWeight: '600', marginBottom: 2 },
  quizOpt: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  quizLetter: { fontSize: 13, minWidth: 18, textAlign: 'center' },
  quizOptText: { fontSize: 13, lineHeight: 19 },
  quizFeedback: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  practiceInput: { minHeight: 82, marginTop: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, lineHeight: 19, textAlignVertical: 'top' },
  practiceActions: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  practiceTextButton: { minHeight: 34, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  practiceSubmit: { minHeight: 34, minWidth: 94, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  practiceReveal: { marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  /* frontend `.inline-flashcard-back`: dashed rule above the back face. */
  flashBack: { borderTopWidth: 1, borderStyle: 'dashed', marginTop: 8, paddingTop: 8 },
  keyPointCard: { flexDirection: 'row', gap: 8 },
  keyPointBullet: { fontSize: 15, lineHeight: 22 },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNumber: { width: 20, fontWeight: '600', marginTop: 1 },
  code: { borderWidth: 1, borderRadius: 16, marginBottom: 8, overflow: 'hidden' },
  codeHeader: { height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  codeLang: { fontSize: 10, letterSpacing: 1, fontWeight: '700', textTransform: 'uppercase' },
  codeScroll: { paddingHorizontal: 12, paddingVertical: 10 },
  codeText: { fontSize: 13, lineHeight: 20 },
  listRow: { flexDirection: 'row', marginBottom: 4 },
  bullet: { width: 24, fontSize: 15, lineHeight: 24 },
  listBody: { flex: 1, minWidth: 0 },
  quote: { borderLeftWidth: 2, marginBottom: 8 },
  hr: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  table: { borderWidth: 1, marginBottom: 8, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
});
