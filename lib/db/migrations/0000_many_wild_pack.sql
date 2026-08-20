CREATE TABLE "aha_pdfs" (
	"aha_id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"source_revision" integer NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"bytes" "bytea" NOT NULL,
	"byte_length" integer NOT NULL,
	"sha256" text NOT NULL,
	"backed_up_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ahas" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"aha_date" date NOT NULL,
	"payload" jsonb NOT NULL,
	"client_updated_at" timestamp with time zone NOT NULL,
	"backed_up_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"client_updated_at" timestamp with time zone NOT NULL,
	"backed_up_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aha_pdfs" ADD CONSTRAINT "aha_pdfs_aha_id_ahas_id_fk" FOREIGN KEY ("aha_id") REFERENCES "public"."ahas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ahas" ADD CONSTRAINT "ahas_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ahas_job_date_unique" ON "ahas" USING btree ("job_id","aha_date");--> statement-breakpoint
CREATE INDEX "ahas_restore_cursor_idx" ON "ahas" USING btree ("client_updated_at","id");--> statement-breakpoint
CREATE INDEX "jobs_client_updated_at_idx" ON "jobs" USING btree ("client_updated_at");