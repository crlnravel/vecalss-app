-- Materi uses ModuleProgress as the server admission record. A skipped row is
-- deliberately distinct from completion so a later completion can resume the
-- earliest incomplete published unit without losing learner intent.
ALTER TYPE "progress_status" ADD VALUE IF NOT EXISTS 'skipped';
