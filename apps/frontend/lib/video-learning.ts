export interface VideoLearningCheckpoint {
  readonly id: string;
  readonly timestampSeconds: number;
  readonly required: boolean;
  readonly pauseVideo: boolean;
  readonly completed: boolean;
}

export interface VideoLearningSnapshot {
  readonly id: string;
  readonly timestampSeconds: number;
}

export interface ComparableCodeFile {
  readonly path: string;
  readonly content: string;
}

export function findTriggeredCheckpoint<TCheckpoint extends VideoLearningCheckpoint>(
  previousTimeSeconds: number,
  currentTimeSeconds: number,
  checkpoints: readonly TCheckpoint[],
  triggeredCheckpointIds: ReadonlySet<string>,
) {
  if (currentTimeSeconds <= previousTimeSeconds) {
    return undefined;
  }

  return checkpoints.find((checkpoint) =>
    checkpoint.pauseVideo &&
    !checkpoint.completed &&
    !triggeredCheckpointIds.has(checkpoint.id) &&
    checkpoint.timestampSeconds > previousTimeSeconds &&
    checkpoint.timestampSeconds <= currentTimeSeconds,
  );
}

export function findBlockedSeekCheckpoint<TCheckpoint extends VideoLearningCheckpoint>(
  fromTimeSeconds: number,
  targetTimeSeconds: number,
  checkpoints: readonly TCheckpoint[],
) {
  if (targetTimeSeconds <= fromTimeSeconds) {
    return undefined;
  }

  return checkpoints.find((checkpoint) =>
    checkpoint.required &&
    !checkpoint.completed &&
    checkpoint.timestampSeconds > fromTimeSeconds &&
    checkpoint.timestampSeconds <= targetTimeSeconds,
  );
}

export function selectSnapshotAtOrBefore<TSnapshot extends VideoLearningSnapshot>(
  currentTimeSeconds: number,
  snapshots: readonly TSnapshot[],
) {
  return snapshots
    .filter((snapshot) => snapshot.timestampSeconds <= currentTimeSeconds)
    .at(-1);
}

export function selectNextSnapshot<TSnapshot extends VideoLearningSnapshot>(
  currentTimeSeconds: number,
  snapshots: readonly TSnapshot[],
) {
  return snapshots.find((snapshot) => snapshot.timestampSeconds > currentTimeSeconds);
}

export function compareCodeFiles(studentFiles: readonly ComparableCodeFile[], instructorFiles: readonly ComparableCodeFile[]) {
  const studentByPath = new Map(studentFiles.map((file) => [file.path, file]));
  const instructorByPath = new Map(instructorFiles.map((file) => [file.path, file]));
  const paths = Array.from(new Set([...studentByPath.keys(), ...instructorByPath.keys()])).sort();
  const files = paths.map((path) => {
    const student = studentByPath.get(path);
    const instructor = instructorByPath.get(path);
    const status = !student
      ? 'INSTRUCTOR_ONLY'
      : !instructor
        ? 'STUDENT_ONLY'
        : student.content === instructor.content
          ? 'SAME'
          : 'MODIFIED';

    return {
      path,
      status,
      studentContent: student?.content ?? '',
      instructorContent: instructor?.content ?? '',
    };
  });

  return {
    files,
    summary: {
      total: files.length,
      unchanged: files.filter((file) => file.status === 'SAME').length,
      modified: files.filter((file) => file.status === 'MODIFIED').length,
      studentOnly: files.filter((file) => file.status === 'STUDENT_ONLY').length,
      instructorOnly: files.filter((file) => file.status === 'INSTRUCTOR_ONLY').length,
    },
  };
}

export function shouldSaveVideoProgress(
  lastSavedAtMs: number,
  nowMs: number,
  intervalSeconds: number,
) {
  return nowMs - lastSavedAtMs >= intervalSeconds * 1000;
}
