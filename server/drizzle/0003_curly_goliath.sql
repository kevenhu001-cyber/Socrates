DROP INDEX "feedback_message_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_message_id_idx" ON "feedback" USING btree ("message_id");