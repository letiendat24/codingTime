-- Every code-along snapshot/milestone is a practice-capable checkpoint.
-- Preserve existing checkpoint IDs and completion history; only activate records
-- that already line up with an instructor code snapshot.
UPDATE "video_checkpoints" AS vc
SET
  "practiceEnabled" = true,
  "required" = true,
  "pauseVideo" = false,
  "practiceConfigMode" = 'AUTO',
  "practiceSnapshotId" = COALESCE(vc."practiceSnapshotId", cs."id"),
  "practiceTargetFilePath" = COALESCE(vc."practiceTargetFilePath", 'src/index.ts'),
  "updatedAt" = now()
FROM "code_snapshots" AS cs
WHERE vc."lessonId" = cs."lessonId"
  AND vc."videoAssetId" = cs."videoAssetId"
  AND vc."timestampSeconds" = cs."timestampSeconds";

-- Backfill a checkpoint for snapshots that do not yet have one at the same
-- lesson/video/timestamp. This avoids deleting unrelated video checkpoints or
-- touching existing progress rows.
INSERT INTO "video_checkpoints" (
  "id",
  "lessonId",
  "videoAssetId",
  "timestampSeconds",
  "type",
  "title",
  "description",
  "required",
  "pauseVideo",
  "practiceEnabled",
  "practiceConfigMode",
  "practiceVerificationMode",
  "practiceBehavior",
  "practiceSnapshotId",
  "practiceTargetFilePath",
  "position",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  cs."lessonId",
  cs."videoAssetId",
  cs."timestampSeconds",
  'INFO'::"VideoCheckpointType",
  COALESCE(cs."title", 'Milestone at ' || cs."timestampSeconds"::text || 's'),
  NULL,
  true,
  false,
  true,
  'AUTO',
  'NONE'::"VideoPracticeVerificationMode",
  'REQUIRED'::"VideoPracticeBehavior",
  cs."id",
  'src/index.ts',
  cs."timestampSeconds",
  now(),
  now()
FROM "code_snapshots" AS cs
WHERE NOT EXISTS (
  SELECT 1
  FROM "video_checkpoints" AS vc
  WHERE vc."lessonId" = cs."lessonId"
    AND vc."videoAssetId" = cs."videoAssetId"
    AND vc."timestampSeconds" = cs."timestampSeconds"
);
