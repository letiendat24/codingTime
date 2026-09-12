import { HttpError } from '../../shared/http-error';

export function courseNotFound() {
  return new HttpError(404, 'COURSE_NOT_FOUND', 'Course not found');
}

export function courseNotOwned() {
  return new HttpError(404, 'COURSE_NOT_FOUND', 'Course not found');
}

export function courseNotPublished() {
  return new HttpError(409, 'COURSE_NOT_PUBLISHED', 'Course must be published before this action');
}

export function courseAlreadyArchived() {
  return new HttpError(409, 'COURSE_ALREADY_ARCHIVED', 'Course is already archived');
}

export function courseNotEditable() {
  return new HttpError(409, 'COURSE_NOT_EDITABLE', 'Only draft courses can be edited in this phase');
}

export function courseNotReadyForPublish(details: readonly string[]) {
  return new HttpError(
    422,
    'COURSE_NOT_READY_FOR_PUBLISH',
    'Course is missing required content',
    details,
  );
}

export function duplicateCourseSlug() {
  return new HttpError(409, 'COURSE_SLUG_ALREADY_EXISTS', 'Course slug is already used');
}

export function categoryNotFound() {
  return new HttpError(404, 'COURSE_CATEGORY_NOT_FOUND', 'Course category not found');
}

export function moduleNotFound() {
  return new HttpError(404, 'COURSE_MODULE_NOT_FOUND', 'Course module not found');
}

export function lessonNotFound() {
  return new HttpError(404, 'LESSON_NOT_FOUND', 'Lesson not found');
}

export function invalidOrdering() {
  return new HttpError(400, 'COURSE_INVALID_ORDERING', 'Ordering payload does not match existing items');
}
