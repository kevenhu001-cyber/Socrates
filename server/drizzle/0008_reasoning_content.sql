-- P_reasoning-persist — add reasoning_content column to the messages table.
--
-- DeepSeek R1, QwQ, o1 and other reasoning models emit chain-of-thought
-- text as a separate `reasoning_content` field alongside the final answer.
-- This column preserves that text so it survives session save/load and
-- is included in the LLM context on the next chat turn.
--
-- The column is nullable (most messages won't have reasoning content) and
-- uses the `text` type since reasoning traces can be arbitrarily long.

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "reasoning_content" text;
