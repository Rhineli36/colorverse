-- Isolated review/demo courses must never attach a real classroom identity by student number.
CREATE TABLE isolated_account_courses (
  course_id uuid PRIMARY KEY REFERENCES courses(id)
);
