CREATE TABLE "trade_flows" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_code" integer NOT NULL,
	"reporter_name" text NOT NULL,
	"partner_code" integer NOT NULL,
	"flow_code" text NOT NULL,
	"hs_code" text NOT NULL,
	"period" text NOT NULL,
	"value_usd" double precision NOT NULL,
	"net_weight_kg" double precision,
	"source" text DEFAULT 'comtrade' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "trade_flows_key_idx" ON "trade_flows" USING btree ("reporter_code","partner_code","flow_code","hs_code","period");--> statement-breakpoint
CREATE INDEX "trade_flows_reporter_idx" ON "trade_flows" USING btree ("reporter_code");--> statement-breakpoint
CREATE INDEX "trade_flows_hs_idx" ON "trade_flows" USING btree ("hs_code");