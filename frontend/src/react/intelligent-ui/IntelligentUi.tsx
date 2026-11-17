import { useEffect, useMemo, useState } from 'react';
import {
  initialStateForNodes,
  parseIntelligentUiRecords,
  type IntelligentUiState,
} from '@socrates/core';

import { i18n } from '../legacy/gateway';
import type { ToolCallRecord } from '../tool-run/toolRunModel';
import { IntelligentSurface, type IntelligentDisplayMode } from './IntelligentSurface';
import { UiNode } from './IntelligentUiNodes';
import { PendingBlock } from './BlockSkeleton';
import { asProse, childMap, mergeDefaults, resolve, type RenderContext } from './renderRuntime';

interface IntelligentUiBlockProps {
  source: string;
  displayMode?: IntelligentDisplayMode;
  tools?: ReadonlyArray<ToolCallRecord>;
  open?: boolean;
  showActivityCue?: boolean;
  readOnly?: boolean;
}

function resolveSurfaceMetadata(
  roots: ReturnType<typeof parseIntelligentUiRecords>,
  context: RenderContext,
) {
  const root = context.surfaceRootId ? roots[0] : undefined;
  const title = root ? asProse(resolve(root.title, context)) : undefined;
  const description = root ? asProse(resolve(root.description, context)) : undefined;
  return { title, description };
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

  const context: RenderContext = {
    state,
    setState,
    children,
    tools,
    readOnly,
    streaming: open,
    surfaceRootId: roots.length === 1 && roots[0].type === 'panel' ? roots[0].id : undefined,
  };
  const { title, description } = resolveSurfaceMetadata(roots, context);

  return (
    <div className="intui" data-intui-streaming={open ? 'true' : 'false'}>
      <IntelligentSurface displayMode={displayMode} title={title} description={description}>
        {roots.map((node) => (
          <UiNode key={node.id} node={node} context={context} />
        ))}
      </IntelligentSurface>
      {open && showActivityCue ? <span className="intui-stream-dot" aria-hidden="true" /> : null}
    </div>
  );
}

export default IntelligentUiBlock;
