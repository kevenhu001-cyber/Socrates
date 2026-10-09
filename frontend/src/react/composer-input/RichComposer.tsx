import { useEffect, useState } from 'react';
import { EditorContent } from '@tiptap/react';
import { useComposerSurface } from './useComposerSurface';
import { useComposerShape, useComposerShapeObserver } from './useComposerShape';
import { useRichComposerEditor } from './useRichComposerEditor';
import { useComposerController } from './useComposerController';
import { useComposerPresentation } from './useComposerPresentation';
import { ComposerPluginChips, useWebSearchOn } from './ComposerPluginChips';
import { FormattingToolbar } from './FormattingToolbar';
import { i18n } from '../legacy/gateway.ts';

interface RichComposerProps {
  placeholder: string;
  onSubmit: () => void;
  showToolbar?: boolean;
  onEscape?: () => void;
}

export function RichComposer({
  placeholder,
  onSubmit,
  onEscape,
  showToolbar = false,
}: RichComposerProps) {
  const surface = useComposerSurface();
  /* The language event triggers a render without recreating the editor or
     dropping its current draft. */
  const [, setLangRevision] = useState(0);
  useEffect(() => {
    const onLangChange = () => setLangRevision((value) => value + 1);
    document.addEventListener('socrates:langchange', onLangChange);
    return () => document.removeEventListener('socrates:langchange', onLangChange);
  }, []);

  const webSearchOn = useWebSearchOn();
  const activePlaceholder = webSearchOn
    ? i18n('composer.webSearch.placeholder', 'Search the web')
    : i18n(
      surface === 'chat' ? 'chat.inputPlaceholder' : 'topic.inputPlaceholder',
      placeholder,
    );
  const shape = useComposerShape(surface);
  const editor = useRichComposerEditor({
    activePlaceholder,
    surface,
    onSubmit,
    onEscape,
    shape,
  });

  useComposerShapeObserver(
    editor ? editor.view.dom as HTMLElement : null,
    shape.syncComposerShape,
    shape.isShapeAnimating,
    shape.cacheSettledShapeHeight,
  );
  useComposerController(editor, surface, shape.captureShapeHeight);
  useComposerPresentation(editor, activePlaceholder, webSearchOn, surface);

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
