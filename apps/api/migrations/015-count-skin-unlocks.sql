-- Count/upload awards do not require a course-work proof. Preserve all winter proofs.
ALTER TABLE colorverse.classroom_skin_unlocks ALTER COLUMN proof_work_id DROP NOT NULL;
ALTER TABLE colorverse.classroom_skin_unlocks ADD COLUMN evidence jsonb NOT NULL DEFAULT '{}';
-- Existing restricted SELECT/INSERT grants cover the added column. No public grants,
-- changes to RLS, or UPDATE/DELETE access to earned awards are introduced.
