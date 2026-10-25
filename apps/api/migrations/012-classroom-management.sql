-- Additive classroom rollout. Original review Worker and existing records stay valid.
SET LOCAL search_path=colorverse,pg_catalog;
CREATE TABLE classroom_publications (
 id uuid PRIMARY KEY, class_id uuid NOT NULL REFERENCES classes(id),
 task_id text NOT NULL, definition jsonb NOT NULL, target_label text NOT NULL,
 due_at timestamptz, published_at timestamptz NOT NULL DEFAULT now(),
 publisher_enrollment_id uuid NOT NULL REFERENCES enrollments(id),
 request_id uuid NOT NULL, UNIQUE(class_id,request_id)
);
CREATE TABLE classroom_recipients (
 publication_id uuid NOT NULL REFERENCES classroom_publications(id),
 enrollment_id uuid NOT NULL REFERENCES enrollments(id), assigned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(publication_id,enrollment_id)
);
ALTER TABLE showcase_works ADD COLUMN publication_id uuid REFERENCES classroom_publications(id);
ALTER TABLE showcase_works ADD COLUMN submission_revision integer NOT NULL DEFAULT 0;
ALTER TABLE showcase_works ADD COLUMN gallery_images jsonb NOT NULL DEFAULT '[]';
ALTER TABLE showcase_works ADD COLUMN gallery_byte_size integer NOT NULL DEFAULT 0;
ALTER TABLE showcase_reviews ADD COLUMN submission_revision integer NOT NULL DEFAULT 0;
CREATE INDEX classroom_work_assignment ON showcase_works(publication_id,planet_id,created_at DESC,id DESC) WHERE withdrawn_at IS NULL;
CREATE TABLE classroom_login_history (
 user_id uuid PRIMARY KEY REFERENCES users(id), first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE classroom_activation_challenges (
 token_hash text PRIMARY KEY, account_id uuid NOT NULL REFERENCES student_accounts(id),
 operation_id uuid NOT NULL UNIQUE, expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE TABLE classroom_security_attempts (
 key_hash text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0,
 window_start timestamptz NOT NULL DEFAULT now(), blocked_until timestamptz
);
ALTER TABLE student_accounts ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
REVOKE ALL ON classroom_publications,classroom_recipients,classroom_login_history,
 classroom_activation_challenges,classroom_security_attempts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON classroom_publications,classroom_recipients,classroom_login_history,
 classroom_activation_challenges,classroom_security_attempts TO colorverse_classroom_writer;
-- Existing writer grants already cover the added work/account columns.
