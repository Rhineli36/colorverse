-- Preserve preset publications and existing submissions while enabling teacher-authored tasks.
ALTER TABLE learning_task_settings DROP CONSTRAINT learning_task_settings_task_id_check;
ALTER TABLE learning_task_settings ADD CONSTRAINT learning_task_settings_task_id_check CHECK(task_id IN ('T01','T02','T03') OR task_id ~ '^custom-[a-f0-9-]{36}$');
ALTER TABLE learning_task_settings ADD COLUMN definition jsonb;
ALTER TABLE learning_task_settings ADD COLUMN image_storage_key text;
