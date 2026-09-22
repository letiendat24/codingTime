import { QuizQuestionType } from '@prisma/client';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import type { QuizQuestionInput } from './quiz.schemas';

export type QuizImportFormat = 'JSON' | 'XLSX';
export type QuizImportMode = 'APPEND' | 'REPLACE';

export interface QuizImportRowError {
  readonly row: number;
  readonly message: string;
}

export interface QuizImportSummary {
  readonly totalRows: number;
  readonly validRows: number;
  readonly invalidRows: number;
}

export interface ParsedQuizImport {
  readonly questions: readonly QuizQuestionInput[];
  readonly errors: readonly QuizImportRowError[];
  readonly summary: QuizImportSummary;
}

export interface QuizExportQuestion {
  readonly type: QuizQuestionType;
  readonly prompt: string;
  readonly explanation: string | null;
  readonly points: number;
  readonly position: number;
  readonly options: readonly {
    readonly text: string;
    readonly isCorrect: boolean;
    readonly position: number;
  }[];
}

export const QUIZ_IMPORT_MAX_BYTES = 1_000_000;
export const QUIZ_IMPORT_MAX_ROWS = 500;
export const QUIZ_IMPORT_XLSX_SHEET = 'Questions';
export const QUIZ_IMPORT_OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;
export const QUIZ_IMPORT_COLUMNS = [
  'order',
  'type',
  'question',
  ...QUIZ_IMPORT_OPTION_KEYS.map((key) => `option_${key.toLowerCase()}`),
  'correct_answer',
  'explanation',
  'points',
] as const;

const jsonOptionSchema = z.object({
  key: z.string().trim().min(1).max(4),
  text: z.string().trim().min(1).max(2_000),
});

const jsonQuestionSchema = z.object({
  order: z.number().int().positive().optional(),
  type: z.nativeEnum(QuizQuestionType),
  question: z.string().trim().min(1).max(10_000),
  options: z.array(jsonOptionSchema).min(2).max(12),
  correctAnswer: z.string().trim().optional(),
  correctAnswers: z.array(z.string().trim()).optional(),
  explanation: z.string().trim().max(20_000).nullable().optional(),
  points: z.number().positive().max(1_000).default(1),
});

const jsonImportSchema = z.object({
  version: z.literal(1),
  questions: z.array(jsonQuestionSchema).min(1).max(QUIZ_IMPORT_MAX_ROWS),
});

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function decodeBase64Content(contentBase64: string): Buffer {
  const buffer = Buffer.from(contentBase64, 'base64');
  if (buffer.length === 0 || buffer.length > QUIZ_IMPORT_MAX_BYTES) {
    throw new Error(`Import file must be between 1 byte and ${QUIZ_IMPORT_MAX_BYTES} bytes`);
  }
  return buffer;
}

function answerKeysFromCell(value: string): readonly string[] {
  return value
    .split('|')
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
}

