ALTER TABLE "practice_problem_test_cases"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "expectedOutputSource" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "referenceFingerprint" TEXT,
  ADD COLUMN "generationVersion" TEXT;

CREATE INDEX "practice_problem_test_cases_referenceFingerprint_idx"
  ON "practice_problem_test_cases"("referenceFingerprint");
