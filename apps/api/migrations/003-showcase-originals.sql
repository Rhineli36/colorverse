ALTER TABLE showcase_works ADD COLUMN original_storage_key text UNIQUE;
ALTER TABLE showcase_works ADD COLUMN original_byte_size integer NOT NULL DEFAULT 0 CHECK(original_byte_size BETWEEN 0 AND 8388608);
ALTER TABLE showcase_works ADD COLUMN original_mime text;
ALTER TABLE showcase_works ADD COLUMN original_sha256 char(64);
ALTER TABLE showcase_works ADD COLUMN element_params jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(element_params)='object');
ALTER TABLE showcase_works ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK(revision>=0);
