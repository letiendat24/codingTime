import type { QuizAttemptDetail, StudentQuiz } from '../../../lib/api';

export type QuizAnswers = Record<string, readonly string[]>;

export function selectQuizOption(
  current: QuizAnswers,
  questionId: string,
  optionId: string,
  type: StudentQuiz['questions'][number]['type'],
): QuizAnswers {
  const selected = current[questionId] ?? [];

  if (type === 'SINGLE_CHOICE') {
    return { ...current, [questionId]: [optionId] };
  }

  return {
    ...current,
    [questionId]: selected.includes(optionId)
      ? selected.filter((id) => id !== optionId)
      : [...selected, optionId],
  };
}

export function answersFromAttempt(attempt: QuizAttemptDetail | null | undefined): QuizAnswers {
  return Object.fromEntries((attempt?.answers ?? []).map((answer) => [answer.questionId, answer.selectedOptionIds]));
}

export function countUnansweredQuestions(
  questions: readonly StudentQuiz['questions'][number][],
  answers: QuizAnswers,
) {
  return questions.filter((question) => (answers[question.id] ?? []).length === 0).length;
}

export function isEditableQuizAttempt(attempt: Pick<QuizAttemptDetail, 'status'> | null | undefined) {
  return attempt?.status === 'IN_PROGRESS';
}

export function buildQuizSubmitAnswers(
  questions: readonly StudentQuiz['questions'][number][],
  answers: QuizAnswers,
) {
  return questions.map((question) => ({
    questionId: question.id,
    selectedOptionIds: answers[question.id] ?? [],
  }));
}

export function findResumeAttemptId(
  attempts: readonly StudentQuiz['attempts'][number][] | undefined,
  currentAttemptId: string | null,
) {
  if (currentAttemptId) {
    return currentAttemptId;
  }

  return attempts?.find((attempt) => attempt.status === 'IN_PROGRESS')?.id ?? null;
}

export function isAlreadySubmittedQuizError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'QUIZ_ATTEMPT_ALREADY_SUBMITTED'
  );
}
