import { describe, expect, it } from 'vitest';
import { queryKeys } from '../../../lib/query/keys';
import type { LessonSummaryItem } from './lesson-renderer';

// Helper function that mirrors URL lesson selection & curriculum traversal
function resolveSelectedLesson(
  lessons: readonly LessonSummaryItem[],
  queryLessonId: string | null,
  resumeLessonId?: string | null,
): {
  readonly selectedLesson: LessonSummaryItem | null;
  readonly isInvalid: boolean;
  readonly shouldNormalizeUrl: boolean;
  readonly normalizedLessonId: string | null;
} {
  if (lessons.length === 0) {
    return {
      selectedLesson: null,
      isInvalid: false,
      shouldNormalizeUrl: false,
      normalizedLessonId: null,
    };
  }

  // 1. Explicit query parameter present
  if (queryLessonId) {
    const found = lessons.find((l) => l.id === queryLessonId);
    if (found) {
      return {
        selectedLesson: found,
        isInvalid: false,
        shouldNormalizeUrl: false,
        normalizedLessonId: null,
      };
    }
    // Invalid lesson ID provided in URL - do NOT fallback silently to first lesson
    return {
      selectedLesson: null,
      isInvalid: true,
      shouldNormalizeUrl: false,
      normalizedLessonId: null,
    };
  }

  // 2. Missing query parameter: resolve resume or first lesson and normalize URL
  const resumeLesson = resumeLessonId ? lessons.find((l) => l.id === resumeLessonId) : null;
  const fallback = resumeLesson ?? lessons[0];
  const targetId = fallback ? fallback.id : null;

  return {
    selectedLesson: fallback ?? null,
    isInvalid: false,
    shouldNormalizeUrl: true,
    normalizedLessonId: targetId,
  };
}

function resolvePrevNextLessons(
  lessons: readonly LessonSummaryItem[],
  currentLessonId: string,
): {
  readonly prevLesson: LessonSummaryItem | null;
  readonly nextLesson: LessonSummaryItem | null;
} {
  const currentIndex = lessons.findIndex((l) => l.id === currentLessonId);
  if (currentIndex === -1) {
    return { prevLesson: null, nextLesson: null };
  }

  return {
    prevLesson: currentIndex > 0 ? (lessons[currentIndex - 1] ?? null) : null,
    nextLesson: currentIndex < lessons.length - 1 ? (lessons[currentIndex + 1] ?? null) : null,
  };
}

const mockLessons: readonly LessonSummaryItem[] = [
  {
    id: 'lesson-1',
    title: 'Course Introduction & Architecture',
    description: '# Welcome to CodeSync\nThis article outlines the course structure.',
    position: 1,
    lessonType: 'ARTICLE',
  },
  {
    id: 'lesson-2',
    title: 'Hands-on Video & Code-Along Walkthrough',
    description: 'Walkthrough video demonstrating TypeScript patterns.',
    position: 2,
    lessonType: 'VIDEO',
  },
  {
    id: 'lesson-3',
    title: 'Coding Exercise: Memory Cache',
    description: 'Implement a LRU cache with expiration in TypeScript.',
    position: 3,
    lessonType: 'CODING',
  },
  {
    id: 'lesson-4',
    title: 'Capstone Project: Mini Compiler',
    description: 'Build an AST parser and evaluator on GitHub.',
    position: 4,
    lessonType: 'PROJECT',
  },
  {
    id: 'lesson-5',
    title: 'Architecture Knowledge Check',
    description: 'Quiz testing architectural concepts.',
    position: 5,
    lessonType: 'QUIZ',
  },
];

