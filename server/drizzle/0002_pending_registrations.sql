CREATE TABLE "pending_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_registrations_email_unique" UNIQUE("email"),
	CONSTRAINT "pending_registrations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE INDEX "pending_registrations_token_idx" ON "pending_registrations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "pending_registrations_email_idx" ON "pending_registrations" USING btree ("email");
