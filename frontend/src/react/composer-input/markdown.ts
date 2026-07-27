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

function renderNode(node: JSONContent, depth = 0): string {
  const children = node.content ?? [];
  switch (node.type) {
    case 'doc':
      return children.map((child) => renderNode(child, depth)).filter(Boolean).join('\n\n');
    case 'paragraph':
      return children.map(renderInline).join('');
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 1)));
      return `${'#'.repeat(level)} ${children.map(renderInline).join('')}`;
    }
    case 'blockquote':
      return renderNode({ type: 'doc', content: children }, depth)
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'codeBlock': {
      const language = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
      const code = children.map((child) => child.text ?? '').join('');
      return `\`\`\`${language}\n${code}\n\`\`\``;
    }
    case 'bulletList':
      return children.map((child) => renderNode(child, depth)).join('\n');
    case 'orderedList': {
      const start = Number(node.attrs?.start ?? 1);
      return children
        .map((child, index) => renderNode({ ...child, attrs: { ...child.attrs, ordinal: start + index } }, depth))
        .join('\n');
    }
    case 'taskList':
      return children.map((child) => renderNode(child, depth)).join('\n');
    case 'listItem':
    case 'taskItem': {
      const body = children.map((child) => renderNode(child, depth + 1)).join('\n');
      const prefix = node.type === 'taskItem'
        ? `- [${node.attrs?.checked ? 'x' : ' '}] `
        : node.attrs?.ordinal
          ? `${node.attrs.ordinal}. `
          : '- ';
      return indent(body, `${'  '.repeat(depth)}${prefix}`);
    }
    case 'horizontalRule':
      return '---';
    default:
      return children.map((child) => renderNode(child, depth)).join('');
  }
}

export function tiptapJSONToMarkdown(doc: JSONContent | null | undefined): string {
  if (!doc) return '';
  return renderNode(doc).replace(/\n{3,}/g, '\n\n').trim();
}

