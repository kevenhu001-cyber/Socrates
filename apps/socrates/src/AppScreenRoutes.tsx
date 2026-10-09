import React, { type ComponentProps, type ReactNode } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ThemeMode } from '@socrates/theme';
import { AssistantsScreen } from './AssistantsScreen';
import { ExamSetupScreen } from './ExamSetupScreen';
import { FilePreview } from './FilePreview';
import { FilesScreen } from './FilesScreen';
import { ProjectsScreen } from './ProjectsScreen';
import { ProvidersScreen } from './ProvidersScreen';
import { SearchScreen } from './SearchScreen';
import { SettingsScreen } from './SettingsScreen';
import { TutorSetupScreen } from './TutorSetupScreen';
import type { AppScreen } from './appNavigation';

type RouteScreen = Exclude<AppScreen, 'chat'>;

interface AppScreenRoutesProps {
  screen: RouteScreen;
  mode: ThemeMode;
  pageBackground: string;
  settings: ComponentProps<typeof SettingsScreen>;
  projects: ComponentProps<typeof ProjectsScreen>;
  providers: ComponentProps<typeof ProvidersScreen>;
  assistants: ComponentProps<typeof AssistantsScreen>;
  search: ComponentProps<typeof SearchScreen>;
  examSetup: ComponentProps<typeof ExamSetupScreen>;
  tutorSetup: ComponentProps<typeof TutorSetupScreen>;
  files: ComponentProps<typeof FilesScreen>;
  filePreview: ComponentProps<typeof FilePreview> | null;
}

/** Renders the screens that leave the chat shell, keeping their layout frame consistent. */
export function AppScreenRoutes({
  screen,
  mode,
  pageBackground,
  settings,
  projects,
  providers,
  assistants,
  search,
  examSetup,
  tutorSetup,
  files,
  filePreview,
}: AppScreenRoutesProps) {
  const frame = (content: ReactNode) => (
    <SafeAreaView style={{ flex: 1, backgroundColor: pageBackground }}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
      {content}
    </SafeAreaView>
  );

  switch (screen) {
    case 'settings': return frame(<SettingsScreen {...settings} />);
    case 'projects': return frame(<ProjectsScreen {...projects} />);
    case 'providers': return frame(<ProvidersScreen {...providers} />);
    case 'assistants': return frame(<AssistantsScreen {...assistants} />);
    case 'search': return frame(<SearchScreen {...search} />);
    case 'exam-setup': return frame(<ExamSetupScreen {...examSetup} />);
    case 'tutor-setup': return frame(<TutorSetupScreen {...tutorSetup} />);
    case 'files': return frame(<>
      <FilesScreen {...files} />
      {filePreview ? <FilePreview {...filePreview} /> : null}
    </>);
    default: return null;
  }
}