function questionFromParts(input: {
  readonly row: number;
  readonly type: string;
  readonly question: string;
  readonly optionEntries: readonly { readonly key: string; readonly text: string }[];
  readonly correctKeys: readonly string[];
  readonly explanation: string;
  readonly points: number;
  readonly position: number;
}): { readonly question?: QuizQuestionInput; readonly errors: readonly QuizImportRowError[] } {
  const errors: QuizImportRowError[] = [];
  const type = input.type.toUpperCase();

  if (type !== QuizQuestionType.SINGLE_CHOICE && type !== QuizQuestionType.MULTIPLE_CHOICE) {
    errors.push({ row: input.row, message: `Unsupported question type "${input.type}".` });
  }

  if (!input.question) {
    errors.push({ row: input.row, message: 'Question text is empty.' });
  }

  if (input.optionEntries.length < 2) {
    errors.push({ row: input.row, message: 'At least two options are required.' });
  }

  if (!Number.isFinite(input.points) || input.points <= 0 || input.points > 1_000) {
    errors.push({ row: input.row, message: 'Points must be a number greater than 0 and at most 1000.' });
  }

  const optionKeys = new Set(input.optionEntries.map((option) => option.key));
  for (const correctKey of input.correctKeys) {
    if (!optionKeys.has(correctKey)) {
      errors.push({ row: input.row, message: `Correct answer "${correctKey}" does not exist.` });
    }
  }

  if (type === QuizQuestionType.SINGLE_CHOICE && input.correctKeys.length !== 1) {
    errors.push({ row: input.row, message: 'Single choice questions must have exactly one correct answer.' });
  }

  if (type === QuizQuestionType.MULTIPLE_CHOICE) {
    if (input.correctKeys.length < 1) {
      errors.push({ row: input.row, message: 'Multiple choice questions must have at least one correct answer.' });
    }

    if (input.correctKeys.length >= input.optionEntries.length && input.optionEntries.length > 0) {
      errors.push({ row: input.row, message: 'Multiple choice questions must include at least one incorrect option.' });
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  const correct = new Set(input.correctKeys);
  return {
    errors,
    question: {
      type: type as QuizQuestionType,
      prompt: input.question,
      explanation: input.explanation || null,
      points: input.points,
      position: input.position,
      options: input.optionEntries.map((option, index) => ({
        text: option.text,
        isCorrect: correct.has(option.key),
        position: index + 1,
      })),
    },
  };
}

function buildSummary(totalRows: number, validRows: number): QuizImportSummary {
  return {
    totalRows,
    validRows,
    invalidRows: totalRows - validRows,
  };
}

export function parseQuizJsonImport(contentBase64: string): ParsedQuizImport {
  const buffer = decodeBase64Content(contentBase64);
  const raw = JSON.parse(buffer.toString('utf8')) as unknown;
  const parsed = jsonImportSchema.safeParse(raw);

  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      row: 0,
      message: `${issue.path.join('.') || 'payload'}: ${issue.message}`,
    }));
    return { questions: [], errors, summary: buildSummary(0, 0) };
  }

  const sorted = [...parsed.data.questions].sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER));
  const questions: QuizQuestionInput[] = [];
  const errors: QuizImportRowError[] = [];

  for (const [index, item] of sorted.entries()) {
    const row = item.order ?? index + 1;
    const correctKeys = item.correctAnswers ?? (item.correctAnswer ? [item.correctAnswer] : []);
    const result = questionFromParts({
      row,
      type: item.type,
      question: item.question,
      optionEntries: item.options.map((option) => ({ key: option.key.trim().toUpperCase(), text: option.text })),
      correctKeys: correctKeys.map((key) => key.trim().toUpperCase()).filter(Boolean),
      explanation: item.explanation ?? '',
      points: item.points,
      position: index + 1,
    });
    errors.push(...result.errors);
    if (result.question) {
      questions.push(result.question);
    }
  }

  return { questions, errors, summary: buildSummary(sorted.length, questions.length) };
}

