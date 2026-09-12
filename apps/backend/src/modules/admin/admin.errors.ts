import { HttpError } from '../../shared/http-error';

export function adminTargetNotFound(message = 'Admin target not found') {
  return new HttpError(404, 'ADMIN_TARGET_NOT_FOUND', message);
}

export function adminSelfStatusChangeDenied() {
  return new HttpError(400, 'ADMIN_SELF_STATUS_CHANGE_DENIED', 'Admin cannot change their own account status');
}

export function adminSelfRoleChangeDenied() {
  return new HttpError(400, 'ADMIN_SELF_ROLE_CHANGE_DENIED', 'Admin cannot change their own roles');
}

export function adminLastActiveAdminDenied() {
  return new HttpError(400, 'ADMIN_LAST_ACTIVE_ADMIN_DENIED', 'Cannot remove or disable the last active admin');
}

export function adminInvalidStatusTransition() {
  return new HttpError(400, 'ADMIN_INVALID_STATUS_TRANSITION', 'Invalid user status transition');
}

export function adminCourseArchiveDenied() {
  return new HttpError(400, 'ADMIN_COURSE_ARCHIVE_DENIED', 'Course cannot be archived from its current status');
}
