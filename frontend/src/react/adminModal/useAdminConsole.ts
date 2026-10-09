import { useAdminConfigActions } from './useAdminConfigActions';
import { useAdminConfiguration } from './useAdminConfiguration';
import { useAdminSession } from './useAdminSession';

export function useAdminConsole() {
  const session = useAdminSession();
  const configuration = useAdminConfiguration(session.authed, session.setAuthed);
  const actions = useAdminConfigActions(configuration);

  return { ...session, ...configuration, ...actions };
}
