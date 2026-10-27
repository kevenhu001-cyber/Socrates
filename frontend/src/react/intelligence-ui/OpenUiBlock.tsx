import { Button as UiButton } from '../ui/Button';
import { Renderer, type ActionEvent, type OpenUIError, type ParseResult } from '@openuidev/react-lang';
import { useCallback, useMemo, useRef, useState } from 'react';
import { i18n } from '../legacy/gateway';
import { IntelligentSurface } from './IntelligentSurface';
import { runOpenUiAction } from './openui/actionBridge';
import { library } from './openui/library';
import { programIssues, runtimeProgramIssues } from './openui/validateProgram';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../styles/components/openui.css';
import '../../styles/components/openui-media.css';
import { RemoteLabels, remoteLabelDefaults } from './openui/remoteLabels';

export interface OpenUiBlockProps {
  source: string;
  open?: boolean;
  readOnly?: boolean;
  embedded?: boolean;
}

/** OpenUI is loaded only when a response actually contains an OpenUI program. */
export default function OpenUiBlock({ source, open = false, readOnly = false, embedded = false }: OpenUiBlockProps) {
  const host = useRef<HTMLDivElement>(null);
  const currentState = useRef<Record<string, unknown>>({});
  const [stateIssue, setStateIssue] = useState<string | null>(null);
  const onStateUpdate = useCallback((state: Record<string, unknown>) => {
    currentState.current = state;
    setStateIssue(open ? null : runtimeProgramIssues(source, state)[0] ?? null);
  }, [source, open]);
  const [runtimeErrors, setRuntimeErrors] = useState<string[]>([]);
  const [hasRoot, setHasRoot] = useState<boolean | null>(null);
  const onParseResult = useCallback((result: ParseResult | null) => {
    setHasRoot(result ? Boolean(result.root || result.rootExpression) : null);
  }, []);
  const onError = useCallback((errors: OpenUIError[]) => {
    setRuntimeErrors(errors.filter((error) => error.severity !== 'warning' || error.source === 'runtime').map((error) => error.message));
  }, []);
  const onAction = useCallback((event: ActionEvent) => {
    if (!open) runOpenUiAction(event, host.current, readOnly);
  }, [open, readOnly]);
  const labels = Object.fromEntries(Object.entries(remoteLabelDefaults).map(([key, fallback]) => [key, i18n(`intui.${key}`, fallback)])) as typeof remoteLabelDefaults;
  const tooLarge = source.length > 60000;
  const issues = useMemo(() => open || source.length > 60000 ? [] : programIssues(source), [source, open]);
  const unavailable = tooLarge || (!open && (stateIssue || runtimeErrors.length > 0 || hasRoot === false || issues.length > 0));
  const repair = () => {
    if (readOnly || open) return;
    host.current?.dispatchEvent(new CustomEvent('tool-retry', { bubbles: true, detail: {
      tool: 'intelligent_ui',
      prompt: `Repair this OpenUI view with render_intelligent_ui. Problems: ${[...issues, ...runtimeErrors, stateIssue].filter(Boolean).join('; ') || 'Client runtime error'}. Every enabled Button needs an explicit action, inputs bind to declared $state, and outputs must update locally. Preserve the requested tool and connect its inputs, actions and results. Use local actions for deterministic calculations, filtering and list edits; use @ToAssistant only for explicitly requesting assistant work.\n\n${source}\n\nCurrent local state: ${JSON.stringify(currentState.current, (_, value: unknown) => typeof value === 'number' && !Number.isFinite(value) ? String(value) : value).slice(0, 10000)}`,
    } }));
  };
  const content = <div className="intui-openui" ref={host} data-openui-streaming={open ? 'true' : 'false'}>
    <div className="iui-program" data-invalid-result={stateIssue ? 'true' : undefined}>
    {!tooLarge ? <RemoteLabels.Provider value={labels}><Renderer response={source} library={library} isStreaming={open} onAction={onAction} onError={onError} onParseResult={onParseResult} onStateUpdate={onStateUpdate} publishObservability={false} /></RemoteLabels.Provider> : null}
    </div>
    {unavailable ? <div className="iui-notice"><p className="iui-caption" role="status">{stateIssue ? i18n('intui.invalidResult', 'A valid result is unavailable. Check your inputs or repair this tool.') : i18n('intui.unavailable', 'This interactive view could not be displayed. You can continue in chat.')}</p>
      {!readOnly && !open ? <UiButton type="button" className="iui-button iui-button-outline iui-button-md" onClick={repair}>{i18n('intui.repair', 'Fix with AI')}</UiButton> : null}
    </div> : null}
  </div>;
  return embedded ? content : <div className="intui"><IntelligentSurface>{content}</IntelligentSurface></div>;
}