export function parseQuizXlsxImport(contentBase64: string): ParsedQuizImport {
  const buffer = decodeBase64Content(contentBase64);
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = workbook.Sheets[QUIZ_IMPORT_XLSX_SHEET] ?? workbook.Sheets[workbook.SheetNames[0] ?? ''];

  if (!sheet) {
    throw new Error(`Workbook must contain a ${QUIZ_IMPORT_XLSX_SHEET} sheet`);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  if (rows.length > QUIZ_IMPORT_MAX_ROWS) {
    throw new Error(`Import supports at most ${QUIZ_IMPORT_MAX_ROWS} question rows`);
  }

  const firstRow = rows[0] ?? {};
  const headers = new Set(Object.keys(firstRow).map((key) => key.trim().toLowerCase()));
  for (const required of ['type', 'question', 'correct_answer', 'points']) {
    if (!headers.has(required)) {
      throw new Error(`Missing required XLSX column "${required}"`);
    }
  }

  const questions: QuizQuestionInput[] = [];
  const errors: QuizImportRowError[] = [];
  const normalizedRows = rows.filter((row) => Object.values(row).some((value) => normalizeCell(value)));

  for (const [index, row] of normalizedRows.entries()) {
    const rowNumber = index + 2;
    const optionEntries = QUIZ_IMPORT_OPTION_KEYS
      .map((key) => ({ key, text: normalizeCell(row[`option_${key.toLowerCase()}`]) }))
      .filter((option) => option.text);
    const orderCell = normalizeCell(row.order);
    const explicitOrder = orderCell ? Number(orderCell) : index + 1;
    const points = Number(normalizeCell(row.points) || '1');
    const result = questionFromParts({
      row: rowNumber,
      type: normalizeCell(row.type),
      question: normalizeCell(row.question),
      optionEntries,
      correctKeys: answerKeysFromCell(normalizeCell(row.correct_answer)),
      explanation: normalizeCell(row.explanation),
      points,
      position: Number.isInteger(explicitOrder) && explicitOrder > 0 ? explicitOrder : index + 1,
    });
    errors.push(...result.errors);
    if (result.question) {
      questions.push(result.question);
    }
  }

  const orderedQuestions = [...questions].sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
    .map((question, index) => ({ ...question, position: index + 1 }));

  return { questions: orderedQuestions, errors, summary: buildSummary(normalizedRows.length, orderedQuestions.length) };
}

export function parseQuizImport(format: QuizImportFormat, contentBase64: string): ParsedQuizImport {
  return format === 'JSON' ? parseQuizJsonImport(contentBase64) : parseQuizXlsxImport(contentBase64);
}

function optionKeyForIndex(index: number) {
  return QUIZ_IMPORT_OPTION_KEYS[index] ?? String(index + 1);
}

export function buildQuizJsonExport(questions: readonly QuizExportQuestion[]): Buffer {
  const payload = {
    version: 1,
    questions: questions.map((question, questionIndex) => ({
      order: question.position || questionIndex + 1,
      type: question.type,
      question: question.prompt,
      options: question.options.map((option, optionIndex) => ({
        key: optionKeyForIndex(optionIndex),
        text: option.text,
      })),
      correctAnswers: question.options
        .map((option, optionIndex) => option.isCorrect ? optionKeyForIndex(optionIndex) : null)
        .filter((key): key is string => key !== null),
      explanation: question.explanation,
      points: question.points,
    })),
  };

  return Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
}

export function buildQuizXlsxExport(questions: readonly QuizExportQuestion[]): Buffer {
  const rows = questions.map((question, questionIndex) => {
    const row: Record<string, string | number> = {
      order: question.position || questionIndex + 1,
      type: question.type,
      question: question.prompt,
      correct_answer: question.options
        .map((option, optionIndex) => option.isCorrect ? optionKeyForIndex(optionIndex) : null)
        .filter((key): key is string => key !== null)
        .join('|'),
      explanation: question.explanation ?? '',
      points: question.points,
    };

    for (const [index, key] of QUIZ_IMPORT_OPTION_KEYS.entries()) {
      row[`option_${key.toLowerCase()}`] = question.options[index]?.text ?? '';
    }

    return row;
  });
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...QUIZ_IMPORT_COLUMNS] });
  XLSX.utils.book_append_sheet(workbook, sheet, QUIZ_IMPORT_XLSX_SHEET);
  const instructions = XLSX.utils.aoa_to_sheet([
    ['CodeSync Quiz Import Format'],
    ['Use the Questions sheet. Required columns: type, question, at least two option columns, correct_answer, points.'],
    ['Supported type values: SINGLE_CHOICE, MULTIPLE_CHOICE.'],
    ['Use A for option_a, B for option_b, etc. Multiple correct answers use A|C.'],
    ['Maximum options per question: 12. Maximum rows per import: 500.'],
  ]);
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}
