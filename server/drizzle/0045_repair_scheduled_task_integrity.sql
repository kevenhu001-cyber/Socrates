-- Preserve evidence before repairing historical drift. The ops archive has no
-- live scheduler consumer and deliberately has no user FK: deleted users are
-- exactly the records it needs to retain. Rollback instructions are in the
-- provider-contracts remediation document; never auto-resume archived tasks.
CREATE SCHEMA IF NOT EXISTS "ops";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ops"."scheduled_task_orphan_archive" (
  "task_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "task" jsonb NOT NULL,
  "lease" jsonb,
  "archived_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("task_id", "reason")
);
--> statement-breakpoint
REVOKE ALL ON TABLE "ops"."scheduled_task_orphan_archive" FROM PUBLIC;
--> statement-breakpoint
INSERT INTO "ops"."scheduled_task_orphan_archive" (task_id, reason, task, lease)
SELECT t.id, 'missing_owner', to_jsonb(t), to_jsonb(l)
FROM public.scheduled_tasks t
LEFT JOIN public.users u ON u.id = t.user_id
LEFT JOIN public.scheduled_task_leases l ON l.task_id = t.id
WHERE u.id IS NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM public.scheduled_tasks t
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.user_id);
--> statement-breakpoint
INSERT INTO "ops"."scheduled_task_orphan_archive" (task_id, reason, task, lease)
SELECT t.id, 'missing_session', to_jsonb(t), to_jsonb(l)
FROM public.scheduled_tasks t
LEFT JOIN public.sessions s ON s.id = t.session_id
LEFT JOIN public.scheduled_task_leases l ON l.task_id = t.id
WHERE t.session_id IS NOT NULL AND s.id IS NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE public.scheduled_tasks t SET session_id = NULL
WHERE t.session_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = t.session_id);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.scheduled_tasks'::regclass AND conname = 'scheduled_tasks_user_id_users_id_fk') THEN
    ALTER TABLE public.scheduled_tasks ADD CONSTRAINT scheduled_tasks_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.scheduled_tasks'::regclass AND conname = 'scheduled_tasks_session_id_sessions_id_fk') THEN
    ALTER TABLE public.scheduled_tasks ADD CONSTRAINT scheduled_tasks_session_id_sessions_id_fk
      FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE public.scheduled_tasks VALIDATE CONSTRAINT scheduled_tasks_user_id_users_id_fk;
--> statement-breakpoint
ALTER TABLE public.scheduled_tasks VALIDATE CONSTRAINT scheduled_tasks_session_id_sessions_id_fk;
