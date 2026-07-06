DROP INDEX "isw_reports_date_idx";--> statement-breakpoint
ALTER TABLE "isw_reports" ADD COLUMN "theater" text DEFAULT 'ru' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "isw_reports_theater_date_idx" ON "isw_reports" USING btree ("theater","report_date");