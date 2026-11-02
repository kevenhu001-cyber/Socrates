/**
 * RN-5 study panels, DOM-free: knowledge map, diagnostic and mistake book.
 * The web shell mounts them through react-native-web (frontend/src/react/
 * tutor); apps/socrates can reuse them with its own host commands.
 */
export { KnowledgeMap, type KnowledgeMapProps } from './KnowledgeMap';
export { KnowledgeGraphView } from './KnowledgeGraphView';
export {
  DiagnosticPanel,
  type DiagnosticCommand,
  type DiagnosticCommandHandler,
  type DiagnosticOption,
  type DiagnosticResultsCopy,
  type DiagnosticScreen,
  type RenderDiagnosticRich,
} from './DiagnosticPanel';
export { MistakeBook, type MistakeBookProps } from './MistakeBook';
export * from './strings';
export * from './model';
