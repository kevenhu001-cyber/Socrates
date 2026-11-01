# Database Schema Domains

This directory contains the modularized PostgreSQL / Drizzle ORM schema definitions for Socrates.

## Architecture

The schema is divided into 7 domain modules + 1 shared-primitives module:

| Module | Responsibility | Key Tables |
|---|---|---|
| `common.ts` | Custom column types & shared DB primitives | `bytea` |
| `auth.ts` | Identity, session auth, API keys & OAuth 2.0 | `users`, `authSessions`, `pendingRegistrations`, `verificationTokens`, `loginFailures`, `auditEvents`, `apiKeys`, `agentApiKeys`, `oauthClients`, `oauthAuthorizationCodes`, `oauthAccessTokens` |
| `chat.ts` | Conversations, messages, turns, feedback & tags | `sessions`, `sessionPromptSnapshots`, `messages`, `ttsResults`, `sessionChunks`, `feedback`, `tags`, `sessionTags`, `shares`, `prompts`, `chatTurns`, `chatTurnEvents`, `mistakes` |
| `agents.ts` | Codex runtime, background execution & tools | `codexWorkspaces`, `agentRuns`, `codexThreads`, `agentRunEvents`, `agentApprovals`, `agentJobs`, `agentMcpSettings`, `executions`, `plugins` |
| `integrations.ts` | Third-party OAuth connectors, monitor & alerts | `connectorConnections`, `projectConnectorConnections`, `statusMonitorEvents`, `statusSubscribers`, `notificationTokens` |
| `content.ts` | Files, artifacts, memory, workspaces & usage | `projects`, `files`, `memories`, `artifacts`, `artifactVersions`, `importJobs`, `workspaces`, `workspaceMembers`, `classroomClasses`, `classStudents`, `usageEvents`, `scheduledTasks`, `scheduledTaskLeases`, `embeddingConfig` |
| `idempotency.ts` | Durable replay receipts for committed writes | `idempotencyReceipts` |
| `research.ts` | Research job state & event log | `researchJobs`, `researchJobEvents` |

## Rules

1. **Single Entry Point**: `server/src/db/schema/index.ts` re-exports all domain schemas. Import it as `db/schema/index.js`; there is no flat `db/schema.ts` forwarding file (removed 2026-10-17), and `drizzle.config.js` points at the same index.
2. **Foreign Key Invariant**: Always use arrow functions for table references: `() => targetTable.id`. This avoids cyclic module initialization hazards.
3. **Drift Guard**: Any change to these files must produce zero drift against the Drizzle migration snapshots. Verify with:
   ```bash
   node scripts/check-drizzle-drift.mjs
   ```
