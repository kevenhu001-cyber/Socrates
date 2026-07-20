-- 0020: adds status_subscribers table for email notifications

CREATE TABLE "status_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "status_subscribers_email_idx" ON "status_subscribers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "status_subscribers_token_idx" ON "status_subscribers" USING btree ("token");
