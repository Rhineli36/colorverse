SET LOCAL search_path=colorverse,pg_catalog;
ALTER TABLE learning_task_settings ADD COLUMN image_storage_keys jsonb NOT NULL DEFAULT '[]';
CREATE TABLE classroom_skin_bindings (
 class_id uuid NOT NULL REFERENCES classes(id), skin_id text NOT NULL,
 task_id text NOT NULL, PRIMARY KEY(class_id,skin_id),
 FOREIGN KEY(class_id,task_id) REFERENCES learning_task_settings(class_id,task_id)
);
CREATE TABLE classroom_skin_unlocks (
 enrollment_id uuid NOT NULL REFERENCES enrollments(id), skin_id text NOT NULL,
 proof_work_id uuid NOT NULL REFERENCES showcase_works(id), unlocked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enrollment_id,skin_id)
);
CREATE TABLE classroom_skin_settings (
 planet_id uuid PRIMARY KEY REFERENCES planets(id), frame_id text,
 placement jsonb NOT NULL DEFAULT '{"x":0.85,"y":0.35,"amplitude":"gentle"}',
 options jsonb NOT NULL DEFAULT '{"particles":true,"lantern":true}',
 revision integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON classroom_skin_bindings,classroom_skin_unlocks,classroom_skin_settings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON classroom_skin_bindings TO colorverse_classroom_writer;
GRANT SELECT,INSERT ON classroom_skin_unlocks TO colorverse_classroom_writer;
GRANT SELECT,INSERT,UPDATE ON classroom_skin_settings TO colorverse_classroom_writer;
