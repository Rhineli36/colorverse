-- Soft removal changes only a class membership status. Identity, role, history,
-- works, recipients and grades remain unchanged. No public/Data API grants.
GRANT UPDATE (status) ON colorverse.enrollments TO colorverse_classroom_writer;
