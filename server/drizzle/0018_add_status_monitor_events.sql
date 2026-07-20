-- 0018: adds scheduled_tasks (new) and status_monitor_events (uptime
-- history). status_monitor_events was created directly on prod ahead
-- of this migration, so its CREATE is guarded to be idempotent.

CREATE TABLE "scheduled_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"session_id" uuid,
	"cron_expression" text,
	"frequency" text DEFAULT 'once' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_tasks_user_id_idx" ON "scheduled_tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_next_run_at_idx" ON "scheduled_tasks" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_status_idx" ON "scheduled_tasks" USING btree ("status");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'status_monitor_events') THEN
    CREATE TABLE "status_monitor_events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "component" text NOT NULL,
      "from_state" text,
      "to_state" text NOT NULL,
      "detail" jsonb DEFAULT '{}'::jsonb,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "status_monitor_events_component_idx" ON "status_monitor_events" USING btree ("component");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "status_monitor_events_created_at_idx" ON "status_monitor_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "status_monitor_events_component_created_at_idx" ON "status_monitor_events" USING btree ("component","created_at");--> statement-breakpoint
