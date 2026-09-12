import type { NotificationCategory, NotificationType } from './api';

export const notificationCategories: readonly NotificationCategory[] = ['LEARNING', 'PRACTICE', 'PROJECT', 'COURSE', 'SYSTEM'];

export const notificationTypes: readonly NotificationType[] = [
  'JUDGE_COMPLETED',
  'PRACTICE_SOLVED',
  'PROJECT_SUBMITTED',
  'PROJECT_GRADED',
  'PROJECT_MANUAL_REVIEW_REQUIRED',
  'VIDEO_PROCESSING_COMPLETED',
  'VIDEO_PROCESSING_FAILED',
  'COURSE_PUBLISHED',
  'COURSE_UPDATED',
  'ADMIN_OPERATION_ALERT',
];

export function formatUnreadCount(count: number) {
  if (count <= 0) {
    return null;
  }

  return count > 99 ? '99+' : String(count);
}

export function isInternalActionUrl(actionUrl: string | null | undefined) {
  return Boolean(actionUrl && actionUrl.startsWith('/') && !actionUrl.startsWith('//'));
}

export function notificationListPath(input: {
  readonly page?: number;
  readonly limit?: number;
  readonly unread?: boolean;
  readonly category?: NotificationCategory | '';
  readonly type?: NotificationType | '';
}) {
  const params = new URLSearchParams();

  if (input.page) {
    params.set('page', String(input.page));
  }

  if (input.limit) {
    params.set('limit', String(input.limit));
  }

  if (input.unread !== undefined) {
    params.set('unread', String(input.unread));
  }

  if (input.category) {
    params.set('category', input.category);
  }

  if (input.type) {
    params.set('type', input.type);
  }

  const query = params.toString();
  return query ? `/notifications?${query}` : '/notifications';
}
