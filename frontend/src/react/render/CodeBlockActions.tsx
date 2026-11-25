import { useEffect, useRef, useState } from 'react';
import { Check, ClipboardX, Copy, Expand } from 'lucide-react';
import { Button } from '../ui/shadcn/button';
import { Textarea } from '../ui/shadcn/textarea';
import { openVizModalRaw } from '../../render/vizStubs.ts';
import { esc } from '../../render/text.ts';
import { i18n } from '../../ui/legacyI18n.ts';

export interface CodeBlockActionsProps {
  codeElement: HTMLElement;
  language: string;
}

function translate(key: string, fallback: string): string {
  return i18n(key, fallback);
}

export function CodeBlockActions({ codeElement, language }: CodeBlockActionsProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const feedbackTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    },
    [],
  );

  async function copyCode() {
    const text = codeElement.querySelector('code')?.textContent || '';
    if (!text) {
      setCopyState('failed');
      return;
    }
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
      } else {
        const fallback = fallbackRef.current;
        if (!fallback) throw new Error('Clipboard fallback is unavailable');
        const previous = document.activeElement as HTMLElement | null;
        fallback.value = text;
        fallback.focus();
        fallback.select();
        const copied = document.execCommand('copy');
        previous?.focus?.();
        if (!copied) throw new Error('Clipboard copy failed');
      }
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setCopyState('idle'), 1800);
  }

  function expandCode() {
    const code = codeElement.querySelector('code')?.textContent || '';
    const html = `<pre style="margin:0;border:0;background:transparent;padding:18px 20px;font-family:var(--font-mono);font-size:13px;line-height:1.6;color:var(--ui-text-secondary);white-space:pre-wrap;word-break:break-word;max-height:calc(100vh - 120px);overflow:auto"><code>${esc(code)}</code></pre>`;
    openVizModalRaw(html, `${language || 'code'} source`);
  }

  const copyLabel =
    copyState === 'copied'
      ? translate('tool.copied', 'Copied')
      : copyState === 'failed'
        ? translate('tool.copyFailed', 'Copy failed')
        : translate('tool.copyCode', 'Copy');

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="code-block-expand"
        aria-label="Expand code"
        title="Expand"
        onClick={expandCode}
      >
        <Expand aria-hidden="true" />
      </Button>
      <Button
        variant={
          copyState === 'failed' ? 'destructive' : copyState === 'copied' ? 'secondary' : 'ghost'
        }
        size="sm"
        className={`code-block-copy${copyState === 'copied' ? ' copied' : ''}${copyState === 'failed' ? ' copy-failed' : ''}`}
        aria-label={copyLabel}
        title={copyLabel}
        onClick={copyCode}
      >
        {copyState === 'copied' ? (
          <Check aria-hidden="true" />
        ) : copyState === 'failed' ? (
          <ClipboardX aria-hidden="true" />
        ) : (
          <Copy aria-hidden="true" />
        )}
        <span className="code-block-copy-label">{copyLabel}</span>
      </Button>
      <Textarea
        ref={fallbackRef}
        aria-hidden="true"
        tabIndex={-1}
        readOnly
        className="code-block-clipboard-fallback"
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: '1px',
          height: '1px',
          minHeight: 0,
          opacity: 0,
          padding: 0,
          border: 0,
        }}
      />
    </>
  );
}
