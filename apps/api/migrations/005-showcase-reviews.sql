-- Separate classroom showcase feedback from formal assignment grades.
CREATE TABLE showcase_reviews (
 id uuid PRIMARY KEY,
 work_id uuid NOT NULL REFERENCES showcase_works(id),
 reviewer_enrollment_id uuid NOT NULL REFERENCES enrollments(id),
 revision integer NOT NULL CHECK(revision>0),
 base_revision integer NOT NULL CHECK(base_revision>=0),
 score numeric CHECK(score BETWEEN 0 AND 100),
 comment text NOT NULL CHECK(length(comment)<=2000),
 source text NOT NULL CHECK(source IN ('teacher','demo')),
 request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(score IS NOT NULL OR length(trim(comment))>0),
 CHECK(revision=base_revision+1),
 UNIQUE(work_id,revision), UNIQUE(reviewer_enrollment_id,request_id)
);
CREATE FUNCTION immutable_showcase_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Showcase review history is immutable';
END $$;
CREATE TRIGGER showcase_review_history BEFORE UPDATE OR DELETE ON showcase_reviews
 FOR EACH ROW EXECUTE FUNCTION immutable_showcase_review();
