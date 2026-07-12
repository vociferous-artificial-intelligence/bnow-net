ALTER TABLE "ask_usage" ADD COLUMN "retrieval_mode" text;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "rerank_model" text;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "answer_model" text;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "rerank_used" boolean;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "embed_tokens" integer;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "embed_cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "rerank_prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "rerank_completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "rerank_cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "answer_prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "answer_completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "answer_cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "candidates_count" integer;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "evidence_count" integer;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "total_matching" integer;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "window_from" date;--> statement-breakpoint
ALTER TABLE "ask_usage" ADD COLUMN "window_to" date;