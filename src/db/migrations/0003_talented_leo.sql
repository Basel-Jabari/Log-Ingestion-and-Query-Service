DROP INDEX "logs_timestamp_id_idx";--> statement-breakpoint
CREATE INDEX "logs_timestamp_id_service_level_idx" ON "logs" USING btree ("timestamp","id","service","level");--> statement-breakpoint
CREATE INDEX "logs_attributes_gin_idx" ON "logs" USING gin ("attributes" jsonb_path_ops);