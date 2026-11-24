import { useEffect, useMemo, useState } from 'react';
import {
  initialStateForNodes,
  parseIntelligentUiRecords,
  type IntelligentUiState,
} from '@socrates/core';

import { i18n } from '../../ui/legacyI18n.ts';
import type { ToolCallRecord } from '../tool-run/toolRunModel';
import { IntelligentSurface, type IntelligentDisplayMode } from './IntelligentSurface';
import { UiNode } from './IntelligentUiNodes';
import { PendingBlock } from './BlockSkeleton';
import { childMap, mergeDefaults, type RenderContext } from './renderRuntime';
import { inferSurfaceMeta, surfacePlainText } from './surfaceMeta';

interface IntelligentUiBlockProps {
  source: string;
  displayMode?: IntelligentDisplayMode;
  tools?: ReadonlyArray<ToolCallRecord>;
  open?: boolean;
  showActivityCue?: boolean;
  readOnly?: boolean;
}

export function IntelligentUiBlock({
  source,
  tools = [],
  open = false,
  showActivityCue = true,
  readOnly = false,
  displayMode = 'inline',
}: IntelligentUiBlockProps) {
  const nodes = useMemo(() => parseIntelligentUiRecords(source), [source]);
  const defaults = useMemo(() => initialStateForNodes(nodes), [nodes]);
  const children = useMemo(() => childMap(nodes), [nodes]);
  const [state, setState] = useState<IntelligentUiState>(() => defaults);

  useEffect(() => {
    setState((previous) => mergeDefaults(previous, defaults));
  }, [defaults]);

  const roots = nodes.filter((node) => !node.parent);
  /* Keep the loading footprint until the first record names a root. */
  if (!roots.length) {
    return open ? (
      <PendingBlock open />
    ) : (
      <div className="intui-callout" data-intui-failure="document" role="status">
        {i18n('tool.uiInvalid', 'Component could not be displayed.')}
      </div>
    );
  }

  const baseContext: RenderContext = {
    state,
    setState,
    children,
    tools,
    readOnly,
    streaming: open,
    surfaceRootId: roots.length === 1 && roots[0].type === 'panel' ? roots[0].id : undefined,
  };
  const meta = inferSurfaceMeta(roots, baseContext);
  const context: RenderContext = { ...baseContext, surfaceTitle: meta.title };
  const copyValue = surfacePlainText(roots, context, meta);

  return (
    <div className="intui" data-intui-streaming={open ? 'true' : 'false'}>
      <IntelligentSurface
        displayMode={displayMode}
        title={meta.title}
        description={meta.description}
        eyebrow={meta.eyebrow}
        copyValue={copyValue}
      >
        {roots.map((node) => (
          <UiNode key={node.id} node={node} context={context} />
        ))}
      </IntelligentSurface>
      {open && showActivityCue ? <span className="intui-stream-dot" aria-hidden="true" /> : null}
    </div>
  );
}

export default IntelligentUiBlock;
