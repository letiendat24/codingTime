import { describe, expect, it } from 'vitest';
import { LessonAccessController } from './lesson-access-controller';

describe('LessonAccessController', () => {
  it('allows one access call for the current lesson transition', () => {
    const controller = new LessonAccessController();

    expect(controller.shouldStartAccess('video-a')).toBe(true);
    controller.markStarted('video-a');
    expect(controller.shouldStartAccess('video-a')).toBe(false);
    controller.markSettled('video-a');
    expect(controller.shouldStartAccess('video-a')).toBe(false);
  });

  it('allows a new access call when switching lessons', () => {
    const controller = new LessonAccessController();

    controller.markStarted('article-a');
    controller.markSettled('article-a');

    expect(controller.shouldStartAccess('video-a')).toBe(true);
    controller.markStarted('video-a');
    controller.markSettled('video-a');

    expect(controller.shouldStartAccess('video-b')).toBe(true);
  });

  it('does not start duplicate access while the same lesson is in flight', () => {
    const controller = new LessonAccessController();

    controller.markStarted('video-a');

    expect(controller.shouldStartAccess('video-a')).toBe(false);
    expect(controller.shouldStartAccess('video-b')).toBe(true);
  });
});
