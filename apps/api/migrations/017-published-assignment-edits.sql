-- Additive, no existing record rewrite. Keep prior references for audit/recovery.
ALTER TABLE colorverse.classroom_publications
 ADD COLUMN content_revision integer NOT NULL DEFAULT 0 CHECK(content_revision>=0),
 ADD COLUMN image_storage_keys jsonb CHECK(image_storage_keys IS NULL OR (jsonb_typeof(image_storage_keys)='array' AND jsonb_array_length(image_storage_keys)<=6)),
 ADD COLUMN content_history jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(content_history)='array');
-- Existing RLS and restricted writer grants remain in effect; no client role grants.
GRANT SELECT,UPDATE ON colorverse.classroom_publications TO colorverse_classroom_writer;
