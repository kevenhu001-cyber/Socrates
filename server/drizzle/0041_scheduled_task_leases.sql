CREATE TABLE IF NOT EXISTS "scheduled_task_leases" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"execution_id" uuid NOT NULL,
	"owner_token" uuid NOT NULL,
	"agent_kind" text NOT NULL,
	"state" text NOT NULL,
	"kind" text NOT NULL,
	"scheduled_for" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_task_leases_task_id_scheduled_tasks_id_fk' AND conrelid = 'scheduled_task_leases'::regclass) THEN
    ALTER TABLE "scheduled_task_leases" ADD CONSTRAINT "scheduled_task_leases_task_id_scheduled_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."scheduled_tasks"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_task_leases_state_expiry_idx" ON "scheduled_task_leases" USING btree ("state","expires_at");
