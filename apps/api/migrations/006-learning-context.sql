-- Optional teaching context. Existing works and reactions remain valid and unchanged.
ALTER TABLE showcase_works ADD COLUMN learning_context jsonb;
ALTER TABLE classroom_interactions ADD COLUMN learning_feedback jsonb;
CREATE TABLE learning_task_settings (
 class_id uuid NOT NULL REFERENCES classes(id), task_id text NOT NULL CHECK(task_id IN ('T01','T02','T03')),
 published boolean NOT NULL DEFAULT false, require_explanation boolean NOT NULL DEFAULT true,
 allow_peer_review boolean NOT NULL DEFAULT true, show_intent_to_peers boolean NOT NULL DEFAULT true,
 revision integer NOT NULL CHECK(revision>0), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(class_id,task_id)
);
