CREATE TABLE IF NOT EXISTS "research_job_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"stage" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"project_id" uuid,
	"query" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"steps" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"event_sequence" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"result_artifact_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "research_job_events" ADD CONSTRAINT "research_job_events_job_id_research_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."research_jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_result_artifact_id_artifacts_id_fk" FOREIGN KEY ("result_artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_job_events_sequence_idx" ON "research_job_events" USING btree ("job_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "research_jobs_user_key_idx" ON "research_jobs" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_jobs_status_lease_idx" ON "research_jobs" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_jobs_user_session_idx" ON "research_jobs" USING btree ("user_id","session_id");