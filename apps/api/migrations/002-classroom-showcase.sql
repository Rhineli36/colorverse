ALTER TABLE planets ADD COLUMN document jsonb;
CREATE TABLE showcase_works (
 id uuid PRIMARY KEY, planet_id uuid NOT NULL REFERENCES planets(id),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120), description text NOT NULL DEFAULT '' CHECK(length(description)<=2000),
 storage_key text NOT NULL UNIQUE, byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 8388608),
 preset_id text NOT NULL, color char(7) NOT NULL DEFAULT '#b9e0cf',
 created_at timestamptz NOT NULL DEFAULT now(), request_id uuid NOT NULL,
 UNIQUE(planet_id,request_id)
);
CREATE TABLE classroom_interactions (
 id uuid PRIMARY KEY, actor_enrollment_id uuid NOT NULL REFERENCES enrollments(id),
 planet_id uuid NOT NULL REFERENCES planets(id), work_id uuid REFERENCES showcase_works(id),
 kind text NOT NULL CHECK(kind IN ('like','emoji','comment')),
 content text NOT NULL DEFAULT '' CHECK(length(content)<=500), created_at timestamptz NOT NULL DEFAULT now(),
 request_id uuid NOT NULL, UNIQUE(actor_enrollment_id,request_id)
);
CREATE UNIQUE INDEX one_classroom_reaction ON classroom_interactions(actor_enrollment_id,planet_id,COALESCE(work_id,'00000000-0000-0000-0000-000000000000'::uuid),kind) WHERE kind IN ('like','emoji');
CREATE INDEX showcase_planet_order ON showcase_works(planet_id,created_at DESC);
CREATE INDEX classroom_interaction_target ON classroom_interactions(planet_id,created_at DESC);
