-- Clear orphan refs before adding FK constraints below; ON DELETE SET NULL
-- only helps future deletions, not rows that already point at a parent
-- that no longer exists.
UPDATE "sessions"     SET "project_id"  = NULL WHERE "project_id"  IS NOT NULL AND "project_id"  NOT IN (SELECT id FROM "projects");
UPDATE "memories"     SET "project_id"  = NULL WHERE "project_id"  IS NOT NULL AND "project_id"  NOT IN (SELECT id FROM "projects");
UPDATE "artifacts"    SET "project_id"  = NULL WHERE "project_id"  IS NOT NULL AND "project_id"  NOT IN (SELECT id FROM "projects");
UPDATE "artifacts"    SET "session_id"  = NULL WHERE "session_id"  IS NOT NULL AND "session_id"  NOT IN (SELECT id FROM "sessions");
UPDATE "artifacts"    SET "message_id"  = NULL WHERE "message_id"  IS NOT NULL AND "message_id"  NOT IN (SELECT id FROM "messages");
UPDATE "agent_runs"   SET "session_id"  = NULL WHERE "session_id"  IS NOT NULL AND "session_id"  NOT IN (SELECT id FROM "sessions");
--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_session_id_idx" ON "agent_runs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "artifacts_session_id_idx" ON "artifacts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "artifacts_message_id_idx" ON "artifacts" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "artifacts_project_id_idx" ON "artifacts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "files_session_id_idx" ON "files" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "memories_project_id_idx" ON "memories" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "messages_created_at_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sessions_project_id_idx" ON "sessions" USING btree ("project_id");