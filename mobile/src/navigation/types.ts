import type { EmbeddedTarget } from '@socrates/contracts';

export type RootStackParamList = {
  Home: { projectId?: string } | undefined;
  Chat: undefined;
  Tutor: { initialTopic?: string } | undefined;
  Library: undefined;
  ExamSession: undefined;
  Settings: undefined;
  Display: undefined;
  Search: undefined;
  Projects: undefined;
  Scheduled: undefined;
  Plugins: undefined;
  Knowledge: undefined;
  Mistakes: undefined;
  Embedded: { target: EmbeddedTarget; title: string };
  ArtifactPreview: { artifactId: string; html: string; kind?: string };

  // Kept as a backwards-compatible deep-link alias. The web app has no
  // standalone Workspace page; WorkspaceScreen redirects to Library.
  More: undefined;
  Workspace: undefined;
};
