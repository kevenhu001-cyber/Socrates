CREATE TABLE "agent_mcp_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"scope_key" text NOT NULL,
	"server_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"health_status" text DEFAULT 'unknown' NOT NULL,
	"last_error" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_mcp_settings" ADD CONSTRAINT "agent_mcp_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mcp_settings" ADD CONSTRAINT "agent_mcp_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_mcp_settings_scope_server_idx" ON "agent_mcp_settings" USING btree ("user_id","scope_key","server_key");--> statement-breakpoint
CREATE INDEX "agent_mcp_settings_user_id_idx" ON "agent_mcp_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_mcp_settings_project_id_idx" ON "agent_mcp_settings" USING btree ("project_id");