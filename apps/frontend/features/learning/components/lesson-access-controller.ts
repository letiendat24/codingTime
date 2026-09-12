export class LessonAccessController {
  private lastAccessedLessonId: string | null = null;
  private readonly inFlightLessonIds = new Set<string>();

  shouldStartAccess(lessonId: string) {
    return this.lastAccessedLessonId !== lessonId && !this.inFlightLessonIds.has(lessonId);
  }

  markStarted(lessonId: string) {
    this.lastAccessedLessonId = lessonId;
    this.inFlightLessonIds.add(lessonId);
  }

  markSettled(lessonId: string) {
    this.inFlightLessonIds.delete(lessonId);
  }
}
