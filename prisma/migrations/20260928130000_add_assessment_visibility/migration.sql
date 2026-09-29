ALTER TABLE "standalone_quizzes"
ADD COLUMN "is_hidden" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "tryout_packages"
ADD COLUMN "is_hidden" BOOLEAN NOT NULL DEFAULT false;
