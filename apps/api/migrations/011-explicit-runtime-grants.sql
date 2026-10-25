-- Business tables are private SQL resources, not Supabase Data API resources.
-- Run after 001-010 and creation of the two restricted backend login roles.
-- No table data, RLS settings, policies, triggers or history are changed here.
REVOKE ALL ON SCHEMA colorverse FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA colorverse FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA colorverse TO colorverse_identity_reader, colorverse_classroom_writer;

-- Enrollment, teacher statistics and read-only classroom summaries.
GRANT SELECT ON colorverse.users, colorverse.classes, colorverse.enrollments,
  colorverse.planets, colorverse.showcase_works, colorverse.classroom_interactions,
  colorverse.submissions, colorverse.submission_versions, colorverse.showcase_reviews,
  colorverse.learning_task_settings TO colorverse_identity_reader;

-- All user/role/class authorization still runs in the Worker on each request.
GRANT SELECT ON colorverse.users, colorverse.classes, colorverse.enrollments
  TO colorverse_classroom_writer;
GRANT SELECT, INSERT, UPDATE ON colorverse.planets, colorverse.showcase_works,
  colorverse.learning_task_settings, colorverse.student_accounts,
  colorverse.student_import_batches TO colorverse_classroom_writer;
GRANT SELECT, INSERT, DELETE ON colorverse.classroom_interactions
  TO colorverse_classroom_writer;
-- Reviews are append-only; do not grant UPDATE or DELETE on review history.
GRANT SELECT, INSERT ON colorverse.showcase_reviews, colorverse.classroom_notice_reads
  TO colorverse_classroom_writer;
GRANT SELECT ON colorverse.classroom_login_aliases, colorverse.isolated_account_courses
  TO colorverse_classroom_writer;
GRANT INSERT ON colorverse.users, colorverse.enrollments TO colorverse_classroom_writer;
-- Student profile completion must not allow changing auth identity or user status.
GRANT UPDATE (display_name, student_number, real_name) ON colorverse.users
  TO colorverse_classroom_writer;
