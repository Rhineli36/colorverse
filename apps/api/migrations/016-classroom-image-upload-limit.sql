ALTER TABLE colorverse.showcase_works
  DROP CONSTRAINT showcase_works_original_byte_size_check,
  ADD CONSTRAINT showcase_works_original_byte_size_check
    CHECK (original_byte_size BETWEEN 0 AND 15728640);
