import type { Express } from 'express';

import authRouter from './auth/auth.js';
import sessionRouter from './sessions/index.js';
import suggestionsRouter from './chat/suggestions.js';
import intelligentUiMediaRouter from './media/intelligentUiMedia.js';
import faviconRouter from './content/favicons.js';
import chatRouter from './chat/index.js';
import chatTurnsRouter from './chat/chatTurns.js';
import ttsRouter from './media/tts.js';
import ragRouter from './knowledge/rag.js';
import embeddingConfigRouter from './knowledge/embeddingConfig.js';
import systemModelsRouter from './providers/systemModels.js';
import adminAuthRouter from './auth/adminAuth.js';
import apiKeyRouter from './auth/apiKeys.js';
import shareRouter from './content/share.js';
import publicShareRouter from './content/publicShares.js';
import messageRouter from './sessions/messages.js';
import userRouter from './auth/users.js';
import projectRouter from './workspace/projects.js';
import tagRouter from './sessions/tags.js';
import fileRouter from './content/files.js';
import fileExtractRouter from './content/fileExtract.js';
import migrateRouter from './content/migrate.js';
import artifactRouter from './content/artifacts.js';
import creationsRouter from './content/creations.js';
import memoryRouter from './knowledge/memory.js';
import promptRouter from './workspace/prompts.js';
import notificationRouter from './workspace/notifications.js';
import usageRouter from './operations/usage.js';
import accountRouter from './auth/account.js';
import importRouter from './content/import.js';
import classroomRouter from './learning/classroom.js';
import minimaxRouter from './providers/minimaxProxy.js';
import mistakesRouter from './learning/mistakes.js';
import knowledgeBoundaryRouter from './learning/knowledgeBoundary.js';
import visionRouter from './media/vision.js';
import agentRunsRouter from './workspace/agentRuns.js';
import researchJobsRouter from './workspace/researchJobs.js';
import executionRouter from './workspace/execution.js';
import scheduledTasksRouter from './workspace/scheduledTasks.js';
import pluginsRouter from './integrations/plugins.js';
import connectorRouter from './integrations/connectors.js';
import projectConnectorRouter from './integrations/projectConnectors.js';
import searchRouter from './knowledge/search.js';
import publicSitesRouter from './content/publicSites.js';

export function mountDomainRoutes(app: Express): void {
  // Auth & Admin
  app.use('/api/auth', authRouter);
  app.use('/api/admin-auth', adminAuthRouter);
  app.use('/api/users', userRouter);
  app.use('/api/account', accountRouter);
  app.use('/api/api-key', apiKeyRouter);

  // Sessions & Messages
  app.use('/api/sessions', sessionRouter);
  app.use('/api/messages', messageRouter);
  app.use('/api/sessions/:id/share', shareRouter);
  app.use('/api/shares', publicShareRouter);

  // Chat & Execution
  app.use('/api/suggestions', suggestionsRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/chat-turns', chatTurnsRouter);
  app.use('/api/executions', executionRouter);

  // Knowledge & Retrieval
  app.use('/api/rag', ragRouter);
  app.use('/api/embedding-config', embeddingConfigRouter);
  app.use('/api/memory', memoryRouter);
  app.use('/api', searchRouter);

  // Workspace & Agent
  app.use('/api/projects', projectRouter);
  app.use('/api/scheduled-tasks', scheduledTasksRouter);
  app.use('/api/agent-runs', agentRunsRouter);
  app.use('/api/research-jobs', researchJobsRouter);
  app.use('/api/prompts', promptRouter);
  app.use('/api/notifications', notificationRouter);

  // Integrations & Plugins
  app.use('/api/plugins', pluginsRouter);
  app.use('/api/connectors', connectorRouter);
  app.use('/api/project-connectors', projectConnectorRouter);

  // Content, Files & Artifacts
  app.use('/api/files', fileExtractRouter);
  app.use('/api/files', fileRouter);
  app.use('/api', tagRouter);
  app.use('/api/migrate', migrateRouter);
  app.use('/api/artifacts', artifactRouter);
  app.use('/api/creations', creationsRouter);
  app.use('/api/import', importRouter);
  app.use('/s', publicSitesRouter);

  // Learning & Classroom
  app.use('/api/classroom', classroomRouter);
  app.use('/api/mistakes', mistakesRouter);
  app.use('/api/knowledge-boundary', knowledgeBoundaryRouter);

  // Media, Providers & Operations
  app.use('/api/intelligent-ui', intelligentUiMediaRouter);
  app.use('/api/favicons', faviconRouter);
  app.use('/api/tts', ttsRouter);
  app.use('/api/vision', visionRouter);
  app.use('/api/system-models', systemModelsRouter);
  app.use('/api/minimax', minimaxRouter);
  app.use('/api/usage', usageRouter);
}
