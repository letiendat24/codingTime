import { describe, expect, it } from 'vitest';
import { LessonAccessController } from './lesson-access-controller';

describe('LessonAccessController', () => {
  it('allows access only on genuine lesson transitions and blocks re-requesting the current lesson', () => {
    const controller = new LessonAccessController();

    // 1. Enter lesson A
    expect(controller.shouldStartAccess('lesson-A')).toBe(true);
    controller.markStarted('lesson-A');
    expect(controller.shouldStartAccess('lesson-A')).toBe(false);

    controller.markSettled('lesson-A');
    // Even after settling, staying on lesson A must not trigger access again
    expect(controller.shouldStartAccess('lesson-A')).toBe(false);

    // 2. Transition from lesson A -> lesson B
    expect(controller.shouldStartAccess('lesson-B')).toBe(true);
    controller.markStarted('lesson-B');
    expect(controller.shouldStartAccess('lesson-B')).toBe(false);
    controller.markSettled('lesson-B');

    // 3. Transition back from lesson B -> lesson A
    expect(controller.shouldStartAccess('lesson-A')).toBe(true);
    controller.markStarted('lesson-A');
    controller.markSettled('lesson-A');
  });

  it('blocks concurrent in-flight access calls for the same lesson', () => {
    const controller = new LessonAccessController();

    expect(controller.shouldStartAccess('lesson-C')).toBe(true);
    controller.markStarted('lesson-C');

    // Concurrent call while in flight
    expect(controller.shouldStartAccess('lesson-C')).toBe(false);

    controller.markSettled('lesson-C');
    expect(controller.shouldStartAccess('lesson-C')).toBe(false);
  });
});
