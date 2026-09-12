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

export function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function parseTimeString(timeStr: string): number {
  const trimmed = timeStr.trim();
  if (!trimmed) {
    return 0;
  }

  // Check for colon-separated format (mm:ss or hh:mm:ss)
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((p) => Number(p));
    if (parts.some((p) => Number.isNaN(p) || p < 0)) {
      return 0;
    }

    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return (minutes ?? 0) * 60 + (seconds ?? 0);
    }

    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      return (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0);
    }
  }

  const raw = Number(trimmed);
  if (Number.isNaN(raw) || raw < 0) {
    return 0;
  }

  return Math.floor(raw);
}

export function findPreviousSnapshot<TSnapshot extends VideoLearningSnapshot>(
  targetTimeSeconds: number,
  snapshots: readonly TSnapshot[],
): TSnapshot | undefined {
  const candidates = snapshots
    .filter((snap) => snap.timestampSeconds <= targetTimeSeconds)
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds);

  return candidates.at(-1);
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

export function resolvePlaybackUrl(url: string, token?: string): string {
  if (!url) {
    return '';
  }

  let fullUrl: string;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    fullUrl = url;
  } else if (url.startsWith('/api/v1')) {
    const apiOrigin = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/api\/v1\/?$/, '');
    fullUrl = `${apiOrigin}${url}`;
  } else if (url.startsWith('/')) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
    fullUrl = `${apiUrl}${url}`;
  } else {
    fullUrl = url;
  }

  if (token) {
    try {
      const parsed = new URL(fullUrl, 'http://localhost');
      if (!parsed.searchParams.has('token')) {
        parsed.searchParams.set('token', token);
        fullUrl = fullUrl.startsWith('http') ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
      }
    } catch {
      // Keep fullUrl as is
    }
  }

  return fullUrl;
}
