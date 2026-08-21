CREATE TABLE "aha_pdf_revisions" (
	"aha_id" text NOT NULL,
	"filename" text NOT NULL,
	"source_revision" integer NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"bytes" "bytea" NOT NULL,
	"byte_length" integer NOT NULL,
	"sha256" text NOT NULL,
	"backed_up_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aha_pdf_revisions_pk" PRIMARY KEY("aha_id","source_revision","generated_at")
);
--> statement-breakpoint
ALTER TABLE "aha_pdf_revisions" ADD CONSTRAINT "aha_pdf_revisions_aha_id_ahas_id_fk" FOREIGN KEY ("aha_id") REFERENCES "public"."ahas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aha_pdf_revisions_history_idx" ON "aha_pdf_revisions" USING btree ("aha_id","generated_at");--> statement-breakpoint
CREATE FUNCTION archive_current_aha_pdf_revision() RETURNS trigger AS $$
BEGIN
	IF OLD.source_revision IS DISTINCT FROM NEW.source_revision
		OR OLD.generated_at IS DISTINCT FROM NEW.generated_at
		OR OLD.sha256 IS DISTINCT FROM NEW.sha256 THEN
		INSERT INTO aha_pdf_revisions (
			aha_id, filename, source_revision, generated_at, bytes,
			byte_length, sha256, backed_up_at, superseded_at
		) VALUES (
			OLD.aha_id, OLD.filename, OLD.source_revision, OLD.generated_at,
			OLD.bytes, OLD.byte_length, OLD.sha256, OLD.backed_up_at, now()
		)
		ON CONFLICT (aha_id, source_revision, generated_at) DO NOTHING;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER aha_pdfs_archive_before_update
BEFORE UPDATE ON aha_pdfs
FOR EACH ROW EXECUTE FUNCTION archive_current_aha_pdf_revision();--> statement-breakpoint
CREATE FUNCTION store_aha_pdf_version(
	p_aha_id text,
	p_filename text,
	p_source_revision integer,
	p_generated_at timestamp with time zone,
	p_bytes bytea,
	p_byte_length integer,
	p_sha256 text,
	p_backed_up_at timestamp with time zone
) RETURNS boolean AS $$
DECLARE
	current_pdf aha_pdfs%ROWTYPE;
	is_newer boolean;
BEGIN
	-- Serialize all versions for one AHA so concurrent and out-of-order uploads
	-- cannot race the identity or current-version decisions below.
	PERFORM pg_advisory_xact_lock(hashtextextended(p_aha_id, 0));

	SELECT * INTO current_pdf
	FROM aha_pdfs
	WHERE aha_id = p_aha_id
	FOR UPDATE;

	IF EXISTS (
		SELECT 1 FROM aha_pdfs
		WHERE aha_id = p_aha_id
			AND source_revision = p_source_revision
			AND generated_at = p_generated_at
			AND sha256 <> p_sha256
	) OR EXISTS (
		SELECT 1 FROM aha_pdf_revisions
		WHERE aha_id = p_aha_id
			AND source_revision = p_source_revision
			AND generated_at = p_generated_at
			AND sha256 <> p_sha256
	) THEN
		RAISE EXCEPTION 'PDF version identity has conflicting bytes'
			USING ERRCODE = '23505', CONSTRAINT = 'aha_pdf_version_integrity';
	END IF;

	IF current_pdf.aha_id IS NOT NULL
		AND current_pdf.source_revision = p_source_revision
		AND current_pdf.generated_at = p_generated_at
		AND current_pdf.sha256 = p_sha256 THEN
		RETURN true;
	END IF;

	IF EXISTS (
		SELECT 1 FROM aha_pdf_revisions
		WHERE aha_id = p_aha_id
			AND source_revision = p_source_revision
			AND generated_at = p_generated_at
			AND sha256 = p_sha256
	) THEN
		RETURN false;
	END IF;

	IF current_pdf.aha_id IS NULL THEN
		INSERT INTO aha_pdfs (
			aha_id, filename, source_revision, generated_at, bytes,
			byte_length, sha256, backed_up_at
		) VALUES (
			p_aha_id, p_filename, p_source_revision, p_generated_at, p_bytes,
			p_byte_length, p_sha256, p_backed_up_at
		);
		RETURN true;
	END IF;

	is_newer := p_source_revision > current_pdf.source_revision
		OR (
			p_source_revision = current_pdf.source_revision
			AND p_generated_at > current_pdf.generated_at
		);

	IF is_newer THEN
		IF EXISTS (
			SELECT 1 FROM aha_pdf_revisions
			WHERE aha_id = current_pdf.aha_id
				AND source_revision = current_pdf.source_revision
				AND generated_at = current_pdf.generated_at
				AND sha256 <> current_pdf.sha256
		) THEN
			RAISE EXCEPTION 'Current PDF conflicts with its historical identity'
				USING ERRCODE = '23505', CONSTRAINT = 'aha_pdf_version_integrity';
		END IF;

		UPDATE aha_pdfs SET
			filename = p_filename,
			source_revision = p_source_revision,
			generated_at = p_generated_at,
			bytes = p_bytes,
			byte_length = p_byte_length,
			sha256 = p_sha256,
			backed_up_at = p_backed_up_at
		WHERE aha_id = p_aha_id;
		RETURN true;
	END IF;

	INSERT INTO aha_pdf_revisions (
		aha_id, filename, source_revision, generated_at, bytes,
		byte_length, sha256, backed_up_at, superseded_at
	) VALUES (
		p_aha_id, p_filename, p_source_revision, p_generated_at, p_bytes,
		p_byte_length, p_sha256, p_backed_up_at, p_backed_up_at
	);
	RETURN false;
END;
$$ LANGUAGE plpgsql;
