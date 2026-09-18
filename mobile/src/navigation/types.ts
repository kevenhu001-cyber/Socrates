import type { EmbeddedTarget } from '@socrates/contracts';

export type RootStackParamList = {
  Home: { projectId?: string } | undefined;
  Chat: undefined;
  Tutor: { initialTopic?: string } | undefined;
  Library: undefined;
  ExamSession: undefined;
  Settings: undefined;
  Search: undefined;
  Projects: undefined;
  Scheduled: undefined;
  Plugins: undefined;
  Knowledge: undefined;
  Mistakes: undefined;
  Embedded: { target: EmbeddedTarget; title: string };
  ArtifactPreview: { artifactId: string; html: string };

  // Workspace remains a native route so the drawer can expose the full
  // product surface while complex workspace modules are being migrated.
  More: undefined;
  Workspace: undefined;
};
