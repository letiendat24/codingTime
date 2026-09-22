import { HttpError } from '../../shared/http-error';

export function workspaceNotFound() {
  return new HttpError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
}

export function checkpointWorkspaceNotAllowed() {
  return new HttpError(400, 'CHECKPOINT_WORKSPACE_NOT_ALLOWED', 'A workspace can only be opened for a coding checkpoint');
}

export function lessonWorkspaceNotAllowed() {
  return new HttpError(400, 'LESSON_WORKSPACE_NOT_ALLOWED', 'A workspace can only be opened for a code-along video lesson');
}

export function workspaceFileInvalid(message = 'Workspace files are invalid') {
  return new HttpError(400, 'WORKSPACE_FILE_INVALID', message);
}

export function codeSnapshotImportNotAllowed() {
  return new HttpError(404, 'CODE_SNAPSHOT_NOT_FOUND', 'Code snapshot not found');
}

export function executionNotFound() {
  return new HttpError(404, 'EXECUTION_NOT_FOUND', 'Execution not found');
}

export function executionLanguageUnsupported() {
  return new HttpError(400, 'EXECUTION_LANGUAGE_UNSUPPORTED', 'Execution language is not supported');
}

export function executionActiveLimitExceeded() {
  return new HttpError(429, 'EXECUTION_ACTIVE_LIMIT_EXCEEDED', 'Too many active executions');
}

export function practiceRunInputInvalid(message = 'Practice run input is invalid') {
  return new HttpError(400, 'PRACTICE_RUN_INPUT_INVALID', message);
}

export function practiceRunSampleUnavailable(message = 'Practice problem has no runnable public sample') {
  return new HttpError(422, 'PRACTICE_RUN_SAMPLE_UNAVAILABLE', message);
}

export function workspaceRevisionNotFound() {
  return new HttpError(404, 'WORKSPACE_REVISION_NOT_FOUND', 'Workspace revision not found');
}
