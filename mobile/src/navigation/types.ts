import type { EmbeddedTarget } from '@socrates/contracts';

export type RootStackParamList = {
  Home: undefined;
  Chat: undefined;
  Tutor: undefined;
  Library: undefined;
  ExamSession: undefined;
  Settings: undefined;
  Search: undefined;
  Embedded: { target: EmbeddedTarget; title: string };
  Share: { url: string; title?: string };
  ArtifactPreview: { artifactId: string; html: string };

  // Kept in the contract while the legacy native screens remain available as
  // a rollback reference. They are no longer part of the primary navigation.
  More: undefined;
  Workspace: undefined;
};
