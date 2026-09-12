import { HttpError } from '../../shared/http-error';

export function learningNotEnrolled() {
  return new HttpError(403, 'LEARNING_NOT_ENROLLED', 'Student is not enrolled in this course');
}

export function learningLessonNotFound() {
  return new HttpError(404, 'LEARNING_LESSON_NOT_FOUND', 'Lesson not found');
}

export function learningLessonNotInCourse() {
  return new HttpError(409, 'LEARNING_LESSON_NOT_IN_COURSE', 'Lesson does not belong to the enrolled course');
}

export function learningAccessDenied() {
  return new HttpError(403, 'LEARNING_ACCESS_DENIED', 'Learning progress access denied');
}
