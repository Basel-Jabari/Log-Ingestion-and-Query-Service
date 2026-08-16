CREATE INDEX "logs_timestamp_id_idx" ON "logs" USING btree ("timestamp","id");--> statement-breakpoint
CREATE INDEX "logs_service_timestamp_idx" ON "logs" USING btree ("service","timestamp");
