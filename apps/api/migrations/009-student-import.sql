CREATE TABLE student_accounts (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES courses(id),
  student_number text NOT NULL,
  real_name text NOT NULL,
  login_account text NOT NULL UNIQUE,
  login_email text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  activation_hash text,
  activated_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id,student_number)
);
CREATE INDEX student_accounts_user ON student_accounts(user_id);
CREATE TABLE classroom_login_aliases (
  login_account text PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  login_email text NOT NULL
);
CREATE TABLE student_import_batches (
  id uuid PRIMARY KEY,
  class_id uuid NOT NULL REFERENCES classes(id),
  actor_id uuid NOT NULL REFERENCES enrollments(id),
  rows jsonb NOT NULL,
  result_cipher text NOT NULL,
  completed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
