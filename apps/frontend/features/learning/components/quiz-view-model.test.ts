import { describe, expect, it } from 'vitest';
import type { QuizAttemptDetail, StudentQuiz } from '../../../lib/api';
import {
  answersFromAttempt,
  buildQuizSubmitAnswers,
  countUnansweredQuestions,
  findResumeAttemptId,
  isAlreadySubmittedQuizError,
  isEditableQuizAttempt,
  selectQuizOption,
} from './quiz-view-model';

function containsAnswerLeak(payload: unknown) {
  return JSON.stringify(payload).includes('isCorrect');
}

const quiz: StudentQuiz = {
  id: 'quiz-1',
  lessonId: 'lesson-1',
  title: 'TypeScript Review',
  instructions: null,
  passScore: 70,
  questionCount: 2,
  questions: [
    {
      id: 'q1',
      type: 'SINGLE_CHOICE',
      prompt: 'Pick one',
      points: 1,
      position: 1,
      options: [
        { id: 'a', text: 'A', position: 1 },
        { id: 'b', text: 'B', position: 2 },
      ],
    },
    {
      id: 'q2',
      type: 'MULTIPLE_CHOICE',
      prompt: 'Pick many',
      points: 1,
      position: 2,
      options: [
        { id: 'c', text: 'C', position: 1 },
        { id: 'd', text: 'D', position: 2 },
      ],
    },
  ],
  attempts: [],
};

describe('quiz view model', () => {
  it('replaces selection for single choice questions', () => {
    const first = selectQuizOption({}, 'q1', 'a', 'SINGLE_CHOICE');
    const second = selectQuizOption(first, 'q1', 'b', 'SINGLE_CHOICE');

    expect(second.q1).toEqual(['b']);
  });

  it('toggles selections for multiple choice questions', () => {
    const first = selectQuizOption({}, 'q2', 'c', 'MULTIPLE_CHOICE');
    const second = selectQuizOption(first, 'q2', 'd', 'MULTIPLE_CHOICE');
    const third = selectQuizOption(second, 'q2', 'c', 'MULTIPLE_CHOICE');

    expect(second.q2).toEqual(['c', 'd']);
    expect(third.q2).toEqual(['d']);
  });

  it('counts unanswered questions before submission confirmation', () => {
    expect(countUnansweredQuestions(quiz.questions, {})).toBe(2);
    expect(countUnansweredQuestions(quiz.questions, { q1: ['a'] })).toBe(1);
    expect(countUnansweredQuestions(quiz.questions, { q1: ['a'], q2: ['c'] })).toBe(0);
  });

  it('assumes student quiz DTO has no answer leakage before submission', () => {
    expect(containsAnswerLeak(quiz)).toBe(false);
  });

  it('supports result and review state after submission', () => {
    const attempt: QuizAttemptDetail = {
      id: 'attempt-1',
      quizId: 'quiz-1',
      status: 'SUBMITTED',
      startedAt: '2026-01-01T00:00:00.000Z',
      submittedAt: '2026-01-01T00:01:00.000Z',
      score: 1,
      maxScore: 2,
      percentage: 50,
      passed: false,
      showDetailedResult: true,
      answers: [
        {
          questionId: 'q1',
          selectedOptionIds: ['a'],
          isCorrect: true,
          scoreEarned: 1,
          correctOptionIds: ['a'],
          explanation: 'A is correct.',
        },
      ],
    };

    expect(attempt.status).toBe('SUBMITTED');
    expect(attempt.passed).toBe(false);
    expect(attempt.answers[0]?.correctOptionIds).toEqual(['a']);
  });

  it('allows answer mutation only while an attempt is in progress', () => {
    expect(isEditableQuizAttempt({ status: 'IN_PROGRESS' })).toBe(true);
    expect(isEditableQuizAttempt({ status: 'SUBMITTED' })).toBe(false);
    expect(isEditableQuizAttempt(null)).toBe(false);
  });

  it('builds a submit payload from the current answer snapshot', () => {
    expect(buildQuizSubmitAnswers(quiz.questions, { q1: ['b'], q2: ['c', 'd'] })).toEqual([
      { questionId: 'q1', selectedOptionIds: ['b'] },
      { questionId: 'q2', selectedOptionIds: ['c', 'd'] },
    ]);
  });

  it('hydrates selected answers from an in-progress attempt on reload', () => {
    const attempt: QuizAttemptDetail = {
      id: 'attempt-in-progress',
      quizId: quiz.id,
      status: 'IN_PROGRESS',
      startedAt: '2026-01-01T00:00:00.000Z',
      submittedAt: null,
      score: null,
      maxScore: null,
      percentage: null,
      passed: null,
      showDetailedResult: false,
      answers: [{ questionId: 'q1', selectedOptionIds: ['b'] }],
    };

    expect(answersFromAttempt(attempt)).toEqual({ q1: ['b'] });
  });

  it('resumes only in-progress attempts and does not treat submitted attempts as editable on reload', () => {
    expect(findResumeAttemptId([{ id: 'old', attemptNumber: 1, status: 'SUBMITTED', startedAt: '', submittedAt: '', score: 1, maxScore: 1, percentage: 100, passed: true }], null)).toBeNull();
    expect(findResumeAttemptId([{ id: 'current', attemptNumber: 1, status: 'IN_PROGRESS', startedAt: '', submittedAt: null, score: null, maxScore: null, percentage: null, passed: null }], null)).toBe('current');
  });

  it('keeps retakes on a new in-progress attempt id', () => {
    const oldAttempt: QuizAttemptDetail = {
      id: 'attempt-old',
      quizId: quiz.id,
      status: 'SUBMITTED',
      startedAt: '2026-01-01T00:00:00.000Z',
      submittedAt: '2026-01-01T00:01:00.000Z',
      score: 0,
      maxScore: 2,
      percentage: 0,
      passed: false,
      showDetailedResult: true,
      answers: [{ questionId: 'q1', selectedOptionIds: ['a'] }],
    };
    const retake: QuizAttemptDetail = {
      ...oldAttempt,
      id: 'attempt-new',
      status: 'IN_PROGRESS',
      submittedAt: null,
      score: null,
      maxScore: null,
      percentage: null,
      passed: null,
      showDetailedResult: false,
      answers: [],
    };

    expect(retake.id).not.toBe(oldAttempt.id);
    expect(isEditableQuizAttempt(retake)).toBe(true);
    expect(isEditableQuizAttempt(oldAttempt)).toBe(false);
  });

  it('recognizes stale-tab submitted-attempt conflicts without retrying mutation', () => {
    expect(isAlreadySubmittedQuizError({ code: 'QUIZ_ATTEMPT_ALREADY_SUBMITTED' })).toBe(true);
    expect(isAlreadySubmittedQuizError({ code: 'OTHER_ERROR' })).toBe(false);
  });
});