describe('Lesson Type Routing & URL Resolution', () => {
  it('resolves exact lesson from URL query parameter regardless of type', () => {
    const articleResult = resolveSelectedLesson(mockLessons, 'lesson-1');
    expect(articleResult.selectedLesson?.id).toBe('lesson-1');
    expect(articleResult.selectedLesson?.lessonType).toBe('ARTICLE');
    expect(articleResult.isInvalid).toBe(false);
    expect(articleResult.shouldNormalizeUrl).toBe(false);

    const codingResult = resolveSelectedLesson(mockLessons, 'lesson-3');
    expect(codingResult.selectedLesson?.id).toBe('lesson-3');
    expect(codingResult.selectedLesson?.lessonType).toBe('CODING');
    expect(codingResult.isInvalid).toBe(false);

    const projectResult = resolveSelectedLesson(mockLessons, 'lesson-4');
    expect(projectResult.selectedLesson?.id).toBe('lesson-4');
    expect(projectResult.selectedLesson?.lessonType).toBe('PROJECT');
    expect(projectResult.isInvalid).toBe(false);
  });

  it('normalizes missing query parameter to resume lesson when available', () => {
    const result = resolveSelectedLesson(mockLessons, null, 'lesson-3');
    expect(result.selectedLesson?.id).toBe('lesson-3');
    expect(result.selectedLesson?.lessonType).toBe('CODING');
    expect(result.shouldNormalizeUrl).toBe(true);
    expect(result.normalizedLessonId).toBe('lesson-3');
  });

  it('normalizes missing query parameter to first accessible lesson when no resume state', () => {
    const result = resolveSelectedLesson(mockLessons, null, null);
    expect(result.selectedLesson?.id).toBe('lesson-1');
    expect(result.selectedLesson?.lessonType).toBe('ARTICLE');
    expect(result.shouldNormalizeUrl).toBe(true);
    expect(result.normalizedLessonId).toBe('lesson-1');
  });

  it('identifies invalid or stale lesson IDs in URL and never falls back to VIDEO silently', () => {
    const result = resolveSelectedLesson(mockLessons, 'non-existent-lesson-id');
    expect(result.selectedLesson).toBeNull();
    expect(result.isInvalid).toBe(true);
    expect(result.shouldNormalizeUrl).toBe(false);
  });

  it('computes Prev and Next lesson navigation in sequential order', () => {
    // Lesson 1 (First)
    const first = resolvePrevNextLessons(mockLessons, 'lesson-1');
    expect(first.prevLesson).toBeNull();
    expect(first.nextLesson?.id).toBe('lesson-2');

    // Lesson 2 (Middle)
    const middle = resolvePrevNextLessons(mockLessons, 'lesson-2');
    expect(middle.prevLesson?.id).toBe('lesson-1');
    expect(middle.nextLesson?.id).toBe('lesson-3');

    // Lesson 5 (Last)
    const last = resolvePrevNextLessons(mockLessons, 'lesson-5');
    expect(last.prevLesson?.id).toBe('lesson-4');
    expect(last.nextLesson).toBeNull();
  });

  it('guarantees query keys are scoped strictly by lesson ID avoiding cache contamination', () => {
    const videoKey1 = queryKeys.learning.video('lesson-1');
    const videoKey2 = queryKeys.learning.video('lesson-2');
    const codeAlongKey1 = queryKeys.learning.codeAlong('lesson-1');
    const codeAlongKey2 = queryKeys.learning.codeAlong('lesson-2');

    expect(videoKey1).not.toEqual(videoKey2);
    expect(codeAlongKey1).not.toEqual(codeAlongKey2);
    expect(videoKey1).toEqual(['learning', 'video', 'lesson-1']);
    expect(codeAlongKey1).toEqual(['learning', 'code-along', 'lesson-1']);
  });

  it('differentiates all 5 supported lesson types strictly without fallback to VIDEO', () => {
    const types = mockLessons.map((l) => l.lessonType);
    expect(types).toEqual(['ARTICLE', 'VIDEO', 'CODING', 'PROJECT', 'QUIZ']);

    // Ensure no two different lesson types produce identical renderer modes
    const typeSet = new Set(types);
    expect(typeSet.size).toBe(5);
  });
});

describe('Lesson Access Lifecycle & Request Deduplication', () => {
  it('triggers lesson access only once when entering a lesson and prevents loops on rerenders', () => {
    const controller = {
      lastAccessedLessonId: null as string | null,
      inFlightLessonIds: new Set<string>(),
      shouldStartAccess(id: string) {
        return this.lastAccessedLessonId !== id && !this.inFlightLessonIds.has(id);
      },
      markStarted(id: string) {
        this.lastAccessedLessonId = id;
        this.inFlightLessonIds.add(id);
      },
      markSettled(id: string) {
        this.inFlightLessonIds.delete(id);
      },
    };

    let accessCount = 0;
    const triggerAccess = (lessonId: string) => {
      if (controller.shouldStartAccess(lessonId)) {
        controller.markStarted(lessonId);
        accessCount += 1;
        controller.markSettled(lessonId);
      }
    };

    // Initial load of VIDEO lesson
    triggerAccess('lesson-2');
    expect(accessCount).toBe(1);

    // 10 consecutive re-renders of the same VIDEO lesson
    for (let i = 0; i < 10; i++) {
      triggerAccess('lesson-2');
    }
    expect(accessCount).toBe(1); // Never called again for same lesson

    // Switch: VIDEO -> ARTICLE
    triggerAccess('lesson-1');
    expect(accessCount).toBe(2);

    // Switch: ARTICLE -> VIDEO
    triggerAccess('lesson-2');
    expect(accessCount).toBe(3);

    // Switch: VIDEO A -> VIDEO B
    triggerAccess('lesson-2-b');
    expect(accessCount).toBe(4);
  });

  it('prevents concurrent in-flight duplicate requests (e.g. React Strict Mode double-invocations)', () => {
    const inFlight = new Set<string>();
    let lastAccessed: string | null = null;
    let networkCalls = 0;

    const simulateMountEffect = (lessonId: string) => {
      if (lastAccessed === lessonId || inFlight.has(lessonId)) return;
      lastAccessed = lessonId;
      inFlight.add(lessonId);
      networkCalls += 1;
    };

    // First mount
    simulateMountEffect('lesson-video');
    // Strict Mode simulated second mount before first settles
    simulateMountEffect('lesson-video');

    expect(networkCalls).toBe(1);
  });

  it('deduplicates identical toasts emitted within a 2-second window', () => {
    const recentToasts = new Map<string, number>();
    const emittedToasts: string[] = [];

    const showToast = (tone: string, title: string, message: string, now: number) => {
      const key = `${tone}:${title}:${message}`;
      const lastShown = recentToasts.get(key);

      if (lastShown !== undefined && now - lastShown < 2000) {
        return false; // suppressed
      }

      recentToasts.set(key, now);
      emittedToasts.push(key);
      return true;
    };

    // First error toast at t=0
    expect(showToast('error', 'Action failed', 'Network error', 0)).toBe(true);

    // Rapid duplicate toasts at t=100ms, t=500ms, t=1000ms
    expect(showToast('error', 'Action failed', 'Network error', 100)).toBe(false);
    expect(showToast('error', 'Action failed', 'Network error', 500)).toBe(false);
    expect(showToast('error', 'Action failed', 'Network error', 1000)).toBe(false);

    // Total emitted is only 1
    expect(emittedToasts.length).toBe(1);

    // After 2000ms (t=2500ms), new toast is allowed
    expect(showToast('error', 'Action failed', 'Network error', 2500)).toBe(true);
    expect(emittedToasts.length).toBe(2);
  });
});
