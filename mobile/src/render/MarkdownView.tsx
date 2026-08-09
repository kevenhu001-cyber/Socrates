import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { native } from '../native/native';
import {
  hasMath,
  inlineToHtml,
  inlineToText,
  parseMarkdown,
  safeHref,
  type Block,
  type InlineNode,
} from './markdown';
import { chartBody, mathBody, mermaidBody, RichBlock, type RichLib } from './RichBlock';

// Stable module-level arrays: RichBlock memoises its HTML on `libs` identity.
const KATEX_ONLY: RichLib[] = ['katex'];
const MERMAID_LIBS: RichLib[] = ['mermaid'];
const ECHARTS_LIBS: RichLib[] = ['echarts'];
const HTML_LIBS: RichLib[] = [];

/** Trailing caret shown while a message is still streaming. */
const CARET = '▍';

function Inline({ nodes, style }: { nodes: InlineNode[]; style?: TextStyle }) {
  const { colors, typography } = useTheme();

  const render = (list: InlineNode[], keyPrefix: string): React.ReactNode[] => list.map((node, index) => {
    const key = `${keyPrefix}.${index}`;
    switch (node.type) {
      case 'text':
        return <Text key={key}>{node.text}</Text>;
      case 'code':
        return (
          <Text key={key} style={{ fontFamily: typography.mono, fontSize: 14, color: colors.codeFg, backgroundColor: colors.codeBg }}>
            {` ${node.text} `}
          </Text>
        );
      case 'math':
        // Inline math inside a paragraph cannot host a WebView (a `<View>` is
        // illegal inside `<Text>`), so keep the LaTeX legible in the accent
        // colour. Standalone formulas get a real RichBlock below.
        return (
          <Text key={key} style={{ fontFamily: typography.mono, fontSize: 14, color: colors.accent }}>
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
 * A paragraph whose inline math is worth typesetting. Rendering the whole
 * paragraph in one WebView keeps the formulas on the same baseline as the
 * surrounding words, which is the point of having math inline at all.
 */
function MathParagraph({ nodes, fontSize }: { nodes: InlineNode[]; fontSize: number }) {
  const html = useMemo(() => `<div style="text-align:left;font-size:${fontSize}px">${inlineToHtml(nodes)}</div>`, [nodes, fontSize]);
  return <RichBlock body={html} libs={KATEX_ONLY} fallbackText={inlineToText(nodes)} center={false} initialHeight={fontSize * 1.6} />;
}

function BlockView({ block, index }: { block: Block; index: number }) {
  const { colors, radius, spacing, typography } = useTheme();
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
      return <Inline nodes={block.inline} style={style} />;
    }

    case 'paragraph': {
      if (hasMath(block.inline)) {
        return <View style={styles.spaced}><MathParagraph nodes={block.inline} fontSize={16} /></View>;
      }
      return <Inline nodes={block.inline} style={{ fontSize: 16, lineHeight: 25, color: colors.text, marginBottom: 6 }} />;
    }

    case 'code':
      return (
        <View style={[styles.code, { backgroundColor: colors.codeBg, borderColor: colors.codeBorder, borderRadius: radius.sm }]}>
          {block.lang ? <Text style={[styles.codeLang, { color: colors.textSubtle }]}>{block.lang}</Text> : null}
          <Text selectable style={[styles.codeText, { color: colors.codeFg, fontFamily: typography.mono }]}>{block.text}</Text>
        </View>
      );

    case 'math':
      // An unterminated `$$` block is still arriving; typesetting it would only
      // flash a syntax error, so show the source until the closer lands.
      if (!block.closed) {
        return (
          <View style={[styles.code, { backgroundColor: colors.codeBg, borderColor: colors.codeBorder, borderRadius: radius.sm }]}>
            <Text style={[styles.codeText, { color: colors.textMuted, fontFamily: typography.mono }]}>{block.text}</Text>
          </View>
        );
      }
      return (
        <View style={styles.spaced}>
          <RichBlock body={mathBody(block.text, true)} libs={KATEX_ONLY} fallbackText={block.text} initialHeight={52} />
        </View>
      );

    case 'viz': {
      if (!block.closed) {
        return (
          <View style={[styles.code, { backgroundColor: colors.codeBg, borderColor: colors.codeBorder, borderRadius: radius.sm }]}>
            <Text style={[styles.codeText, { color: colors.textMuted, fontFamily: typography.mono }]}>{block.text}</Text>
          </View>
        );
      }
      if (block.kind === 'mermaid') {
        return (
          <View style={styles.spaced}>
            <RichBlock body={mermaidBody(block.text)} libs={MERMAID_LIBS} fallbackText={block.text} initialHeight={200} />
          </View>
        );
      }
      if (block.kind === 'plot') {
        return (
          <View style={styles.spaced}>
            <RichBlock body={chartBody(block.text)} libs={ECHARTS_LIBS} fallbackText={block.text} initialHeight={260} />
          </View>
        );
      }
      // Model-authored HTML/SVG: rendered as-is, which is exactly what the web
      // client does for a `viz` fence.
      return (
        <View style={styles.spaced}>
          <RichBlock body={block.text} libs={HTML_LIBS} fallbackText={block.text} initialHeight={220} />
        </View>
      );
    }

    case 'list':
      return (
        <View style={styles.spaced}>
          {block.items.map((item, itemIndex) => (
            <View key={itemIndex} style={[styles.listRow, { paddingLeft: item.depth * spacing.md }]}>
              <Text style={[styles.bullet, { color: item.checked === undefined ? colors.textSubtle : colors.accent }]}>
                {item.checked === undefined
                  ? (block.ordered && item.index ? `${item.index}.` : '•')
                  : (item.checked ? '☑' : '☐')}
              </Text>
              <View style={styles.listBody}>
                {hasMath(item.inline)
                  ? <MathParagraph nodes={item.inline} fontSize={16} />
                  : <Inline nodes={item.inline} style={{ fontSize: 16, lineHeight: 24, color: colors.text }} />}
              </View>
            </View>
          ))}
        </View>
      );

    case 'quote':
      return (
        <View style={[styles.quote, { borderLeftColor: colors.accent, paddingLeft: spacing.sm }]}>
          {block.blocks.map((child, childIndex) => <BlockView key={childIndex} block={child} index={childIndex} />)}
        </View>
      );

    case 'hr':
      return <View style={[styles.hr, { backgroundColor: colors.border }]} />;

    case 'table': {
      const columns = Math.max(block.header.length, ...block.rows.map((row) => row.length), 1);
      const cellStyle = { flex: 1, minWidth: 0, paddingHorizontal: 8, paddingVertical: 7 };
      return (
        <View style={[styles.table, { borderColor: colors.border, borderRadius: radius.sm }]}>
          <View style={[styles.tableRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            {Array.from({ length: columns }, (_, column) => (
              <View key={column} style={cellStyle}>
                <Inline nodes={block.header[column] || []} style={{ fontSize: 13, fontWeight: '700', color: colors.text }} />
              </View>
            ))}
          </View>
          {block.rows.map((row, rowIndex) => (
            <View key={rowIndex} style={[styles.tableRow, { borderBottomColor: colors.border, borderBottomWidth: rowIndex === block.rows.length - 1 ? 0 : StyleSheet.hairlineWidth }]}>
              {Array.from({ length: columns }, (_, column) => (
                <View key={column} style={cellStyle}>
                  <Inline nodes={row[column] || []} style={{ fontSize: 13, lineHeight: 19, color: colors.textMuted }} />
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    }

    default:
      return null;
  }
}

export interface MarkdownProps {
  text: string;
  /** Appends a caret to the last block while the message is still arriving. */
  streaming?: boolean;
}

/**
 * Hybrid Markdown renderer: prose, lists, tables and code are native views,
 * and only math/diagram blocks mount a WebView. Memoised on the raw text so a
 * streaming delta reparses once per update rather than once per child.
 */
export const Markdown = React.memo(function Markdown({ text, streaming }: MarkdownProps) {
  const { colors } = useTheme();
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  if (!blocks.length) {
    return streaming ? <Text style={{ color: colors.textSubtle, fontSize: 16 }}>{CARET}</Text> : null;
  }
  return (
    <View>
      {blocks.map((block, index) => <BlockView key={index} block={block} index={index} />)}
      {streaming ? <Text style={{ color: colors.textSubtle, fontSize: 16, lineHeight: 20 }}>{CARET}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  strong: { fontWeight: '700' },
  em: { fontStyle: 'italic' },
  del: { textDecorationLine: 'line-through' },
  spaced: { marginBottom: 8 },
  code: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  codeLang: { fontSize: 10, letterSpacing: 1, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  codeText: { fontSize: 13, lineHeight: 20 },
  listRow: { flexDirection: 'row', marginBottom: 4 },
  bullet: { width: 24, fontSize: 15, lineHeight: 24 },
  listBody: { flex: 1, minWidth: 0 },
  quote: { borderLeftWidth: 3, marginBottom: 8 },
  hr: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  table: { borderWidth: 1, marginBottom: 8, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
});
