import React, { memo, useMemo, useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getThemePaletteHex, type ThemeMode } from '@socrates/theme';
import type { Message, ToolCall } from '@socrates/contracts';
import type { Token, Tokens } from 'marked';
import { parseMessageContent, plainText, safeImage, safeLink } from './messageContent';
import { uiStrings, type UiLanguage, type UiStrings } from './strings';

type Palette = ReturnType<typeof getThemePaletteHex>;
export type MessageActions = { onCopyText?: (text: string) => Promise<void>; onSpeakText?: (text: string) => void };
const openLink = (url: string) => { const safe = safeLink(url); if (safe) void Linking.openURL(safe).catch(() => undefined); };

function Inline({ tokens, p }: { tokens: Token[]; p: Palette }) {
  return <>{tokens.map((t, i) => {
    if (t.type === 'strong' || t.type === 'em' || t.type === 'del') return <Text key={i} style={t.type === 'strong' ? { fontWeight: '700' } : t.type === 'em' ? { fontStyle: 'italic' } : { textDecorationLine: 'line-through' }}><Inline tokens={t.tokens || []} p={p} /></Text>;
    if (t.type === 'codespan') return <Text key={i} style={[styles.mono, { backgroundColor: p.bg.hover }]}>{plainText(t.text)}</Text>;
    if (t.type === 'br') return <Text key={i}>{'\n'}</Text>;
    if (t.type === 'link') {
      const url = safeLink(t.href);
      return <Text key={i} accessibilityRole={url ? 'link' : undefined} onPress={url ? () => openLink(url) : undefined} style={url ? { color: p.accent.strong, textDecorationLine: 'underline' } : undefined}><Inline tokens={t.tokens || []} p={p} /></Text>;
    }
    if (t.type === 'image') {
      const url = safeImage(t.href);
      return url ? <Image key={i} accessibilityLabel={t.text || 'Image'} source={{ uri: url }} style={styles.image} resizeMode="contain" /> : <Text key={i}>{plainText(t.text || '')}</Text>;
    }
    if ('tokens' in t && t.tokens) return <Inline key={i} tokens={t.tokens || []} p={p} />;
    // HTML is selectable literal text: assistant markup never executes here.
    return <Text key={i}>{plainText(('text' in t ? t.text : '') || t.raw || '')}</Text>;
  })}</>;
}

function CodeBlock({ token, p, t, onCopyText }: { token: Tokens.Code; p: Palette; t: UiStrings } & MessageActions) {
  const [notice, setNotice] = useState('');
  const copy = async () => {
    try { await onCopyText?.(token.text); setNotice(t.copied); }
    catch { setNotice(t.copyFailed); }
  };
  return <View style={[styles.code, { backgroundColor: p.bg.sunken, borderColor: p.border.default }]}>
    <View style={styles.codeHeader}>
      <Text style={{ color: p.text.muted }}>{token.lang || t.code}</Text>
      {onCopyText ? <Pressable accessibilityRole="button" accessibilityLabel={t.copyCode} onPress={() => void copy()}><Text style={{ color: p.text.secondary }}>{notice || t.copyCode}</Text></Pressable> : null}
    </View>
    <ScrollView horizontal><Text selectable style={[styles.codeText, styles.mono, { color: p.text.primary }]}>{token.text}</Text></ScrollView>
  </View>;
}

function Blocks({ tokens, p, t, onCopyText }: { tokens: Token[]; p: Palette; t: UiStrings } & MessageActions) {
  return <>{tokens.map((b, i) => {
    if (b.type === 'space' || b.type === 'def') return null;
    if (b.type === 'code') return <CodeBlock key={i} token={b as Tokens.Code} p={p} t={t} onCopyText={onCopyText} />;
    if (b.type === 'hr') return <View key={i} style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.border.default, marginVertical: 12 }} />;
    if (b.type === 'blockquote') return <View key={i} style={[styles.quote, { borderColor: p.border.strong }]}><Blocks tokens={b.tokens || []} p={p} t={t} onCopyText={onCopyText} /></View>;
    if (b.type === 'list') return <View key={i} style={styles.list}>{b.items.map((item: Tokens.ListItem, index: number) => <View key={index} style={styles.listRow}>
      <Text style={[styles.text, { color: p.text.muted, width: 26 }]}>{item.task ? item.checked ? '☑' : '☐' : b.ordered ? `${Number(b.start) + index}.` : '•'}</Text>
      <View style={{ flex: 1 }}><Blocks tokens={item.tokens || []} p={p} t={t} onCopyText={onCopyText} /></View>
    </View>)}</View>;
    if (b.type === 'table') {
      const table = b as Tokens.Table;
      return <ScrollView key={i} horizontal style={{ marginVertical: 8 }}><View>
        {[table.header, ...table.rows].map((row, index) => <View key={index} style={styles.tableRow}>{row.map((cell, col) => <Text key={col} selectable style={[styles.tableCell, { color: p.text.primary, borderColor: p.border.default, fontWeight: index === 0 ? '700' : '400' }]}><Inline tokens={cell.tokens} p={p} /></Text>)}</View>)}
      </View></ScrollView>;
    }
    return <Text key={i} selectable accessibilityRole={b.type === 'heading' ? 'header' : undefined} style={[styles.text, { color: p.text.primary }, b.type === 'heading' ? { fontWeight: '700', fontSize: Math.max(17, 28 - b.depth * 2), marginTop: 10 } : undefined]}>
      {'tokens' in b && b.tokens ? <Inline tokens={b.tokens || []} p={p} /> : plainText(('text' in b ? b.text : '') || b.raw || '')}
    </Text>;
  })}</>;
}

