CREATE TABLE IF NOT EXISTS "idempotency_receipts" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status_code" integer NOT NULL,
	"response_body" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'idempotency_receipts_user_id_users_id_fk'
      AND conrelid = 'idempotency_receipts'::regclass
  ) THEN
    ALTER TABLE "idempotency_receipts" ADD CONSTRAINT "idempotency_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idempotency_receipts_expires_at_idx" ON "idempotency_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idempotency_receipts_user_id_idx" ON "idempotency_receipts" USING btree ("user_id");
