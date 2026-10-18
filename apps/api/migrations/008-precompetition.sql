ALTER TABLE users ADD COLUMN student_number text, ADD COLUMN real_name text;
CREATE TABLE classroom_notice_reads (
 enrollment_id uuid NOT NULL REFERENCES enrollments(id),
 notice_id text NOT NULL CHECK(length(notice_id) BETWEEN 1 AND 250),
 read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enrollment_id,notice_id)
);
CREATE INDEX classroom_pending_works ON showcase_works(planet_id,created_at DESC) WHERE withdrawn_at IS NULL;
