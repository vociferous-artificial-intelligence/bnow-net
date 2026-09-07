CREATE TABLE "runtime_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"logged_at" timestamp with time zone NOT NULL,
	"deployment_id" text,
	"source" text,
	"level" text,
	"type" text,
	"environment" text,
	"request_path" text,
	"request_id" text,
	"status_code" integer,
	"message" text,
	"message_sha256" text
);
--> statement-breakpoint
CREATE INDEX "runtime_logs_received_idx" ON "runtime_logs" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "runtime_logs_deployment_received_idx" ON "runtime_logs" USING btree ("deployment_id","received_at");--> statement-breakpoint
CREATE INDEX "runtime_logs_logged_idx" ON "runtime_logs" USING btree ("logged_at");