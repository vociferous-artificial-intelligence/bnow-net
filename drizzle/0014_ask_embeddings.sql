CREATE TABLE "claim_embeddings" (
	"claim_id" integer NOT NULL,
	"model" text NOT NULL,
	"dims" integer NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_embeddings_claim_id_model_pk" PRIMARY KEY("claim_id","model")
);
--> statement-breakpoint
ALTER TABLE "claim_embeddings" ADD CONSTRAINT "claim_embeddings_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_embeddings_hnsw_idx" ON "claim_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "claims_text_fts_idx" ON "claims" USING gin (to_tsvector('english', "text"));