function ToolCard({ tool, p, t }: { tool: ToolCall; p: Palette; t: UiStrings }) {
  const [expanded, setExpanded] = useState(false);
  const status = tool.isError ? t.toolFailed : tool.progressPhase === 'completed' || tool.output != null ? t.toolCompleted : tool.progressPhase || t.toolRunning;
  return <View style={[styles.tool, { borderColor: p.border.default }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={t.toggleToolDetails(tool.name)} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.toolHeader}>
      <Text style={{ color: p.text.primary, fontWeight: '600', flex: 1 }}>{tool.name}</Text><Text style={{ color: tool.isError ? p.danger : p.text.muted }}>{status} {expanded ? '⌃' : '⌄'}</Text>
    </Pressable>
    {expanded ? <View style={{ gap: 8, marginTop: 8 }}>
      {tool.argumentsText || tool.input ? <Text selectable style={[styles.mono, { color: p.text.muted }]}>{tool.argumentsText || JSON.stringify(tool.input, null, 2)}</Text> : null}
      {tool.output || tool.errorText || tool.userMessage ? <Text selectable style={{ color: tool.isError ? p.danger : p.text.secondary }}>{tool.output || tool.userMessage || tool.errorText}</Text> : null}
      {tool.results?.map((result, i) => typeof result.url === 'string' && safeLink(result.url) ? <Text key={i} accessibilityRole="link" style={{ color: p.accent.strong }} onPress={() => openLink(result.url as string)}>{typeof result.title === 'string' ? result.title : result.url}</Text> : null)}
    </View> : null}
  </View>;
}

export const MessageContent = memo(function MessageContent({ message, mode, language = 'en', onCopyText, onSpeakText }: { message: Message; mode: ThemeMode; language?: UiLanguage } & MessageActions) {
  const p = getThemePaletteHex(mode);
  const t = uiStrings(language);
  const content = useMemo(() => parseMessageContent(message), [message.rawText, message.content, message.reasoningContent]);
  const [showReasoning, setShowReasoning] = useState(false);
  const speakable = message.role === 'assistant' && content.text.trim().length > 0 ? content.text : null;
  return <View style={{ gap: 8 }}>
    {content.reasoning ? <View style={[styles.reasoning, { borderColor: p.border.default }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.toggleReasoning} accessibilityState={{ expanded: showReasoning }} onPress={() => setShowReasoning(!showReasoning)}><Text style={{ color: p.text.muted }}>{t.reasoning} {showReasoning ? '⌃' : '⌄'}</Text></Pressable>
      {showReasoning ? <Text selectable style={[styles.text, { color: p.text.secondary }]}>{content.reasoning}</Text> : null}
    </View> : null}
    {message.role === 'user' ? <Text selectable style={[styles.text, { color: p.text.primary }]}>{content.text}</Text> : content.tokens.length ? <Blocks tokens={content.tokens} p={p} t={t} onCopyText={onCopyText} /> : <Text style={{ color: p.text.muted }}>{t.thinking}</Text>}
    {speakable && onSpeakText ? (
      <Pressable accessibilityRole="button" accessibilityLabel={t.listenMessage} onPress={() => onSpeakText(speakable)} style={styles.speakRow}>
        <Text style={{ color: p.text.muted }}>{t.listen}</Text>
      </Pressable>
    ) : null}
    {message.attachments?.map((attachment) => <View key={attachment.id} style={[styles.tool, { borderColor: p.border.default }]}>
      {attachment.kind === 'image' && attachment.dataUrl && safeImage(attachment.dataUrl) ? <Image accessibilityLabel={attachment.name} source={{ uri: attachment.dataUrl }} style={styles.image} resizeMode="contain" /> : null}
      <Text style={{ color: p.text.secondary }}>{attachment.name}</Text>
    </View>)}
    {message.toolCalls?.map((tool) => <ToolCard key={tool.id} tool={tool} p={p} t={t} />)}
    {message.citations?.map((citation) => safeLink(citation.url) ? <Text key={citation.id} accessibilityRole="link" style={{ color: p.accent.strong }} onPress={() => openLink(citation.url)}>{citation.title || citation.url}</Text> : null)}
  </View>;
});
const styles = StyleSheet.create({
  text: { fontSize: 16, lineHeight: 25, marginBottom: 4 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14 },
  code: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginVertical: 8 },
  codeHeader: { padding: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  codeText: { padding: 12, lineHeight: 22 },
  quote: { paddingLeft: 12, borderLeftWidth: 3, marginVertical: 8 },
  list: { marginVertical: 4 }, listRow: { flexDirection: 'row', gap: 6 },
  tableRow: { flexDirection: 'row' }, tableCell: { width: 160, padding: 8, borderWidth: StyleSheet.hairlineWidth },
  tool: { padding: 12, borderWidth: 1, borderRadius: 12 }, toolHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  reasoning: { padding: 12, borderWidth: 1, borderRadius: 12, gap: 8 },
  speakRow: { alignSelf: 'flex-start', paddingVertical: 4 },
  image: { width: 260, maxWidth: '100%', height: 180 },
});
