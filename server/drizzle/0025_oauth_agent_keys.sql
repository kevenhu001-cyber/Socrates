-- 0025: Phase D — OAuth 2.0 authorization server + scoped agent API keys.
-- New tables only; no edits to existing tables. Plaintext key secrets are
-- never persisted: agent_api_keys.secret_hash = SHA-256("<key_id>.<secret>").

CREATE TABLE "agent_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"secret_hash" text NOT NULL,
	"key_id" text NOT NULL,
	"label" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_api_keys" ADD CONSTRAINT "agent_api_keys_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_api_keys_key_id_idx" ON "agent_api_keys" USING btree ("key_id");
--> statement-breakpoint
CREATE INDEX "agent_api_keys_owner_idx" ON "agent_api_keys" USING btree ("owner_user_id");
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"client_id" text PRIMARY KEY NOT NULL,
	"client_secret_hash" text NOT NULL,
	"name" text NOT NULL,
	"homepage_url" text,
	"logo_url" text,
	"redirect_uris" jsonb NOT NULL,
	"allowed_scopes" jsonb NOT NULL,
	"require_pkce" boolean DEFAULT true NOT NULL,
	"require_consent" boolean DEFAULT true NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "oauth_authorization_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"code_challenge" text,
	"code_challenge_method" text DEFAULT 'S256',
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "oauth_authorization_codes_user_idx" ON "oauth_authorization_codes" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE "oauth_access_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"scopes" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"refresh_token_hash" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_user_idx" ON "oauth_access_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_refresh_idx" ON "oauth_access_tokens" USING btree ("refresh_token_hash");
