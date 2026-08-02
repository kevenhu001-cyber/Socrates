import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  getAgentRunSnapshot,
  subscribeToAgentRuns,
} from '../../extensions/agentRunStore';
import { ExploreStepper } from './ExploreStepper';
import { AnalyzeWorkbench } from './AnalyzeWorkbench';

const HIDE_DELAY_MS = 1600;

export function WorkflowLayer() {
  const snapshot = useSyncExternalStore(
    subscribeToAgentRuns,
    getAgentRunSnapshot,
    getAgentRunSnapshot,
  );
  const event = snapshot.lastEvent;

  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);

  const hasActiveRun = !!event;
  const terminal =
    !!event && (event.stage === 'completed' || event.stage === 'failed');

  useEffect(() => {
    if (terminal) {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setVisible(false), HIDE_DELAY_MS);
      return () => {
        if (hideTimer.current) window.clearTimeout(hideTimer.current);
      };
    }
    setVisible(true);
    return undefined;
  }, [terminal]);

  if (!hasActiveRun || !visible) return null;

  const showStepper =
    event.workflow === 'research' ||
    event.workflow === 'explore' ||
    event.workflow === 'deepResearch';
  const showWorkbench = event.workflow === 'analyze';

  if (!showStepper && !showWorkbench) return null;

  return (
    <div className={`workflow-layer${terminal ? ' workflow-layer-done' : ''}`}>
      {showStepper ? <ExploreStepper /> : null}
      {showWorkbench ? <AnalyzeWorkbench /> : null}
    </div>
  );
}
