-- Keep historical Bank Soal identities while distinguishing deletion from
-- restorable archival. Existing archives remain available for restoration.
ALTER TABLE "question_banks" ADD COLUMN "deleted_at" TIMESTAMPTZ;
