import { HttpError } from '../../shared/http-error';

export function notificationNotFound() {
  return new HttpError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
}

export function notificationActionInvalid() {
  return new HttpError(400, 'NOTIFICATION_ACTION_INVALID', 'Notification action URL must be an internal path');
}
