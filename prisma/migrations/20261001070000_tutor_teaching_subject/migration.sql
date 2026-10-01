-- AlterTable
ALTER TABLE "tutor_profiles" ADD COLUMN "teaching_subject_code" VARCHAR(40);

-- CreateIndex
CREATE INDEX "tutor_profiles_teaching_subject_code_idx" ON "tutor_profiles"("teaching_subject_code");

-- AddForeignKey
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_teaching_subject_code_fkey" FOREIGN KEY ("teaching_subject_code") REFERENCES "subtests"("code") ON DELETE SET NULL ON UPDATE CASCADE;
