-- 0022: metadata only for OOMOL ProjectConnector connections.
-- OAuth access and refresh tokens remain in the OOMOL Connector Gateway.

CREATE TABLE "project_connector_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"connection_name" text DEFAULT 'socrates' NOT NULL,
	"request_id" text,
	"connected_account_id" text,
	"display_name" text,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_connector_connections" ADD CONSTRAINT "project_connector_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "project_connector_connections_user_provider_idx" ON "project_connector_connections" USING btree ("user_id","provider");
--> statement-breakpoint
CREATE INDEX "project_connector_connections_user_id_idx" ON "project_connector_connections" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "project_connector_connections_request_id_idx" ON "project_connector_connections" USING btree ("request_id");
