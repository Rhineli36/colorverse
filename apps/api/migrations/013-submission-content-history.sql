-- Preserve the content described by previous grades when an existing work is edited.
-- Images are immutable within a work; replacing images creates a separate submission.
ALTER TABLE colorverse.showcase_works ADD COLUMN submission_history jsonb NOT NULL DEFAULT '[]';
-- Existing restricted writer UPDATE/SELECT grants cover this additive column.
