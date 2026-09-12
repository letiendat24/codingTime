import { HttpError } from '../../shared/http-error';

export function videoLearningNotAccessible() {
  return new HttpError(404, 'VIDEO_NOT_ACCESSIBLE', 'Video is not accessible');
}

export function videoProgressInvalidPosition() {
  return new HttpError(400, 'VIDEO_PROGRESS_INVALID_POSITION', 'Video position must be a non-negative number');
}

export function checkpointNotFound() {
  return new HttpError(404, 'CHECKPOINT_NOT_FOUND', 'Checkpoint not found');
}

export function checkpointTimestampInvalid() {
  return new HttpError(400, 'CHECKPOINT_TIMESTAMP_INVALID', 'Checkpoint timestamp must be within video duration');
}

export function checkpointCompletionUnsupported() {
  return new HttpError(409, 'CHECKPOINT_COMPLETION_UNSUPPORTED', 'This checkpoint type requires a future assessment flow');
}

export function codeSnapshotNotFound() {
  return new HttpError(404, 'CODE_SNAPSHOT_NOT_FOUND', 'Code snapshot not found');
}

export function codeAlongConfigInvalid(message: string) {
  return new HttpError(400, 'CODE_ALONG_CONFIG_INVALID', message);
}

export function codeAlongNotEnabled() {
  return new HttpError(400, 'CODE_ALONG_NOT_ENABLED', 'Code-along is not enabled for this lesson');
}

export function codeSnapshotTimestampInvalid() {
  return new HttpError(400, 'CODE_SNAPSHOT_TIMESTAMP_INVALID', 'Code snapshot timestamp must be within video duration');
}

export function codeSnapshotFilesInvalid(message = 'Code snapshot files are invalid') {
  return new HttpError(400, 'CODE_SNAPSHOT_FILES_INVALID', message);
}
