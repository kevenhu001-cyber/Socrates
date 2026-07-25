/* Re-export shim — TypeScript source lives in ./toolRunState.ts. */
export {
  TOOL_RUN_PHASES,
  isTerminalToolPhase,
  phaseFromProgress,
  transitionToolRun,
  summarizeToolRuns,
} from './toolRunState.ts';
