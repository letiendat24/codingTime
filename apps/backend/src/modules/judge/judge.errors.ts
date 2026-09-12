import { HttpError } from '../../shared/http-error';

export function codingCheckpointNotFound() {
  return new HttpError(404, 'CODING_CHECKPOINT_NOT_FOUND', 'Coding checkpoint not found');
}

export function codingConfigInvalid(message: string) {
  return new HttpError(400, 'CODING_CONFIG_INVALID', message);
}

export function testCaseNotFound() {
  return new HttpError(404, 'TEST_CASE_NOT_FOUND', 'Test case not found');
}

export function testCaseInvalid(message: string) {
  return new HttpError(400, 'TEST_CASE_INVALID', message);
}

export function judgeWorkspaceNotFound() {
  return new HttpError(404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
}

export function judgeSubmissionNotFound() {
  return new HttpError(404, 'JUDGE_SUBMISSION_NOT_FOUND', 'Judge submission not found');
}

export function judgeSubmissionNotAllowed(message = 'Workspace is not ready for judged submission') {
  return new HttpError(400, 'JUDGE_SUBMISSION_NOT_ALLOWED', message);
}

export function judgeActiveLimitExceeded() {
  return new HttpError(429, 'JUDGE_ACTIVE_LIMIT_EXCEEDED', 'Too many active judge submissions');
}
