ALTER TABLE "video_checkpoints"
  ADD COLUMN "practiceProblemId" UUID;

CREATE INDEX "video_checkpoints_practiceProblemId_idx"
  ON "video_checkpoints"("practiceProblemId");

ALTER TABLE "video_checkpoints"
  ADD CONSTRAINT "video_checkpoints_practiceProblemId_fkey"
  FOREIGN KEY ("practiceProblemId")
  REFERENCES "practice_problems"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
