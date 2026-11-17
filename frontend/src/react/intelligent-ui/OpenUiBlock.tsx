import { Button as UiButton } from '../ui/Button';
import { Renderer, type ActionEvent, type OpenUIError, type ParseResult } from '@openuidev/react-lang';
import { Component, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { i18n } from '../legacy/gateway';
import { IntelligentSurface } from './IntelligentSurface';
import { BlockSkeleton } from './BlockSkeleton';
import { runOpenUiAction } from './openui/actionBridge';
import { library } from './openui/library';
import { buildOpenUiRepairPrompt } from './openui/repairPrompt';
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

interface OpenUiProgramProps {
  source: string;
  open: boolean;
  tooLarge: boolean;
  labels: typeof remoteLabelDefaults;
  onAction(event: ActionEvent): void;
  onError(errors: OpenUIError[]): void;
  onParseResult(result: ParseResult | null): void;
  onStateUpdate(state: Record<string, unknown>): void;
}

/** A malformed program must not take down the surrounding conversation. */
class OpenUiRenderBoundary extends Component<{ source: string; children: ReactNode; onFailure(message: string): void }, { source: string; failed: boolean }> {
  state = { source: this.props.source, failed: false };
  static getDerivedStateFromProps(props: { source: string }, state: { source: string }) {
    return props.source !== state.source ? { source: props.source, failed: false } : null;
  }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onFailure(error.message); }
  render() { return this.state.failed ? null : this.props.children; }
}

function OpenUiProgram({
  source,
  open,
  tooLarge,
  labels,
  onAction,
  onError,
  onParseResult,
  onStateUpdate,
}: OpenUiProgramProps) {
  if (tooLarge) return null;
  return (
    <RemoteLabels.Provider value={labels}>
      <Renderer
        response={source}
        library={library}
        isStreaming={open}
        onAction={onAction}
        onError={onError}
        onParseResult={onParseResult}
        onStateUpdate={onStateUpdate}
        publishObservability={false}
      />
    </RemoteLabels.Provider>
  );
}

function OpenUiUnavailableNotice({
  visible,
  stateIssue,
  open,
  readOnly,
  onRepair,
}: {
  visible: boolean;
  stateIssue: string | null;
  open: boolean;
  readOnly: boolean;
  onRepair(): void;
}) {
  if (!visible) return null;
  return (
    <div className="iui-notice">
      <p className="iui-caption" role="status">
        {stateIssue
          ? i18n('intui.invalidResult', 'A valid result is unavailable. Check your inputs or repair this tool.')
          : i18n('intui.unavailable', 'This interactive view could not be displayed. You can continue in chat.')}
      </p>
      {!readOnly && !open ? <UiButton type="button" className="iui-button iui-button-outline iui-button-md" onClick={onRepair}>{i18n('intui.repair', 'Fix with AI')}</UiButton> : null}
    </div>
  );
}

/**
 * Until a streamed program first draws something, it shows the footprint the
 * lazy-load fallback showed (measured before paint, then latched off); after
 * that it never drops below it, so a short first line cannot pull the answer
 * up before the program grows.
 */
function useFirstPaintHold(source: string, open: boolean) {
  const program = useRef<HTMLDivElement>(null);
  const [awaitingFirstPaint, setAwaitingFirstPaint] = useState(open);
  const streamed = useRef(open);
  useLayoutEffect(() => {
    if (!awaitingFirstPaint) return;
    const drew = Array.from(program.current?.children ?? []).some((child) => child.getBoundingClientRect().height > 0);
    if (!open || drew) setAwaitingFirstPaint(false);
  }, [awaitingFirstPaint, open, source]);
  return {
    program,
    skeleton: awaitingFirstPaint ? <BlockSkeleton /> : null,
    holdFootprint: streamed.current && !awaitingFirstPaint ? 'true' as const : undefined,
  };
}

/** OpenUI is loaded only when a response actually contains an OpenUI program. */
export default function OpenUiBlock({ source, open = false, readOnly = false, embedded = false }: OpenUiBlockProps) {
  const host = useRef<HTMLDivElement>(null);
  const { program, skeleton, holdFootprint } = useFirstPaintHold(source, open);
  const [currentState, setCurrentState] = useState<{ source: string; value: Record<string, unknown> }>({ source, value: {} });
  const onStateUpdate = useCallback((state: Record<string, unknown>) => {
    setCurrentState({ source, value: state });
  }, [source]);
  const [runtimeErrors, setRuntimeErrors] = useState<{ source: string; messages: string[] }>({ source, messages: [] });
  const [hasRoot, setHasRoot] = useState<{ source: string; present: boolean } | null>(null);
  const onParseResult = useCallback((result: ParseResult | null) => {
    setHasRoot(result ? { source, present: Boolean(result.root || result.rootExpression) } : null);
  }, [source]);
  const onError = useCallback((errors: OpenUIError[]) => {
    setRuntimeErrors({ source, messages: errors.filter((error) => error.severity !== 'warning' || error.source === 'runtime').map((error) => error.message) });
  }, [source]);
  const onAction = useCallback((event: ActionEvent) => {
    if (!open) runOpenUiAction(event, host.current, readOnly);
  }, [open, readOnly]);
  const labels = Object.fromEntries(Object.entries(remoteLabelDefaults).map(([key, fallback]) => [key, i18n(`intui.${key}`, fallback)])) as typeof remoteLabelDefaults;
  const tooLarge = source.length > 50000;
  const issues = useMemo(() => open || source.length > 50000 ? [] : programIssues(source), [source, open]);
  const stateIssue = useMemo(() => open || tooLarge ? null : runtimeProgramIssues(source, currentState.source === source ? currentState.value : {})[0] ?? null, [source, open, tooLarge, currentState]);
  const unavailable = Boolean(tooLarge || (!open && (stateIssue || (runtimeErrors.source === source && runtimeErrors.messages.length > 0) || (hasRoot?.source === source && !hasRoot.present) || issues.length > 0)));
  const repair = () => {
    if (readOnly || open) return;
    const problems = [...issues, ...(runtimeErrors.source === source ? runtimeErrors.messages : []), stateIssue].filter(Boolean).join('; ') || 'Client runtime error';
    host.current?.dispatchEvent(new CustomEvent('tool-retry', { bubbles: true, detail: {
      tool: 'intelligent_ui',
      prompt: buildOpenUiRepairPrompt({
        problems,
        issues,
        source,
        state: JSON.stringify(currentState.source === source ? currentState.value : {}, (_, value: unknown) => typeof value === 'number' && !Number.isFinite(value) ? String(value) : value).slice(0, 10000),
      }),
    } }));
  };
  const content = <div className="intui-openui" ref={host} data-openui-streaming={open ? 'true' : 'false'}>
    {skeleton}
    <div className="iui-program" ref={program} data-invalid-result={stateIssue ? 'true' : undefined} data-hold-footprint={holdFootprint}>
      <OpenUiRenderBoundary source={source} onFailure={(message) => setRuntimeErrors({ source, messages: [message] })}>
      <OpenUiProgram
        source={source}
        open={open}
        tooLarge={tooLarge}
        labels={labels}
        onAction={onAction}
        onError={onError}
        onParseResult={onParseResult}
        onStateUpdate={onStateUpdate}
      />
      </OpenUiRenderBoundary>
    </div>
    <OpenUiUnavailableNotice
      visible={unavailable}
      stateIssue={stateIssue}
      open={open}
      readOnly={readOnly}
      onRepair={repair}
    />
  </div>;
  return embedded ? content : <div className="intui"><IntelligentSurface>{content}</IntelligentSurface></div>;
}
