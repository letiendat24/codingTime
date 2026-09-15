CREATE TYPE "QuizQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE');

CREATE TYPE "QuizAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

CREATE TABLE "quizzes" (
  "id" UUID NOT NULL,
  "lessonId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "instructions" TEXT,
  "passScore" DECIMAL(5,2) NOT NULL DEFAULT 70,
  "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
  "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
  "showResultImmediately" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quiz_questions" (
  "id" UUID NOT NULL,
  "quizId" UUID NOT NULL,
  "type" "QuizQuestionType" NOT NULL,
  "prompt" TEXT NOT NULL,
  "explanation" TEXT,
  "points" DECIMAL(8,2) NOT NULL DEFAULT 1,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quiz_options" (
  "id" UUID NOT NULL,
  "questionId" UUID NOT NULL,
  "text" TEXT NOT NULL,
  "isCorrect" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "quiz_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quiz_attempts" (
  "id" UUID NOT NULL,
  "quizId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" "QuizAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  "score" DECIMAL(8,2),
  "maxScore" DECIMAL(8,2),
  "percentage" DECIMAL(5,2),
  "passed" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quiz_attempt_answers" (
  "id" UUID NOT NULL,
  "attemptId" UUID NOT NULL,
  "questionId" UUID NOT NULL,
  "isCorrect" BOOLEAN,
  "scoreEarned" DECIMAL(8,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "quiz_attempt_answers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quiz_attempt_answer_options" (
  "answerId" UUID NOT NULL,
  "optionId" UUID NOT NULL,

  CONSTRAINT "quiz_attempt_answer_options_pkey" PRIMARY KEY ("answerId","optionId")
);

CREATE UNIQUE INDEX "quizzes_lessonId_key" ON "quizzes"("lessonId");
CREATE INDEX "quizzes_lessonId_idx" ON "quizzes"("lessonId");

CREATE UNIQUE INDEX "quiz_questions_quizId_position_key" ON "quiz_questions"("quizId", "position");
CREATE INDEX "quiz_questions_quizId_idx" ON "quiz_questions"("quizId");

CREATE UNIQUE INDEX "quiz_options_questionId_position_key" ON "quiz_options"("questionId", "position");
CREATE INDEX "quiz_options_questionId_idx" ON "quiz_options"("questionId");

CREATE INDEX "quiz_attempts_quizId_userId_startedAt_idx" ON "quiz_attempts"("quizId", "userId", "startedAt");
CREATE INDEX "quiz_attempts_userId_status_idx" ON "quiz_attempts"("userId", "status");

CREATE UNIQUE INDEX "quiz_attempt_answers_attemptId_questionId_key" ON "quiz_attempt_answers"("attemptId", "questionId");
CREATE INDEX "quiz_attempt_answers_questionId_idx" ON "quiz_attempt_answers"("questionId");

CREATE INDEX "quiz_attempt_answer_options_optionId_idx" ON "quiz_attempt_answer_options"("optionId");

ALTER TABLE "quizzes"
  ADD CONSTRAINT "quizzes_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quiz_questions"
  ADD CONSTRAINT "quiz_questions_quizId_fkey"
  FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quiz_options"
  ADD CONSTRAINT "quiz_options_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_quizId_fkey"
  FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quiz_attempt_answers"
  ADD CONSTRAINT "quiz_attempt_answers_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quiz_attempt_answers"
  ADD CONSTRAINT "quiz_attempt_answers_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quiz_attempt_answer_options"
  ADD CONSTRAINT "quiz_attempt_answer_options_answerId_fkey"
  FOREIGN KEY ("answerId") REFERENCES "quiz_attempt_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quiz_attempt_answer_options"
  ADD CONSTRAINT "quiz_attempt_answer_options_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "quiz_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
