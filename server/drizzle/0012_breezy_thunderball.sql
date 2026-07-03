CREATE TABLE "executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"language" text DEFAULT 'python' NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"exit_code" integer,
	"duration_ms" integer,
	"stdout" text,
	"stderr" text,
	"artifact_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "execution_id" uuid;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "executions_user_id_idx" ON "executions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "executions_session_id_idx" ON "executions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "executions_started_at_idx" ON "executions" USING btree ("started_at");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_execution_id_idx" ON "files" USING btree ("execution_id");