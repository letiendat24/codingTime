import { HttpError } from '../../shared/http-error';

export function practiceProblemNotFound() {
  return new HttpError(404, 'PRACTICE_PROBLEM_NOT_FOUND', 'Practice problem not found');
}

export function practiceProblemNotOwned() {
  return practiceProblemNotFound();
}

export function practiceProblemInvalid(message: string) {
  return new HttpError(400, 'PRACTICE_PROBLEM_INVALID', message);
}

export function practiceProblemNotReady(details: readonly string[]) {
  return new HttpError(422, 'PRACTICE_PROBLEM_NOT_READY', 'Practice problem is missing required content', details);
}

export function practiceSlugAlreadyExists() {
  return new HttpError(409, 'PRACTICE_SLUG_ALREADY_EXISTS', 'Practice problem slug is already used');
}

export function practiceTestCaseNotFound() {
  return new HttpError(404, 'PRACTICE_TEST_CASE_NOT_FOUND', 'Practice test case not found');
}
