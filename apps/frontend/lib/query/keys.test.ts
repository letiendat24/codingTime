import { describe, expect, it } from 'vitest';
import { queryKeys } from './keys';

describe('queryKeys', () => {
  it('keeps stable keys for core learning surfaces', () => {
    expect(queryKeys.learning.video('lesson-1')).toEqual(['learning', 'video', 'lesson-1']);
    expect(queryKeys.workspace.revisions('workspace-1')).toEqual(['workspace', 'workspace-1', 'revisions']);
  });

  it('keeps notification and practice filters inside the key', () => {
    expect(queryKeys.notifications.list({ unread: true })).toEqual(['notifications', 'list', { unread: true }]);
    expect(queryKeys.practice.list({ page: 1 })).toEqual(['practice', 'list', { page: 1 }]);
  });
});
