import { Renderer, type ActionEvent, type OpenUIError, type ParseResult } from '@openuidev/react-lang';
import { useCallback, useRef, useState } from 'react';
import { i18n } from '../legacy/gateway';
import { IntelligentSurface } from './IntelligentSurface';
import { runOpenUiAction } from './openui/actionBridge';
import { library } from './openui/library';
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
  const [failed, setFailed] = useState(false);
  const [hasRoot, setHasRoot] = useState<boolean | null>(null);
  const onParseResult = useCallback((result: ParseResult | null) => {
    setHasRoot(result ? Boolean(result.root) : null);
  }, []);
  const onError = useCallback((errors: OpenUIError[]) => {
    setFailed(errors.some((error) => error.severity !== 'warning'));
  }, []);
  const onAction = useCallback((event: ActionEvent) => {
    if (!open) runOpenUiAction(event, host.current, readOnly);
  }, [open, readOnly]);
  const labels = Object.fromEntries(Object.entries(remoteLabelDefaults).map(([key, fallback]) => [key, i18n(`intui.${key}`, fallback)])) as typeof remoteLabelDefaults;
  const tooLarge = source.length > 60000;
  const content = <div className="intui-openui" ref={host} data-openui-streaming={open ? 'true' : 'false'}>
    {!tooLarge ? <RemoteLabels.Provider value={labels}><Renderer response={source} library={library} isStreaming={open} onAction={onAction} onError={onError} onParseResult={onParseResult} publishObservability={false} /></RemoteLabels.Provider> : null}
    {(tooLarge || ((failed || hasRoot === false) && !open)) ? <p className="iui-caption" role="status">{i18n('intui.unavailable', 'This interactive view could not be displayed. You can continue in chat.')}</p> : null}
  </div>;
  return embedded ? content : <div className="intui"><IntelligentSurface>{content}</IntelligentSurface></div>;
}
