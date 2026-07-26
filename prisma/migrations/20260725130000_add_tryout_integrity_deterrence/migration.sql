-- Optional participant fullscreen prompt plus warning-only integrity audit events.
CREATE TYPE "tryout_integrity_event_type" AS ENUM (
  'focus_lost',
  'focus_returned',
  'visibility_hidden',
  'visibility_visible',
  'fullscreen_entered',
  'fullscreen_exited'
);

ALTER TABLE "tryout_delivery_sessions"
  ADD COLUMN "fullscreen_prompt" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "tryout_integrity_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_id" UUID NOT NULL,
  "event_type" "tryout_integrity_event_type" NOT NULL,
  "server_sequence" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tryout_integrity_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tryout_integrity_events_run_id_server_sequence_key"
  ON "tryout_integrity_events"("run_id", "server_sequence");
CREATE INDEX "tryout_integrity_events_run_id_created_at_idx"
  ON "tryout_integrity_events"("run_id", "created_at");

ALTER TABLE "tryout_integrity_events"
  ADD CONSTRAINT "tryout_integrity_events_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "tryout_attempt_test_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
