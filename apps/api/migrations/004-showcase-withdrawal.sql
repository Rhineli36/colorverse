-- Reversible withdrawal: keep original files, element parameters and source history.
ALTER TABLE showcase_works ADD COLUMN withdrawn_at timestamptz;
ALTER TABLE showcase_works ADD COLUMN withdrawn_by uuid REFERENCES enrollments(id);
ALTER TABLE showcase_works ADD CONSTRAINT withdrawal_pair
  CHECK ((withdrawn_at IS NULL) = (withdrawn_by IS NULL));

-- Visibility changes must not complete the separate element-editing guide task.
ALTER TABLE showcase_works ADD COLUMN element_edited boolean NOT NULL DEFAULT false;
UPDATE showcase_works SET element_edited=true WHERE revision>0;
