ALTER TABLE "api_keys" ADD COLUMN "is_multimodal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb;