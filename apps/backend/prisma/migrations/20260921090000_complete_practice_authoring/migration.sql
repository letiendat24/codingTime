ALTER TABLE "practice_problems"
  ADD COLUMN "inputFormat" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "outputFormat" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "constraints" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "examplesJson" JSONB,
  ADD COLUMN "explanation" TEXT,
  ADD COLUMN "referenceFilesJson" JSONB,
  ADD COLUMN "executionContract" TEXT NOT NULL DEFAULT 'STDIN_STDOUT',
  ADD COLUMN "comparisonPolicy" TEXT NOT NULL DEFAULT 'NORMALIZED_TEXT',
  ADD COLUMN "validationFingerprint" TEXT,
  ADD COLUMN "validatedAt" TIMESTAMP(3),
  ADD COLUMN "validationSummaryJson" JSONB;
