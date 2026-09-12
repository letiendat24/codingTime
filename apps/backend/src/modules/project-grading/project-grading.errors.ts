import { HttpError } from '../../shared/http-error';

export function projectCheckpointNotFound() {
  return new HttpError(404, 'PROJECT_CHECKPOINT_NOT_FOUND', 'Project checkpoint not found');
}

export function projectConfigInvalid(message: string) {
  return new HttpError(400, 'PROJECT_CONFIG_INVALID', message);
}

export function projectRubricCriterionNotFound() {
  return new HttpError(404, 'PROJECT_RUBRIC_CRITERION_NOT_FOUND', 'Project rubric criterion not found');
}

export function projectRubricInvalid(message: string) {
  return new HttpError(400, 'PROJECT_RUBRIC_INVALID', message);
}

export function projectSubmissionNotAllowed(message: string) {
  return new HttpError(400, 'PROJECT_SUBMISSION_NOT_ALLOWED', message);
}

export function projectSubmissionNotFound() {
  return new HttpError(404, 'PROJECT_SUBMISSION_NOT_FOUND', 'Project submission not found');
}

export function projectSubmissionActiveLimitExceeded() {
  return new HttpError(429, 'PROJECT_ACTIVE_LIMIT_EXCEEDED', 'Too many active project submissions');
}
