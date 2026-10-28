import type { JSONContent } from '@tiptap/react';

const escapeText = (value: string): string =>
  value.replace(/([\\`*_{}[\]()#+.!>|~-])/g, '\\$1');

function renderMarks(text: string, marks: JSONContent['marks'] = []): string {
  let output = escapeText(text);
  for (const mark of marks ?? []) {
    if (mark.type === 'bold') output = `**${output}**`;
    else if (mark.type === 'italic') output = `*${output}*`;
    else if (mark.type === 'strike') output = `~~${output}~~`;
    else if (mark.type === 'underline') output = `<u>${output}</u>`;
    else if (mark.type === 'code') output = `\`${text.replace(/`/g, '\\`')}\``;
    else if (mark.type === 'link' && typeof mark.attrs?.href === 'string') {
      output = `[${output}](${mark.attrs.href})`;
    }
  }
  return output;
}

function renderInline(node: JSONContent): string {
  if (node.type === 'text') return renderMarks(node.text ?? '', node.marks);
  if (node.type === 'hardBreak') return '  \n';
  return (node.content ?? []).map(renderInline).join('');
}

function indent(value: string, prefix: string): string {
  return value
    .split('\n')
    .map((line, index) => `${index === 0 ? prefix : ' '.repeat(prefix.length)}${line}`)
    .join('\n');
}

type NodeRenderer = (node: JSONContent, depth: number) => string;

function renderDocument(node: JSONContent, depth: number): string {
  return (node.content ?? []).map((child) => renderNode(child, depth)).filter(Boolean).join('\n\n');
}

function renderParagraph(node: JSONContent): string {
  return (node.content ?? []).map(renderInline).join('');
}

function renderHeading(node: JSONContent): string {
  const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 1)));
  return `${'#'.repeat(level)} ${(node.content ?? []).map(renderInline).join('')}`;
}

function renderBlockquote(node: JSONContent, depth: number): string {
  return renderDocument({ type: 'doc', content: node.content ?? [] }, depth)
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

function renderCodeBlock(node: JSONContent): string {
  const language = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
  const code = (node.content ?? []).map((child) => child.text ?? '').join('');
  return `\`\`\`${language}\n${code}\n\`\`\``;
}

function renderList(node: JSONContent, depth: number): string {
  return (node.content ?? []).map((child) => renderNode(child, depth)).join('\n');
}

function renderOrderedList(node: JSONContent, depth: number): string {
  const start = Number(node.attrs?.start ?? 1);
  return (node.content ?? [])
    .map((child, index) => renderNode({ ...child, attrs: { ...child.attrs, ordinal: start + index } }, depth))
    .join('\n');
}

function renderListItem(node: JSONContent, depth: number): string {
  const body = (node.content ?? []).map((child) => renderNode(child, depth + 1)).join('\n');
  const prefix = node.type === 'taskItem'
    ? `- [${node.attrs?.checked ? 'x' : ' '}] `
    : node.attrs?.ordinal
      ? `${node.attrs.ordinal}. `
      : '- ';
  return indent(body, `${'  '.repeat(depth)}${prefix}`);
}

const NODE_RENDERERS: Record<string, NodeRenderer> = {
  doc: renderDocument,
  paragraph: renderParagraph,
  heading: renderHeading,
  blockquote: renderBlockquote,
  codeBlock: renderCodeBlock,
  bulletList: renderList,
  taskList: renderList,
  orderedList: renderOrderedList,
  listItem: renderListItem,
  taskItem: renderListItem,
  horizontalRule: () => '---',
};

function renderNode(node: JSONContent, depth = 0): string {
  const renderer = NODE_RENDERERS[node.type ?? ''];
  if (renderer) return renderer(node, depth);
  return (node.content ?? []).map((child) => renderNode(child, depth)).join('');
}

export function tiptapJSONToMarkdown(doc: JSONContent | null | undefined): string {
  if (!doc) return '';
  return renderNode(doc).replace(/\n{3,}/g, '\n\n').trim();
}

