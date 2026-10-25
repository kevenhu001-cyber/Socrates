import { useEffect, useMemo, useState } from 'react';
import {
  initialStateForNodes,
  parseIntelligenceUiRecords,
  type IntelligenceUiState,
} from '@socrates/core';

import type { ToolCallRecord } from '../tool-run/toolRunModel';
import { IntelligentSurface, type IntelligentDisplayMode } from './IntelligentSurface';
import { UiNode } from './IntelligenceUiNodes';
import { asProse, childMap, mergeDefaults, resolve, type RenderContext } from './renderRuntime';

interface IntelligenceUiBlockProps {
  source: string;
  displayMode?: IntelligentDisplayMode;
  tools?: ReadonlyArray<ToolCallRecord>;
  open?: boolean;
  showActivityCue?: boolean;
  readOnly?: boolean;
}

export function IntelligenceUiBlock({ source, tools = [], open = false, showActivityCue = true, readOnly = false, displayMode = 'inline' }: IntelligenceUiBlockProps) {
  const nodes = useMemo(() => parseIntelligenceUiRecords(source), [source]);
  const defaults = useMemo(() => initialStateForNodes(nodes), [nodes]);
  const children = useMemo(() => childMap(nodes), [nodes]);
  const [state, setState] = useState<IntelligenceUiState>(() => defaults);

  useEffect(() => {
    setState((previous) => mergeDefaults(previous, defaults));
  }, [defaults]);

  const roots = nodes.filter((node) => !node.parent);
  if (!roots.length) return null;

  const context: RenderContext = {
    state,
    setState,
    children,
    tools,
    readOnly,
    streaming: open,
    surfaceRootId: roots.length === 1 && roots[0].type === 'panel' ? roots[0].id : undefined,
  };
  const root = context.surfaceRootId ? roots[0] : undefined;
  const title = root ? asProse(resolve(root.title, context)) : undefined;
  const description = root ? asProse(resolve(root.description, context)) : undefined;

  return (
    <div className="intui" data-intui-streaming={open ? 'true' : 'false'}>
      <IntelligentSurface displayMode={displayMode} title={title} description={description}>
        {roots.map((node) => <UiNode key={node.id} node={node} context={context} />)}
      </IntelligentSurface>
      {open && showActivityCue ? <span className="intui-stream-dot" aria-hidden="true" /> : null}
    </div>
  );
}

export default IntelligenceUiBlock;
