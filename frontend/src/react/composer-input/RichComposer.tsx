import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Markdown } from '@tiptap/markdown';
import DOMPurify from 'dompurify';

import {
  notifyComposerChange,
  registerComposer,
  type ComposerSurface,
} from './controller';
import { ExtensionToken } from './extensionToken';
import { useAutoHeight } from './useAutoHeight';
import type { ComposerExtensionToken } from './types';
import { addComposerFiles } from '../../attachments/render.js';
import { i18n } from '../legacy/gateway';
import {
  removeComposerPlugin,
  useComposerPluginSelectionSnapshot,
} from '../composer/pluginSelection';

interface RichComposerProps {
  surface: ComposerSurface;
  placeholder: string;
  onSubmit: () => void;
  showToolbar?: boolean;
  onEscape?: () => void;
}

function ToolbarButton({
  active = false,
  disabled = false,
  label,
  children,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rich-composer-tool${active ? ' active' : ''}`}
      disabled={disabled}
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FormattingToolbar({ editor }: { editor: Editor }) {
  const [, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    editor.on('selectionUpdate', refresh);
    editor.on('transaction', refresh);
    return () => {
      editor.off('selectionUpdate', refresh);
      editor.off('transaction', refresh);
    };
  }, [editor]);

  const run = (command: () => boolean) => () => {
    command();
    editor.commands.focus();
  };
  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const href = window.prompt('Link URL', previous ?? 'https://');
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
  };

  return (
    <div className="rich-composer-toolbar" role="toolbar" aria-label="Formatting">
      {[1, 2, 3].map((level) => (
        <ToolbarButton
          key={level}
          label={`Heading ${level}`}
          active={editor.isActive('heading', { level })}
          onClick={run(() => editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run())}
        >
          H{level}
        </ToolbarButton>
      ))}
      <span className="rich-composer-divider" />
      <ToolbarButton label="Bold" active={editor.isActive('bold')} onClick={run(() => editor.chain().focus().toggleBold().run())}><strong>B</strong></ToolbarButton>
      <ToolbarButton label="Italic" active={editor.isActive('italic')} onClick={run(() => editor.chain().focus().toggleItalic().run())}><em>I</em></ToolbarButton>
      <ToolbarButton label="Underline" active={editor.isActive('underline')} onClick={run(() => editor.chain().focus().toggleUnderline().run())}><u>U</u></ToolbarButton>
      <ToolbarButton label="Strikethrough" active={editor.isActive('strike')} onClick={run(() => editor.chain().focus().toggleStrike().run())}><s>S</s></ToolbarButton>
      <ToolbarButton label="Link" active={editor.isActive('link')} onClick={setLink}>↗</ToolbarButton>
      <span className="rich-composer-divider" />
      <ToolbarButton label="Bullet list" active={editor.isActive('bulletList')} onClick={run(() => editor.chain().focus().toggleBulletList().run())}>•≡</ToolbarButton>
      <ToolbarButton label="Numbered list" active={editor.isActive('orderedList')} onClick={run(() => editor.chain().focus().toggleOrderedList().run())}>1≡</ToolbarButton>
      <ToolbarButton label="Task list" active={editor.isActive('taskList')} onClick={run(() => editor.chain().focus().toggleTaskList().run())}>☑</ToolbarButton>
      <ToolbarButton label="Quote" active={editor.isActive('blockquote')} onClick={run(() => editor.chain().focus().toggleBlockquote().run())}>❝</ToolbarButton>
      <ToolbarButton label="Code block" active={editor.isActive('codeBlock')} onClick={run(() => editor.chain().focus().toggleCodeBlock().run())}>{'</>'}</ToolbarButton>
      <span className="rich-composer-divider" />
      <ToolbarButton label="Undo" disabled={!editor.can().undo()} onClick={run(() => editor.chain().focus().undo().run())}>↶</ToolbarButton>
      <ToolbarButton label="Redo" disabled={!editor.can().redo()} onClick={run(() => editor.chain().focus().redo().run())}>↷</ToolbarButton>
    </div>
  );
}

function ComposerPluginChips({ surface }: { surface: ComposerSurface }) {
  const snapshot = useComposerPluginSelectionSnapshot();
  const plugins = snapshot[surface];
  if (!plugins.length) return null;

  const visiblePlugins = plugins.slice(0, 4);
  const hiddenCount = Math.max(0, plugins.length - visiblePlugins.length);
  const openTools = () => {
    const triggerId = surface === 'topic' ? 'topicComposerToolsBtn' : 'chatComposerToolsBtn';
    const trigger = document.getElementById(triggerId);
    if (trigger && typeof window.toggleComposerTools === 'function') {
      window.toggleComposerTools(trigger, surface);
    }
  };

  return (
    <div className="composer-plugin-chips" aria-label="Selected plugins">
      {visiblePlugins.map((plugin) => (
        <span className="composer-plugin-chip" key={plugin.id} title={plugin.description || plugin.name}>
          {plugin.iconMarkup ? (
            <span className="composer-plugin-chip-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: plugin.iconMarkup }} />
          ) : (
            <span className="composer-plugin-chip-icon composer-plugin-chip-fallback" aria-hidden="true">{plugin.name.slice(0, 1).toUpperCase()}</span>
          )}
          <span className="composer-plugin-chip-label">{plugin.name}</span>
          <button
            type="button"
            className="composer-plugin-chip-remove"
            aria-label={`Remove ${plugin.name}`}
            title={`Remove ${plugin.name}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              removeComposerPlugin(surface, plugin.id);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
          </button>
        </span>
      ))}
      {hiddenCount > 0 ? (
        <button type="button" className="composer-plugin-chip composer-plugin-chip-more" onClick={openTools}>
          +{hiddenCount} more
        </button>
      ) : null}
    </div>
  );
}

