-- 0019: adds plugins table for the marketplace / installed extensions panel

CREATE TABLE "plugins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'extension' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plugins_user_id_idx" ON "plugins" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plugins_builtin_idx" ON "plugins" USING btree ("is_builtin");
