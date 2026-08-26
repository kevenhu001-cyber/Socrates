-- Unified Agent Runtime: durable Codex workspaces, threads, events,
-- approvals, jobs, and links from existing conversation artifacts.

CREATE TABLE "codex_workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "project_id" uuid,
  "workspace_key" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "policy" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "codex_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "project_id" uuid,
  "session_id" uuid,
  "workspace_id" uuid NOT NULL,
  "thread_id" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "model" text,
  "provider_mode" text,
  "last_turn_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "codex_threads_thread_id_unique" UNIQUE("thread_id")
);
--> statement-breakpoint
CREATE TABLE "agent_run_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "sequence" integer NOT NULL,
  "event" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "thread_id" text NOT NULL,
  "request_id" text NOT NULL,
  "kind" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "decision" text,
  "payload" jsonb DEFAULT '{}'::jsonb,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "kind" text DEFAULT 'run' NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_until" timestamp with time zone,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "agent_runs" ADD COLUMN "project_id" uuid;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "thread_id" text;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "mode" text DEFAULT 'workspace' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "kind" text DEFAULT 'chat' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "source" text DEFAULT 'chat' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "provider_mode" text;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "model" text;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "summary" text;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "error" text;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "usage" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "agent_run_id" uuid;
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "agent_run_id" uuid;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "agent_run_id" uuid;
--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "project_id" uuid;
--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "agent_kind" text DEFAULT 'native' NOT NULL;
--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "run_policy" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "notification_config" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "last_run_id" uuid;
--> statement-breakpoint

ALTER TABLE "codex_workspaces" ADD CONSTRAINT "codex_workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "codex_workspaces" ADD CONSTRAINT "codex_workspaces_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "codex_threads" ADD CONSTRAINT "codex_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "codex_threads" ADD CONSTRAINT "codex_threads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "codex_threads" ADD CONSTRAINT "codex_threads_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "codex_threads" ADD CONSTRAINT "codex_threads_workspace_id_codex_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."codex_workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_codex_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."codex_workspaces"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_last_run_id_agent_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX "codex_workspaces_user_key_idx" ON "codex_workspaces" USING btree ("user_id","workspace_key");
--> statement-breakpoint
CREATE INDEX "codex_workspaces_user_id_idx" ON "codex_workspaces" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "codex_workspaces_project_id_idx" ON "codex_workspaces" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "codex_threads_user_id_idx" ON "codex_threads" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "codex_threads_project_id_idx" ON "codex_threads" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "codex_threads_session_id_idx" ON "codex_threads" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "codex_threads_workspace_id_idx" ON "codex_threads" USING btree ("workspace_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_events_run_sequence_idx" ON "agent_run_events" USING btree ("run_id","sequence");
--> statement-breakpoint
CREATE INDEX "agent_run_events_run_id_idx" ON "agent_run_events" USING btree ("run_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_approvals_run_request_idx" ON "agent_approvals" USING btree ("run_id","request_id");
--> statement-breakpoint
CREATE INDEX "agent_approvals_user_status_idx" ON "agent_approvals" USING btree ("user_id","status");
--> statement-breakpoint
CREATE INDEX "agent_approvals_thread_id_idx" ON "agent_approvals" USING btree ("thread_id");
--> statement-breakpoint
CREATE INDEX "agent_jobs_status_available_idx" ON "agent_jobs" USING btree ("status","available_at");
--> statement-breakpoint
CREATE INDEX "agent_jobs_user_id_idx" ON "agent_jobs" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "agent_jobs_run_id_idx" ON "agent_jobs" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX "agent_runs_project_id_idx" ON "agent_runs" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "agent_runs_thread_id_idx" ON "agent_runs" USING btree ("thread_id");
--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "artifacts_agent_run_id_idx" ON "artifacts" USING btree ("agent_run_id");
--> statement-breakpoint
CREATE INDEX "files_agent_run_id_idx" ON "files" USING btree ("agent_run_id");
--> statement-breakpoint
CREATE INDEX "messages_agent_run_id_idx" ON "messages" USING btree ("agent_run_id");
--> statement-breakpoint
CREATE INDEX "scheduled_tasks_project_id_idx" ON "scheduled_tasks" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "scheduled_tasks_last_run_id_idx" ON "scheduled_tasks" USING btree ("last_run_id");
