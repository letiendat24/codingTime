import { describe, expect, it } from 'vitest';
import { formatUnreadCount, isInternalActionUrl, notificationListPath } from './notifications';

describe('notification helpers', () => {
  it('formats unread badge count with a 99+ cap', () => {
    expect(formatUnreadCount(0)).toBeNull();
    expect(formatUnreadCount(3)).toBe('3');
    expect(formatUnreadCount(120)).toBe('99+');
  });

  it('allows only internal action URLs', () => {
    expect(isInternalActionUrl('/courses/intro/learn')).toBe(true);
    expect(isInternalActionUrl('//evil.example/path')).toBe(false);
    expect(isInternalActionUrl('https://example.com')).toBe(false);
    expect(isInternalActionUrl(null)).toBe(false);
  });

  it('builds notification list query paths', () => {
    expect(notificationListPath({ limit: 5, unread: true, category: 'PRACTICE' })).toBe('/notifications?limit=5&unread=true&category=PRACTICE');
  });
});
