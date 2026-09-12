import { HttpError } from '../../shared/http-error';

export function enrollmentAlreadyExists() {
  return new HttpError(409, 'ENROLLMENT_ALREADY_EXISTS', 'Enrollment already exists');
}

export function enrollmentNotAllowed(message = 'Enrollment is not allowed for this course') {
  return new HttpError(409, 'ENROLLMENT_NOT_ALLOWED', message);
}
