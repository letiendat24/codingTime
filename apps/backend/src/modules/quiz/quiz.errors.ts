import { HttpError } from '../../shared/http-error';

export function quizNotFound() {
  return new HttpError(404, 'QUIZ_NOT_FOUND', 'Quiz not found');
}

export function quizLessonInvalid() {
  return new HttpError(400, 'QUIZ_LESSON_INVALID', 'Lesson must be a quiz lesson');
}

export function quizNotConfigured() {
  return new HttpError(404, 'QUIZ_NOT_CONFIGURED', 'Quiz is not configured');
}

export function quizQuestionNotFound() {
  return new HttpError(404, 'QUIZ_QUESTION_NOT_FOUND', 'Quiz question not found');
}

export function quizAttemptNotFound() {
  return new HttpError(404, 'QUIZ_ATTEMPT_NOT_FOUND', 'Quiz attempt not found');
}

export function quizAttemptAlreadySubmitted() {
  return new HttpError(409, 'QUIZ_ATTEMPT_ALREADY_SUBMITTED', 'Submitted quiz attempts cannot be changed');
}

export function quizAccessDenied() {
  return new HttpError(404, 'QUIZ_NOT_FOUND', 'Quiz not found');
}

export function quizValidationFailed(details: readonly string[]) {
  return new HttpError(422, 'QUIZ_VALIDATION_FAILED', 'Quiz configuration is invalid', details);
}
