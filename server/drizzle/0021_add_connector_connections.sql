-- 0021: encrypted per-user OAuth connector credentials

CREATE TABLE "connector_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_account_id" text,
	"display_name" text,
	"avatar_url" text,
	"access_token_ciphertext" text NOT NULL,
	"refresh_token_ciphertext" text,
	"token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scopes" text,
	"installation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connector_connections" ADD CONSTRAINT "connector_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "connector_connections_user_provider_idx" ON "connector_connections" USING btree ("user_id", "provider");
--> statement-breakpoint
CREATE INDEX "connector_connections_user_id_idx" ON "connector_connections" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "connector_connections_provider_idx" ON "connector_connections" USING btree ("provider");
