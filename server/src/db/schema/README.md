# Database Schema Domains

This directory contains the modularized PostgreSQL / Drizzle ORM schema definitions for Socrates.

## Architecture

The schema is divided into 5 business domains + shared types:

| Module | Responsibility | Key Tables |
|---|---|---|
| `common.ts` | Custom column types & shared DB primitives | `bytea` |
| `auth.ts` | Identity, session auth, API keys & OAuth 2.0 | `users`, `authSessions`, `pendingRegistrations`, `verificationTokens`, `loginFailures`, `auditEvents`, `apiKeys`, `agentApiKeys`, `oauthClients`, `oauthAuthorizationCodes`, `oauthAccessTokens` |
| `chat.ts` | Conversations, messages, turns, feedback & tags | `sessions`, `messages`, `ttsResults`, `sessionChunks`, `feedback`, `tags`, `sessionTags`, `shares`, `prompts`, `chatTurns`, `chatTurnEvents`, `mistakes` |
| `agents.ts` | Codex runtime, background execution & tools | `codexWorkspaces`, `agentRuns`, `codexThreads`, `agentRunEvents`, `agentApprovals`, `agentJobs`, `agentMcpSettings`, `executions`, `plugins` |
| `integrations.ts` | Third-party OAuth connectors, monitor & alerts | `connectorConnections`, `projectConnectorConnections`, `statusMonitorEvents`, `statusSubscribers`, `notificationTokens` |
| `content.ts` | Files, artifacts, memory, workspaces & usage | `projects`, `files`, `memories`, `artifacts`, `artifactVersions`, `importJobs`, `workspaces`, `workspaceMembers`, `classroomClasses`, `classStudents`, `usageEvents`, `scheduledTasks`, `embeddingConfig` |

## Rules

1. **Re-export Invariant**: `server/src/db/schema/index.ts` re-exports all domain schemas, and `server/src/db/schema.ts` forwards `* from './schema/index.js'` for 100% backward compatibility with existing code and `drizzle.config.js`.
2. **Foreign Key Invariant**: Always use arrow functions for table references: `() => targetTable.id`. This avoids cyclic module initialization hazards.
3. **Drift Guard**: Any change to these files must produce zero drift against the Drizzle migration snapshots. Verify with:
   ```bash
   node scripts/check-drizzle-drift.mjs
   ```