export function RichComposer({ surface, placeholder, onSubmit, onEscape, showToolbar = false }: RichComposerProps) {
  const onRemoveExtension = useCallback((_key: string) => {
    const legacyWindow = window as Window & { clearActiveTemplate?: () => void };
    legacyWindow.clearActiveTemplate?.();
  }, []);

  /* P_placeholder-lang — the placeholder prop is captured at mount, but the
     user can switch the app language at runtime. Re-derive the text from the
     live i18n dictionary and re-render on the language-change event, so the
     Tiptap placeholder (driven by --composer-placeholder) localizes without
     recreating the editor and losing the draft. */
  const [langRevision, setLangRevision] = useState(0);
  useEffect(() => {
    const onLangChange = () => setLangRevision((value) => value + 1);
    document.addEventListener('socrates:langchange', onLangChange);
    return () => document.removeEventListener('socrates:langchange', onLangChange);
  }, []);
  const activePlaceholder = useMemo(
    () => i18n(
      surface === 'chat' ? 'chat.inputPlaceholder' : 'topic.inputPlaceholder',
      placeholder,
    ),
    [surface, placeholder, langRevision],
  );

  const extensions = useMemo(() => [
    StarterKit.configure({ link: false, underline: false }),
    /* The visible hint text is rendered from --composer-placeholder (set on
       the root below) so React owns the current language's copy. The Tiptap
       extension still supplies the is-editor-empty / is-empty classes that
       hide the hint while the user types. */
    Placeholder.configure({ placeholder: '', showOnlyWhenEditable: false }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    ExtensionToken.configure({ onRemove: onRemoveExtension }),
    Markdown,
  ], [onRemoveExtension]);

  const tokenWasPresent = useRef(false);
  /* Focus is only an interaction state. Geometry is tracked separately so a
     one-line draft keeps exactly the same composer shape before, during, and
     after focus; the mobile two-tier layout starts only when rendered content
     actually needs a second line. */
  const composerWrapRef = useRef<HTMLElement | null>(null);
  const shapeFrameRef = useRef<number | null>(null);
  const shapeAnimationRef = useRef<{ cancel(): void } | null>(null);
  const shapeAnimationCleanupRef = useRef<(() => void) | null>(null);
  const shapeHeightRef = useRef<number | null>(null);
  const collapsedMeasureRef = useRef<{
    editorWidth: number;
    wrapWidth: number;
    editorStyle: string;
    singleLineHeight: number;
  } | null>(null);
  const captureShapeHeight = useCallback((editorDom: HTMLElement) => {
    const wrap = editorDom.closest<HTMLElement>('.chat-input-wrap, .topic-input-wrap');
    if (wrap && wrap.getClientRects().length) {
      shapeHeightRef.current = wrap.getBoundingClientRect().height;
    }
  }, []);
  const syncComposerShape = useCallback((editorDom: HTMLElement, immediate = false) => {
    if (shapeFrameRef.current !== null) cancelAnimationFrame(shapeFrameRef.current);
    const run = () => {
      shapeFrameRef.current = null;
      const wrap = editorDom.closest<HTMLElement>('.chat-input-wrap, .topic-input-wrap');
      if (!wrap) return;
      /* P_zero-delay — when the parent page is mid-view-swap (e.g. the
         topic-setup → chat-view flip in startSession()), the wrap is
         inside an ancestor that just lost `display: none`. Its first
         measurement on that frame is the pre-layout collapsed box, not
         the post-layout box, so any animation sourced from it reads as
         a 0 → 68 px jump on the very frame the user expects to be
         static. Bail instead of writing transform-style state that the
         browser will immediately invalidate on the next layout pass. */
      const hiddenAncestor = editorDom.closest('.chat-view.hidden, .topic-setup.hidden, .main-inner.hidden');
      if (hiddenAncestor) return;

      /* A selected-plugin stack is its own first row.  The empty editor that
         sits beneath it still reports a slightly taller intrinsic box on
         desktop (because the grid row includes the chip row), which used to
         make the measured-shape loop alternate `composer-multiline` on every
         frame.  Apart from causing a visible wobble, that left chip remove
         buttons perpetually "unstable" to pointer automation.  Let the
         chip-specific CSS own the empty state; only a real editor draft is
         allowed to opt into the multiline measurement below. */
      const hasPluginChips = Boolean(wrap.querySelector('.composer-plugin-chips'));
      const hasEditorText = Boolean((editorDom.textContent || '').replace(/\u200b/g, '').trim());
      if (hasPluginChips && !hasEditorText) {
        if (shapeAnimationRef.current) {
          shapeAnimationRef.current.cancel();
          shapeAnimationRef.current = null;
        }
        shapeAnimationCleanupRef.current?.();
        shapeAnimationCleanupRef.current = null;
        wrap.classList.remove('composer-multiline');
        wrap.style.removeProperty('height');
        shapeHeightRef.current = wrap.getBoundingClientRect().height;
        return;
      }
      const style = getComputedStyle(editorDom);
      const lineHeight = Number.parseFloat(style.lineHeight) || 24;
      const isMultiline = wrap.classList.contains('composer-multiline');
      const wrapWidth = wrap.getBoundingClientRect().width;
      if (!isMultiline) {
        /* The browser may have already let the editor's intrinsic height grow
           before this synchronous update runs. Do not replace the compact
           baseline with that expanded value: an explicit line break would
           then measure as one line and never promote the shell to its second
           row. Keep the smallest settled one-line measurement until the
           layout genuinely returns to the compact shape. */
        const measuredEditorHeight = editorDom.clientHeight;
        const previousSingleLineHeight = collapsedMeasureRef.current?.singleLineHeight ?? 0;
        const singleLineHeight = previousSingleLineHeight > 0
          ? Math.min(measuredEditorHeight, previousSingleLineHeight)
          : measuredEditorHeight;
        collapsedMeasureRef.current = {
          editorWidth: editorDom.getBoundingClientRect().width,
          wrapWidth,
          singleLineHeight,
          editorStyle: [
            `box-sizing:${style.boxSizing}`,
            `padding:${style.padding}`,
            `font:${style.font}`,
            `line-height:${style.lineHeight}`,
            `letter-spacing:${style.letterSpacing}`,
            `word-break:${style.wordBreak}`,
            `overflow-wrap:${style.overflowWrap}`,
            `white-space:${style.whiteSpace}`,
          ].join(';'),
        };
      }

      /* Expanded layouts give the editor the full first row. Measuring that
         wider row can immediately classify the same draft as one line again,
         producing an expand/collapse loop near the wrap boundary. When the
         shell is already expanded, measure a hidden copy at the width the
         editor has in the collapsed row instead. */
      let measureDom = editorDom;
      let measureHost: HTMLElement | null = null;
      if (isMultiline && collapsedMeasureRef.current) {
        const collapsedWidth = Math.max(
          1,
          collapsedMeasureRef.current.editorWidth
            + wrapWidth - collapsedMeasureRef.current.wrapWidth,
        );
        measureHost = document.createElement('div');
        measureHost.className = 'rich-composer composer-shape-probe';
        measureHost.dataset.surface = surface;
        measureHost.setAttribute('aria-hidden', 'true');
        measureHost.style.cssText = `position:fixed;left:-10000px;top:0;width:${collapsedWidth}px;visibility:hidden;pointer-events:none;contain:layout style;`;
        measureDom = editorDom.cloneNode(true) as HTMLElement;
        measureDom.removeAttribute('contenteditable');
        measureDom.removeAttribute('aria-label');
        measureDom.style.cssText = collapsedMeasureRef.current.editorStyle;
        measureDom.style.setProperty('width', '100%', 'important');
        measureDom.style.setProperty('height', 'auto', 'important');
        measureDom.style.setProperty('min-height', '0', 'important');
        measureDom.style.setProperty('max-height', 'none', 'important');
        measureDom.style.setProperty('overflow', 'visible', 'important');
        measureHost.appendChild(measureDom);
        document.body.appendChild(measureHost);
      }

      const measureStyle = getComputedStyle(measureDom);
      const paddingY = (Number.parseFloat(measureStyle.paddingTop) || 0)
        + (Number.parseFloat(measureStyle.paddingBottom) || 0);
      const singleLineHeight = Math.max(
        paddingY + lineHeight,
        collapsedMeasureRef.current?.singleLineHeight ?? 0,
      );
      /* scrollHeight is the browser's own wrapped-content measurement. It
         handles explicit newlines, paste, font changes and word wrapping
         more reliably than summing child rectangles (whose margins may
         collapse differently inside the off-screen probe). */
      const contentHeight = measureDom.scrollHeight;
      /* During a ProseMirror transaction the intrinsic editor height can be
         one layout pass behind the newly inserted break. The DOM structure is
         already authoritative in that frame, so recognize a real break or a
         second block directly instead of waiting for the stale scrollHeight
         to catch up. Ignore ProseMirror's synthetic trailing break used by an
         otherwise empty paragraph. */
      const hasRenderedBreak = Boolean(
        measureDom.querySelector('br:not(.ProseMirror-trailingBreak), p + p, li + li'),
      );
      measureHost?.remove();
      const shouldExpand = hasRenderedBreak || contentHeight > singleLineHeight + 1;
      const classChanges = wrap.classList.contains('composer-multiline') !== shouldExpand;
      if (!shouldExpand && !classChanges) {
        /* Empty and one-line drafts are contractually fixed at the CSS
           baseline. Releasing min-height to measure their natural content
           would incorrectly animate a 56px shell toward the editor's ~52px
           intrinsic box. */
        if (!shapeAnimationRef.current) {
          shapeHeightRef.current = wrap.getBoundingClientRect().height;
        }
        return;
      }

      /* Capture the currently painted height before cancelling an in-flight
         animation. Reading the class destination after cancel would rewind
         rapid type/delete sequences and produce a visible backwards jump. */
      const renderedHeight = wrap.getBoundingClientRect().height;
      const fromHeight = shapeAnimationRef.current
        ? renderedHeight
        : (classChanges && shouldExpand
          /* The collapsed shell is fixed-height. Use the larger of its live
             rect and cached painted height so neither synthetic multi-step
             paste nor early font settling can begin below the baseline. */
          ? Math.max(renderedHeight, shapeHeightRef.current ?? 0)
          : shapeHeightRef.current && shapeHeightRef.current > 0
          ? shapeHeightRef.current
          : renderedHeight);
      if (shapeAnimationRef.current) {
        shapeAnimationRef.current.cancel();
        shapeAnimationRef.current = null;
      }
      shapeAnimationCleanupRef.current?.();
      shapeAnimationCleanupRef.current = null;

      const shouldAnimate = !matchMedia('(prefers-reduced-motion:reduce)').matches;
      let cleanupTemporaryStyles: (() => void) | null = null;
      if (shouldAnimate) {
        /* CSS transitions outrank even important declarations while active.
           Disable them before changing the class, otherwise the legacy
           min-height transition keeps the shell clamped at 108px and the
           first frame still jumps despite our inline measurement lock. */
        const previousTransition = wrap.style.getPropertyValue('transition');
        const previousTransitionPriority = wrap.style.getPropertyPriority('transition');
        const previousMinHeight = wrap.style.getPropertyValue('min-height');
        const previousMinHeightPriority = wrap.style.getPropertyPriority('min-height');
        const previousOverflow = wrap.style.getPropertyValue('overflow');
        const previousOverflowPriority = wrap.style.getPropertyPriority('overflow');
        const previousHeight = wrap.style.getPropertyValue('height');
        const previousHeightPriority = wrap.style.getPropertyPriority('height');
        const previousBoxSizing = wrap.style.getPropertyValue('box-sizing');
        const previousBoxSizingPriority = wrap.style.getPropertyPriority('box-sizing');
        wrap.style.setProperty('transition', 'none', 'important');
        wrap.style.setProperty('min-height', '0px', 'important');
        wrap.style.setProperty('overflow', 'hidden', 'important');
        /* The shell inherits content-box sizing in parts of the legacy
           cascade. Temporarily use border-box so an interpolated `height`
           is the same number returned by getBoundingClientRect(). */
        wrap.style.setProperty('box-sizing', 'border-box', 'important');
        wrap.style.setProperty('height', `${fromHeight}px`, 'important');
        cleanupTemporaryStyles = () => {
          const restore = (property: string, value: string, priority: string) => {
            if (value) wrap.style.setProperty(property, value, priority);
            else wrap.style.removeProperty(property);
          };
          /* Keep transitions disabled while restoring geometry. Restoring the
             transition first starts a second, unintended min-height motion
             from the temporary 0px lock to the class value. */
          restore('min-height', previousMinHeight, previousMinHeightPriority);
          restore('overflow', previousOverflow, previousOverflowPriority);
          restore('height', previousHeight, previousHeightPriority);
          restore('box-sizing', previousBoxSizing, previousBoxSizingPriority);
          void wrap.getBoundingClientRect();
          restore('transition', previousTransition, previousTransitionPriority);
        };
      }
      if (classChanges) wrap.classList.toggle('composer-multiline', shouldExpand);
      /* Read the class destination with the visual lock briefly released.
         Both layouts are forced synchronously and the lock is restored before
         this task yields, so the unlocked state is never painted. */
      if (shouldAnimate) wrap.style.removeProperty('height');
      const toHeight = wrap.getBoundingClientRect().height;
      if (shouldAnimate) wrap.style.setProperty('height', `${fromHeight}px`, 'important');
      if (
        Math.abs(toHeight - fromHeight) > 1
        && shouldAnimate
      ) {
        const cleanup = cleanupTemporaryStyles!;
        shapeAnimationCleanupRef.current = cleanup;
        const duration = 340;
        const startedAt = performance.now();
        let frame = 0;
        let cancelled = false;
        const controller = {
          cancel() {
            cancelled = true;
            if (frame) cancelAnimationFrame(frame);
          },
        };
        const tick = (now: number) => {
          if (cancelled) return;
          const progress = Math.min(1, (now - startedAt) / duration);
          /* Cubic ease-out keeps the first frame below one line of travel
             even for a large paste; quintic easing front-loads too much of
             the distance and reads as a jump on 60 Hz displays. */
          const eased = 1 - Math.pow(1 - progress, 3);
          wrap.style.setProperty(
            'height',
            `${fromHeight + (toHeight - fromHeight) * eased}px`,
            'important',
          );
          shapeHeightRef.current = fromHeight + (toHeight - fromHeight) * eased;
          if (progress < 1) {
            frame = requestAnimationFrame(tick);
            return;
          }
          if (shapeAnimationRef.current !== controller) return;
          shapeAnimationRef.current = null;
          shapeAnimationCleanupRef.current = null;
          cleanup();
          shapeHeightRef.current = wrap.getBoundingClientRect().height;
        };
        shapeAnimationRef.current = controller;
        frame = requestAnimationFrame(tick);
      } else {
        cleanupTemporaryStyles?.();
        shapeHeightRef.current = wrap.getBoundingClientRect().height;
      }
    };
    if (immediate) run();
    else shapeFrameRef.current = requestAnimationFrame(run);
  }, [surface]);

  const editor = useEditor({
    extensions,
    content: '',
    editorProps: {
      attributes: {
        class: 'rich-composer-editor',
        'aria-label': activePlaceholder,
      },
      transformPastedHTML: (html) => DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['img', 'style', 'script', 'iframe', 'object', 'embed'],
        FORBID_ATTR: ['style', 'onerror', 'onclick'],
      }),
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!files.length) return false;
        event.preventDefault();
        void addComposerFiles(files, 'paste');
        return true;
      },
      handleKeyDown: (_view, event) => {
        if (event.isComposing || event.keyCode === 229) return false;
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          onSubmit();
          return true;
        }
        if (event.key === 'Escape') {
          onEscape?.();
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        beforeinput: (view) => {
          /* Runs before ProseMirror applies typing, deletion or a text paste,
             preserving the actually painted start height. */
          captureShapeHeight(view.dom as HTMLElement);
          return false;
        },
        focus: (view) => {
          composerWrapRef.current = view.dom.closest('.chat-input-wrap, .topic-input-wrap');
          composerWrapRef.current?.classList.add('composer-focused');
          return false;
        },
        blur: (_view, event) => {
          const wrap = composerWrapRef.current;
          const nextTarget = (event as FocusEvent).relatedTarget as Node | null;
          /* Toolbar, effort and attachment controls all live inside the
             composer. Moving between them must keep the expanded geometry;
             only a real focus exit should collapse it. Defer the final check
             one frame so browsers that update activeElement after blur do not
             flash the collapsed state. */
          if (wrap && nextTarget && wrap.contains(nextTarget)) return false;
          requestAnimationFrame(() => {
            if (wrap && !wrap.contains(document.activeElement)) {
              wrap.classList.remove('composer-focused');
            }
          });
          return false;
        },
      },
    },
    onUpdate: ({ editor: current }) => {
      const activeToken = syncExtensionMetadata(current);
      if (tokenWasPresent.current && !activeToken) {
        tokenWasPresent.current = false;
        onRemoveExtension('');
      } else {
        tokenWasPresent.current = activeToken;
      }
      notifyComposerChange(surface, current.getMarkdown());
      /* Tiptap calls onUpdate in the same task as the DOM mutation. Measure
         and lock immediately so a delete/paste cannot paint its unanimated
         intrinsic height before the next frame. */
      syncComposerShape(current.view.dom as HTMLElement, true);
    },
  });

  const getMarkdown = useCallback(
    () => (editor ? editor.getMarkdown() : ''),
    [editor],
  );

  const setExtensionToken = useCallback((token: ComposerExtensionToken | null) => {
    if (!editor) return;

    const existing: Array<{ pos: number; nodeSize: number }> = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'extensionToken') {
        existing.push({ pos, nodeSize: node.nodeSize });
      }
    });

    if (!token) {
      if (!existing.length) return;
      const transaction = editor.state.tr;
      existing.slice().reverse().forEach(({ pos, nodeSize }) => {
        transaction.delete(pos, pos + nodeSize);
      });
      editor.view.dispatch(transaction);
      editor.commands.focus();
      return;
    }

    const attrs = {
      key: token.key,
      title: token.title,
      icon: token.icon,
      hint: token.hint ?? '',
    };

    if (existing.length) {
      const transaction = editor.state.tr;
      transaction.setNodeMarkup(existing[0].pos, editor.schema.nodes.extensionToken, attrs);
      existing.slice(1).reverse().forEach(({ pos, nodeSize }) => {
        transaction.delete(pos, pos + nodeSize);
      });
      editor.view.dispatch(transaction);
      editor.commands.focus(existing[0].pos + 1);
      return;
    }

    const tokenNode = editor.schema.nodes.extensionToken.create(attrs);
    const position = editor.state.selection.from;
    editor.view.dispatch(editor.state.tr.insert(position, tokenNode));
    editor.commands.focus(position + tokenNode.nodeSize);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    return registerComposer(surface, {
      getMarkdown,
      setMarkdown(value) {
        captureShapeHeight(editor.view.dom as HTMLElement);
        editor.commands.setContent(value || '', { emitUpdate: true, contentType: 'markdown' });
      },
      insertText(value) {
        captureShapeHeight(editor.view.dom as HTMLElement);
        editor.chain().focus().insertContent(value, { contentType: 'markdown' }).run();
      },
      clear() {
        captureShapeHeight(editor.view.dom as HTMLElement);
        editor.commands.clearContent(true);
      },
      setExtensionToken,
      focus(position = 'end') {
        editor.commands.focus(position);
      },
      getSelection() {
        return { from: editor.state.selection.from, to: editor.state.selection.to };
      },
      isVisible() {
        return editor.view.dom.closest('.hidden') === null && editor.view.dom.getClientRects().length > 0;
      },
    });
  }, [captureShapeHeight, editor, getMarkdown, setExtensionToken, surface]);

  useLayoutEffect(() => {
    if (!editor) return;
    const editorDom = editor.view.dom as HTMLElement;
    const wrap = editorDom.closest<HTMLElement>('.chat-input-wrap, .topic-input-wrap');
    let previousEditorWidth = -1;
    let previousWrapWidth = -1;
    const observer = new ResizeObserver(() => {
      const editorWidth = editorDom.getBoundingClientRect().width;
      const wrapWidth = wrap?.getBoundingClientRect().width ?? -1;
      if (wrap && !shapeAnimationRef.current) {
        /* Font loading and responsive CSS can adjust the settled baseline
           without changing width. Keep the pre-mutation height cache current
           even though those height-only entries need no remeasurement. */
        shapeHeightRef.current = wrap.getBoundingClientRect().height;
      }
      /* Our own height animation also emits ResizeObserver entries. Only a
         width change can alter line wrapping, so ignore height-only entries
         instead of scheduling a competing measurement every frame. */
      if (
        Math.abs(editorWidth - previousEditorWidth) < 0.5
        && Math.abs(wrapWidth - previousWrapWidth) < 0.5
      ) return;
      previousEditorWidth = editorWidth;
      previousWrapWidth = wrapWidth;
      syncComposerShape(editorDom);
    });
    observer.observe(editorDom);
    if (wrap) observer.observe(wrap);
    previousEditorWidth = editorDom.getBoundingClientRect().width;
    previousWrapWidth = wrap?.getBoundingClientRect().width ?? -1;
    syncComposerShape(editorDom);
    return () => observer.disconnect();
  }, [editor, surface, syncComposerShape]);

  useEffect(() => {
    return () => {
      composerWrapRef.current?.classList.remove('composer-focused');
      composerWrapRef.current?.classList.remove('composer-multiline');
      shapeAnimationRef.current?.cancel();
      shapeAnimationRef.current = null;
      shapeAnimationCleanupRef.current?.();
      shapeAnimationCleanupRef.current = null;
      if (shapeFrameRef.current !== null) cancelAnimationFrame(shapeFrameRef.current);
      shapeFrameRef.current = null;
      collapsedMeasureRef.current = null;
      shapeHeightRef.current = null;
      composerWrapRef.current = null;
    };
  }, []);

  /* P_composer-auto-height — animate the desktop composer's height as
     the user types past one line, matching the mobile focus-in
     expansion. Without this, the Tiptap contenteditable snaps to
     each new content height on every input event (a one-line
     "thunk" per newline). The hook observes the contenteditable's
     intrinsic `scrollHeight` and animates its `style.height` via
     the project's velocity planner. Once the content hits
     max-height (132px on desktop, 150px on mobile, 180px on the
     mobile focused state) the editor scrolls internally and the
     height change ceases — the hook's scrollHeight read clamps
     naturally because the element's `scrollHeight` exceeds its
     rendered height and we only animate towards the rendered
     natural size.

     On mobile, the focus-in state already drives a shape change
     (min-height 54→116, grid-template-rows 0fr→1fr), and running
     this hook in parallel would race the CSS transition. We
     restrict the hook to desktop (min-width:769px matches the
     existing media query for the PC composer rules) so the two
     animation systems don't compete. */
  const editorElement = editor ? (editor.view.dom as HTMLElement) : null;
  const isDesktop = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(min-width:769px)').matches
    : true;
  useAutoHeight(isDesktop ? editorElement : null, {
    motion: {
      /* Slightly slower than the chat scroll/inset velocity so a
         multi-line expansion feels deliberate rather than snappy.
         Still well under the user-perceived "drag" threshold. */
      velocity: 1100,
      maxDuration: 360,
      /* The shared planner collapses any motion under
         MOTION_SNAP_DISTANCE_PX (24px) to duration 0. One composer line
         is ~21px (14px × 1.5 line-height), so EVERY single-line growth
         fell inside that snap window and was applied instantly — the
         input bar teleported one line up instead of gliding. Opt out of
         the snap window here: on this element even a one-line change is
         the entire motion the user is watching, so it must always be
         interpolated. */
      snapDistance: 0,
      /* 21px at 1100px/s is only 19ms, which still reads as an instant
         jump. Floor the glide at ~140ms so a one-line growth is
         perceptibly continuous; a large paste still scales up toward
         maxDuration. */
      minDuration: 140,
    },
  });

  /* Keep the contenteditable's accessible name in sync when the language
     changes after mount (the editorProps attributes are initial-only). */
  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute('aria-label', activePlaceholder);
  }, [editor, activePlaceholder]);

  if (!editor) return null;
  return (
    <div
      className="rich-composer"
      data-surface={surface}
      style={{ '--composer-placeholder': JSON.stringify(activePlaceholder) } as React.CSSProperties}
    >
      <ComposerPluginChips surface={surface} />
      {showToolbar ? <FormattingToolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}

function syncExtensionMetadata(editor: Editor): boolean {
  const tokens: ComposerExtensionToken[] = [];
  editor.state.doc.descendants((node) => {
    if (!tokens.length && node.type.name === 'extensionToken') {
      tokens.push(node.attrs as ComposerExtensionToken);
      return false;
    }
    return true;
  });
  return tokens.length > 0;
}
