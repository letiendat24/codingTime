ALTER TABLE "practice_problems"
  ALTER COLUMN "executionContract" SET DEFAULT 'FUNCTION';

UPDATE "practice_problems"
SET "executionContract" = 'FUNCTION',
    "validationFingerprint" = NULL,
    "validatedAt" = NULL,
    "validationSummaryJson" = NULL
WHERE "executionContract" = 'STDIN_STDOUT';
