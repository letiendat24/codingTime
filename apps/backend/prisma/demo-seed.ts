import {
  CheckpointProgressStatus,
  CourseDifficulty,
  CourseStatus,
  EnrollmentStatus,
  LearningActivityType,
  LessonProgressStatus,
  LessonType,
  NotificationCategory,
  NotificationType,
  PracticeDifficulty,
  PracticeProblemStatus,
  PracticeProgressStatus,
  Prisma,
  PrismaClient,
  ProjectAutoCheckType,
  ProjectCriterionType,
  RepositoryProvider,
  RoleName,
  ScoringMode,
  TestCaseVisibility,
  UserStatus,
  VideoAssetStatus,
  VideoCheckpointType,
} from '@prisma/client';
import argon2 from 'argon2';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

function loadNearestEnvFile() {
  let currentDirectory = process.cwd();

  while (true) {
    const candidate = join(currentDirectory, '.env');

    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return;
    }

    currentDirectory = parentDirectory;
  }
}

loadNearestEnvFile();

const prisma = new PrismaClient();
const demoPassword = 'CodeSync@123456';
const adminEmail = 'admin@codesync.local';
const flagshipSlug = 'codesync-full-feature-demo';

const courseTags = ['JavaScript', 'TypeScript', 'Node.js', 'API', 'GitHub', 'React', 'Next.js', 'Testing', 'Clean Code'];
const categories = ['Programming', 'Web Development', 'Backend Development', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Testing', 'Git', 'Software Engineering'];
const practiceTags = ['Array', 'String', 'Hash Map', 'Stack', 'Searching', 'Sorting', 'Object', 'TypeScript', 'JavaScript', 'Design'];

type LessonSpec = {
  readonly title: string;
  readonly type: LessonType;
  readonly description: string;
  readonly codeAlong?: boolean;
  readonly codingTask?: 'validateUsername' | 'normalizeEmail' | 'findUserById' | 'mapUserResponse';
  readonly projectConfig?: boolean;
};

type ModuleSpec = {
  readonly title: string;
  readonly description: string;
  readonly lessons: readonly LessonSpec[];
};

type CourseSpec = {
  readonly title: string;
  readonly slug: string;
  readonly shortDescription: string;
  readonly description: string;
  readonly difficulty: CourseDifficulty;
  readonly status: CourseStatus;
  readonly category: string;
  readonly tags: readonly string[];
  readonly modules: readonly ModuleSpec[];
};

type DemoUser = {
  readonly email: string;
  readonly displayName: string;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function article(title: string, bullets: readonly string[]) {
  return `# ${title}

CodeSync uses this lesson as realistic demo content for local development. The goal is to make the page feel like a real learning environment while keeping the data safe and deterministic.

## What you will learn

${bullets.map((item) => `- ${item}`).join('\n')}

## Walkthrough

Start by reading the problem statement, then inspect the starter files. When the lesson contains code, use **Run** for quick feedback and **Submit** when you want the judge to score your solution.

\`\`\`ts
type LearningStep = {
  title: string;
  completed: boolean;
};

export function nextStep(steps: LearningStep[]) {
  return steps.find((step) => !step.completed) ?? null;
}
\`\`\`

## Checklist

1. Read the objective.
2. Open the workspace if the lesson includes code.
3. Compare your implementation with the instructor timeline when available.
4. Save progress before moving to the next lesson.
`;
}

function codingDescription(name: string, rules: readonly string[]) {
  return `# ${name}

Implement the function described below. Public tests show the basic contract; hidden tests cover boundary cases.

## Rules

${rules.map((rule) => `- ${rule}`).join('\n')}

## Starter

\`\`\`js
module.exports = { ${name} };
\`\`\`
`;
}

function starterFiles(task: LessonSpec['codingTask']) {
  switch (task) {
    case 'validateUsername':
      return {
        files: [
          {
            path: 'index.js',
            content: `function validateUsername(username) {
  // TODO: return true when username is 3-20 chars and contains only letters, digits, or underscore.
  return false;
}

module.exports = { validateUsername };
`,
          },
        ],
      };
    case 'normalizeEmail':
      return {
        files: [
          {
            path: 'index.js',
            content: `function normalizeEmail(email) {
  // TODO: trim whitespace and lowercase the email address.
  return email;
}

module.exports = { normalizeEmail };
`,
          },
        ],
      };
    case 'findUserById':
      return {
        files: [
          {
            path: 'index.js',
            content: `function findUserById(users, id) {
  // TODO: return the matching user or null.
  return null;
}

module.exports = { findUserById };
`,
          },
        ],
      };
    case 'mapUserResponse':
    default:
      return {
        files: [
          {
            path: 'index.js',
            content: `function mapUserResponse(user) {
  // TODO: hide passwordHash and internal fields.
  return user;
}

module.exports = { mapUserResponse };
`,
          },
        ],
      };
  }
}

function taskTests(task: NonNullable<LessonSpec['codingTask']>) {
  const tests = {
    validateUsername: [
      ['valid username', TestCaseVisibility.PUBLIC, '"code_sync_1"', 'true', 25],
      ['too short', TestCaseVisibility.PUBLIC, '"ab"', 'false', 25],
      ['invalid characters', TestCaseVisibility.HIDDEN, '"bad-name!"', 'false', 25],
      ['upper boundary', TestCaseVisibility.HIDDEN, '"abcdefghijklmnopqrst"', 'true', 25],
    ],
    normalizeEmail: [
      ['trims and lowercases', TestCaseVisibility.PUBLIC, '"  STUDENT@Example.COM  "', '"student@example.com"', 35],
      ['keeps already normalized', TestCaseVisibility.PUBLIC, '"dev@codesync.local"', '"dev@codesync.local"', 25],
      ['preserves plus aliases', TestCaseVisibility.HIDDEN, '" USER+tag@Example.com "', '"user+tag@example.com"', 20],
      ['handles subdomains', TestCaseVisibility.HIDDEN, '"A@Sub.Example.COM"', '"a@sub.example.com"', 20],
    ],
    findUserById: [
      ['finds existing user', TestCaseVisibility.PUBLIC, '[{"id":"u1","name":"An"}],"u1"', '{"id":"u1","name":"An"}', 30],
      ['returns null for missing', TestCaseVisibility.PUBLIC, '[{"id":"u1"}],"u2"', 'null', 30],
      ['empty list', TestCaseVisibility.HIDDEN, '[],"u1"', 'null', 20],
      ['does not mutate list', TestCaseVisibility.HIDDEN, '[{"id":"u1"},{"id":"u2"}],"u2"', '{"id":"u2"}', 20],
    ],
    mapUserResponse: [
      ['maps public fields', TestCaseVisibility.PUBLIC, '{"id":"u1","email":"a@b.com","displayName":"A","passwordHash":"x"}', '{"id":"u1","email":"a@b.com","displayName":"A"}', 35],
      ['keeps status', TestCaseVisibility.PUBLIC, '{"id":"u1","email":"a@b.com","displayName":"A","status":"ACTIVE"}', '{"id":"u1","email":"a@b.com","displayName":"A","status":"ACTIVE"}', 25],
      ['hides refresh tokens', TestCaseVisibility.HIDDEN, '{"id":"u1","email":"a@b.com","refreshTokenHash":"secret"}', '{"id":"u1","email":"a@b.com"}', 20],
      ['ignores internal dates', TestCaseVisibility.HIDDEN, '{"id":"u1","email":"a@b.com","createdAt":"today"}', '{"id":"u1","email":"a@b.com"}', 20],
    ],
  } satisfies Record<NonNullable<LessonSpec['codingTask']>, readonly (readonly [string, TestCaseVisibility, string, string, number])[]>;

  return tests[task];
}

function snapshotFiles(label: string, index: number) {
  return {
    files: [
      {
        path: 'src/index.ts',
        content: `import { UserService } from './services/user.service';

const service = new UserService();
console.log('${label}', service.findUserById('demo-${index}'));
`,
      },
      {
        path: 'src/models/user.ts',
        content: `export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'student' | 'instructor' | 'admin';
}
`,
      },
      {
        path: 'src/services/user.service.ts',
        content: `import type { User } from '../models/user';

export class UserService {
  private readonly users: User[] = [
    { id: 'demo-${index}', email: 'student${index}@codesync.local', displayName: 'Demo Student ${index}', role: 'student' },
  ];

  findUserById(id: string) {
    return this.users.find((user) => user.id === id) ?? null;
  }
}
`,
      },
    ],
  };
}

const flagshipModules: readonly ModuleSpec[] = [
  {
    title: 'Getting Started',
    description: 'Orientation, setup, and first hands-on work.',
    lessons: [
      { title: 'Welcome to CodeSync', type: LessonType.ARTICLE, description: article('Welcome to CodeSync', ['course overview', 'learning objectives', 'Video-Code Sync', 'checkpoints', 'Run vs Submit', 'project grading']) },
      { title: 'Development Environment Setup', type: LessonType.ARTICLE, description: article('Development Environment Setup', ['Node.js', 'package manager', 'TypeScript', 'VS Code', 'folder structure', 'code blocks']) },
      { title: 'Your First TypeScript Project', type: LessonType.VIDEO, codeAlong: true, description: 'Code-Along video metadata. Upload a real demo video locally to make playback ready.' },
      { title: 'Understanding the Starter Project', type: LessonType.ARTICLE, description: article('Understanding the Starter Project', ['entry files', 'package scripts', 'source folders', 'test folders']) },
      { title: 'Basic TypeScript Warm-up', type: LessonType.CODING, codingTask: 'validateUsername', description: codingDescription('validateUsername', ['3-20 characters', 'letters, digits, underscore only', 'return true or false']) },
    ],
  },
  {
    title: 'TypeScript Fundamentals',
    description: 'Types, interfaces, functions, and input handling.',
    lessons: [
      { title: 'Types and Interfaces', type: LessonType.ARTICLE, description: article('Types and Interfaces', ['primitive types', 'interfaces', 'readonly data', 'DTO boundaries']) },
      { title: 'Modeling Data with TypeScript', type: LessonType.VIDEO, codeAlong: true, description: 'Code-Along video metadata for data modeling.' },
      { title: 'Validate a Username', type: LessonType.CODING, codingTask: 'validateUsername', description: codingDescription('validateUsername', ['3-20 characters', 'reject spaces', 'reject punctuation']) },
      { title: 'Functions and Error Handling', type: LessonType.ARTICLE, description: article('Functions and Error Handling', ['pure functions', 'throwing errors', 'Result-style return values']) },
      { title: 'Normalize User Input', type: LessonType.CODING, codingTask: 'normalizeEmail', description: codingDescription('normalizeEmail', ['trim whitespace', 'lowercase', 'preserve plus aliases']) },
    ],
  },
  {
    title: 'Service Layer',
    description: 'Application workflows and domain logic.',
    lessons: [
      { title: 'Building UserService', type: LessonType.VIDEO, codeAlong: true, description: 'Code-Along video metadata for service classes.' },
      { title: 'Service Layer Design', type: LessonType.ARTICLE, description: article('Service Layer Design', ['use cases', 'repositories', 'transactions', 'domain boundaries']) },
      { title: 'Implement findUserById', type: LessonType.CODING, codingTask: 'findUserById', description: codingDescription('findUserById', ['return the matching user', 'return null when not found', 'do not mutate input']) },
      { title: 'Debugging Service Logic', type: LessonType.VIDEO, codeAlong: true, description: 'Code-Along video metadata for debugging service logic.' },
      { title: 'Handle Missing Users', type: LessonType.CODING, codingTask: 'findUserById', description: codingDescription('findUserById', ['handle empty arrays', 'handle unknown IDs', 'return null']) },
    ],
  },
  {
    title: 'API Layer',
    description: 'REST routes, validation, and response mapping.',
    lessons: [
      { title: 'REST API Fundamentals', type: LessonType.ARTICLE, description: article('REST API Fundamentals', ['resources', 'verbs', 'status codes', 'pagination']) },
      { title: 'Building API Routes', type: LessonType.VIDEO, codeAlong: true, description: 'Code-Along video metadata for API routes.' },
      { title: 'Validate API Input', type: LessonType.CODING, codingTask: 'validateUsername', description: codingDescription('validateUsername', ['validate request bodies', 'reject invalid values', 'return predictable booleans']) },
      { title: 'HTTP Status Codes', type: LessonType.ARTICLE, description: article('HTTP Status Codes', ['2xx success', '4xx client errors', '5xx server errors', 'safe error messages']) },
      { title: 'Create a Response Mapper', type: LessonType.CODING, codingTask: 'mapUserResponse', description: codingDescription('mapUserResponse', ['hide internal fields', 'return public shape', 'preserve safe user fields']) },
    ],
  },
  {
    title: 'Final Project',
    description: 'Build, submit, and review a mini user API.',
    lessons: [
      { title: 'Project Requirements', type: LessonType.ARTICLE, description: article('Project Requirements', ['repository structure', 'build script', 'tests', 'API behavior']) },
      { title: 'Build a Mini User API', type: LessonType.PROJECT, projectConfig: true, description: article('Build a Mini User API', ['package.json exists', 'src/index.ts exists', 'build script exists', 'tests pass', 'manual review criteria']) },
      { title: 'Submission Checklist', type: LessonType.ARTICLE, description: article('Submission Checklist', ['push to GitHub', 'include README', 'run tests locally', 'submit repository URL']) },
      { title: 'Next Steps', type: LessonType.ARTICLE, description: article('Next Steps', ['practice more problems', 'review feedback', 'iterate on project structure']) },
    ],
  },
];

const additionalCourses: readonly CourseSpec[] = [
  ['JavaScript Fundamentals', 'javascript-fundamentals', CourseDifficulty.BEGINNER, CourseStatus.PUBLISHED, 'JavaScript'],
  ['TypeScript Essentials', 'typescript-essentials', CourseDifficulty.BEGINNER, CourseStatus.PUBLISHED, 'TypeScript'],
  ['React from Basics to Components', 'react-basics-components', CourseDifficulty.INTERMEDIATE, CourseStatus.PUBLISHED, 'React'],
  ['Next.js Application Fundamentals', 'nextjs-application-fundamentals', CourseDifficulty.INTERMEDIATE, CourseStatus.PUBLISHED, 'Next.js'],
  ['Node.js REST API Fundamentals', 'nodejs-rest-api-fundamentals', CourseDifficulty.INTERMEDIATE, CourseStatus.PUBLISHED, 'Node.js'],
  ['Git & GitHub for Developers', 'git-github-developers', CourseDifficulty.BEGINNER, CourseStatus.PUBLISHED, 'Git'],
  ['Testing JavaScript Applications', 'testing-javascript-applications', CourseDifficulty.ADVANCED, CourseStatus.DRAFT, 'Testing'],
  ['Clean Code for Web Developers', 'clean-code-web-developers', CourseDifficulty.INTERMEDIATE, CourseStatus.ARCHIVED, 'Software Engineering'],
].map(([title, slug, difficulty, status, category]) => ({
  title,
  slug,
  shortDescription: `${title} with practical CodeSync exercises.`,
  description: `A realistic local demo course for ${title}. Includes articles, short coding prompts, and curriculum structure for visual testing.`,
  difficulty,
  status,
  category,
  tags: [category, 'JavaScript', 'TypeScript'],
  modules: [
    {
      title: 'Foundations',
      description: `Core ideas for ${title}.`,
      lessons: [
        { title: `${title} Overview`, type: LessonType.ARTICLE, description: article(`${title} Overview`, ['learning objectives', 'mental model', 'hands-on workflow']) },
        { title: `Key Concepts in ${title}`, type: LessonType.ARTICLE, description: article(`Key Concepts in ${title}`, ['terminology', 'examples', 'common mistakes']) },
        { title: `${title} Guided Walkthrough`, type: LessonType.VIDEO, codeAlong: true, description: 'Upload-required local video metadata for the guided walkthrough.' },
      ],
    },
    {
      title: 'Practice',
      description: `Hands-on practice for ${title}.`,
      lessons: [
        { title: `${title} Exercise One`, type: LessonType.CODING, codingTask: 'normalizeEmail', description: codingDescription('normalizeEmail', ['trim', 'lowercase', 'return normalized value']) },
        { title: `${title} Exercise Review`, type: LessonType.ARTICLE, description: article(`${title} Exercise Review`, ['debugging', 'testing', 'refactoring']) },
        { title: `${title} Applied Challenge`, type: LessonType.CODING, codingTask: 'mapUserResponse', description: codingDescription('mapUserResponse', ['return public fields', 'hide internals']) },
      ],
    },
  ],
})) as readonly CourseSpec[];

const flagshipCourse: CourseSpec = {
  title: 'CodeSync Full Feature Demo Course',
  slug: flagshipSlug,
  shortDescription: 'A complete local demo course for exercising CodeSync features.',
  description: 'A complete CodeSync demo course containing articles, video-code sync, coding exercises, checkpoints, project work, automated judging, and progress tracking.',
  difficulty: CourseDifficulty.INTERMEDIATE,
  status: CourseStatus.PUBLISHED,
  category: 'Programming',
  tags: ['JavaScript', 'TypeScript', 'Node.js', 'API', 'GitHub'],
  modules: flagshipModules,
};

const demoStudents: readonly DemoUser[] = [
  { email: 'student1@codesync.local', displayName: 'Demo Student 1' },
  { email: 'student2@codesync.local', displayName: 'Demo Student 2' },
  { email: 'student3@codesync.local', displayName: 'Demo Student 3' },
  { email: 'student4@codesync.local', displayName: 'Demo Student 4' },
  { email: 'student5@codesync.local', displayName: 'Demo Student 5' },
  { email: 'student6@codesync.local', displayName: 'Demo Student 6' },
];

const practiceProblemSpecs = [
  ['Two Sum', PracticeDifficulty.EASY, ['Array', 'Hash Map']],
  ['Valid Parentheses', PracticeDifficulty.EASY, ['String', 'Stack']],
  ['Reverse String', PracticeDifficulty.EASY, ['String']],
  ['Find Duplicate', PracticeDifficulty.EASY, ['Array', 'Hash Map']],
  ['Count Frequencies', PracticeDifficulty.EASY, ['Object', 'Hash Map']],
  ['Merge Sorted Arrays', PracticeDifficulty.EASY, ['Array', 'Sorting']],
  ['Binary Search', PracticeDifficulty.EASY, ['Searching', 'Array']],
  ['Longest Word', PracticeDifficulty.EASY, ['String']],
  ['Group Users by Role', PracticeDifficulty.MEDIUM, ['Object', 'TypeScript']],
  ['Normalize Email List', PracticeDifficulty.MEDIUM, ['String', 'JavaScript']],
  ['Flatten Nested Array', PracticeDifficulty.MEDIUM, ['Array']],
  ['Chunk Array', PracticeDifficulty.MEDIUM, ['Array']],
  ['Debounce Calls', PracticeDifficulty.MEDIUM, ['JavaScript', 'Design']],
  ['Rate Limiter', PracticeDifficulty.MEDIUM, ['Design', 'Object']],
  ['Task Scheduler', PracticeDifficulty.MEDIUM, ['Design', 'Sorting']],
  ['Simple Event Emitter', PracticeDifficulty.MEDIUM, ['JavaScript', 'Design']],
  ['LRU Cache', PracticeDifficulty.HARD, ['Design', 'Hash Map']],
  ['Async Retry Helper', PracticeDifficulty.HARD, ['JavaScript', 'Design']],
  ['Top K Frequent Words', PracticeDifficulty.HARD, ['Hash Map', 'Sorting']],
  ['Schema Validator', PracticeDifficulty.HARD, ['TypeScript', 'Object']],
] as const;

async function ensureRole(name: RoleName) {
  return prisma.role.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function ensureUser(input: DemoUser, roles: readonly RoleName[], overwritePassword: boolean) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  const passwordHash = existing && !overwritePassword
    ? existing.passwordHash
    : await argon2.hash(demoPassword, { type: argon2.argon2id });

  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {
      displayName: input.displayName,
      status: UserStatus.ACTIVE,
      passwordHash,
    },
    create: {
      email: input.email,
      displayName: input.displayName,
      status: UserStatus.ACTIVE,
      passwordHash,
    },
  });

  for (const roleName of roles) {
    const role = await ensureRole(roleName);
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  return user;
}

async function ensureCategory(name: string) {
  return prisma.courseCategory.upsert({
    where: { slug: slugify(name) },
    update: { name },
    create: { name, slug: slugify(name) },
  });
}

async function ensureCourseTag(name: string) {
  return prisma.courseTag.upsert({
    where: { slug: slugify(name) },
    update: { name },
    create: { name, slug: slugify(name) },
  });
}

async function replaceCourseTags(courseId: string, tags: readonly string[]) {
  await prisma.courseTagAssignment.deleteMany({ where: { courseId } });
  for (const tagName of tags) {
    const tag = await ensureCourseTag(tagName);
    await prisma.courseTagAssignment.create({ data: { courseId, tagId: tag.id } });
  }
}

async function createVideoForLesson(lessonId: string, instructorId: string, position: number) {
  return prisma.videoAsset.upsert({
    where: { lessonId },
    update: {
      status: VideoAssetStatus.UPLOADING,
      originalFilename: `demo-video-${position}.mp4`,
      mimeType: 'video/mp4',
      sizeBytes: BigInt(25_000_000 + position),
      sourceObjectKey: `demo/upload-required/${lessonId}.mp4`,
      sourceObjectId: null,
      masterPlaylistObjectKey: null,
      thumbnailObjectKey: null,
      processingProgress: 0,
      durationSeconds: 1_260,
      width: 1920,
      height: 1080,
      readyAt: null,
      failedAt: null,
    },
    create: {
      lessonId,
      createdByUserId: instructorId,
      status: VideoAssetStatus.UPLOADING,
      originalFilename: `demo-video-${position}.mp4`,
      mimeType: 'video/mp4',
      sizeBytes: BigInt(25_000_000 + position),
      sourceObjectKey: `demo/upload-required/${lessonId}.mp4`,
      processingProgress: 0,
      durationSeconds: 1_260,
      width: 1920,
      height: 1080,
    },
  });
}

async function seedSnapshots(lessonId: string, videoAssetId: string, instructorId: string) {
  const timeline = [
    [0, 'Initial Project'],
    [180, 'Application Entry Point'],
    [390, 'Add User Model'],
    [600, 'Add User Service'],
    [900, 'Add API Route'],
    [1_200, 'Refactor'],
  ] as const;

  await prisma.codeSnapshot.deleteMany({ where: { lessonId } });

  for (const [index, [timestampSeconds, title]] of timeline.entries()) {
    await prisma.codeSnapshot.create({
      data: {
        lessonId,
        videoAssetId,
        timestampSeconds,
        title,
        language: 'typescript',
        filesJson: snapshotFiles(title, index + 1) as Prisma.InputJsonValue,
        createdByUserId: instructorId,
      },
    });
  }
}

async function seedCodingCheckpoint(lessonId: string, videoAssetId: string, title: string, task: NonNullable<LessonSpec['codingTask']>, position: number) {
  const checkpoint = await prisma.videoCheckpoint.create({
    data: {
      lessonId,
      videoAssetId,
      timestampSeconds: 240 + position * 180,
      type: VideoCheckpointType.CODING,
      title,
      description: `Implement ${task} before continuing.`,
      required: true,
      pauseVideo: true,
      position,
    },
  });

  const config = await prisma.codingCheckpointConfig.create({
    data: {
      checkpointId: checkpoint.id,
      language: 'javascript',
      entryFile: 'index.js',
      starterFilesJson: starterFiles(task) as Prisma.InputJsonValue,
      timeLimitMs: 5_000,
      memoryLimitMb: 128,
      passScore: new Prisma.Decimal(70),
      scoringMode: ScoringMode.WEIGHTED,
    },
  });

  for (const [testIndex, [name, visibility, input, expectedOutput, weight]] of taskTests(task).entries()) {
    await prisma.testCase.create({
      data: {
        codingCheckpointConfigId: config.id,
        name,
        visibility,
        input,
        expectedOutput,
        weight: new Prisma.Decimal(weight),
        position: testIndex + 1,
      },
    });
  }

  return checkpoint;
}

async function seedInfoCheckpoint(lessonId: string, videoAssetId: string, title: string, position: number) {
  return prisma.videoCheckpoint.create({
    data: {
      lessonId,
      videoAssetId,
      timestampSeconds: 90 + position * 120,
      type: VideoCheckpointType.INFO,
      title,
      description: 'Pause and inspect the instructor code snapshot before continuing.',
      required: false,
      pauseVideo: true,
      position,
    },
  });
}

async function seedProjectConfig(lessonId: string, videoAssetId: string) {
  const checkpoint = await prisma.videoCheckpoint.create({
    data: {
      lessonId,
      videoAssetId,
      timestampSeconds: 60,
      type: VideoCheckpointType.PROJECT,
      title: 'Build a Mini User API',
      description: 'Submit a GitHub repository for automated and manual project grading.',
      required: true,
      pauseVideo: true,
      position: 1,
    },
  });

  const config = await prisma.projectCheckpointConfig.create({
    data: {
      checkpointId: checkpoint.id,
      repositoryProvider: RepositoryProvider.GITHUB,
      defaultBranch: 'main',
      requireDeploymentUrl: false,
      maxRepositoryBytes: BigInt(20_000_000),
      maxBuildTimeMs: 20_000,
      maxTestTimeMs: 20_000,
      passScore: new Prisma.Decimal(70),
    },
  });

  const criteria = [
    ['package.json exists', 'Repository must include package.json.', ProjectCriterionType.AUTO, ProjectAutoCheckType.FILE_EXISTS, { path: 'package.json' }, 10, true],
    ['src/index.ts exists', 'Main API entrypoint must exist.', ProjectCriterionType.AUTO, ProjectAutoCheckType.FILE_EXISTS, { path: 'src/index.ts' }, 15, true],
    ['build script exists', 'package.json must expose a build script.', ProjectCriterionType.AUTO, ProjectAutoCheckType.JSON_FIELD, { path: 'package.json', jsonPath: ['scripts', 'build'] }, 15, true],
    ['project builds', 'The project should build successfully.', ProjectCriterionType.AUTO, ProjectAutoCheckType.BUILD_SUCCESS, {}, 20, true],
    ['tests pass', 'Automated tests should pass.', ProjectCriterionType.AUTO, ProjectAutoCheckType.TEST_SUCCESS, {}, 20, true],
    ['Project structure', 'Folders and files are easy to scan.', ProjectCriterionType.MANUAL, null, {}, 10, false],
    ['Code readability', 'Code uses clear names and small functions.', ProjectCriterionType.MANUAL, null, {}, 5, false],
    ['Error handling', 'API handles invalid input safely.', ProjectCriterionType.MANUAL, null, {}, 5, false],
  ] as const;

  for (const [index, [title, description, type, autoCheckType, configJson, weight, required]] of criteria.entries()) {
    await prisma.projectRubricCriterion.create({
      data: {
        projectCheckpointConfigId: config.id,
        title,
        description,
        type,
        autoCheckType,
        configJson: configJson as Prisma.InputJsonValue,
        weight: new Prisma.Decimal(weight),
        required,
        position: index + 1,
      },
    });
  }

  return config;
}

async function seedCourse(spec: CourseSpec, instructorId: string) {
  const category = await ensureCategory(spec.category);
  const now = new Date();
  const course = await prisma.course.upsert({
    where: { slug: spec.slug },
    update: {
      title: spec.title,
      shortDescription: spec.shortDescription,
      description: spec.description,
      difficulty: spec.difficulty,
      status: spec.status,
      categoryId: category.id,
      ownerInstructorId: instructorId,
      publishedAt: spec.status === CourseStatus.PUBLISHED ? now : null,
      archivedAt: spec.status === CourseStatus.ARCHIVED ? now : null,
    },
    create: {
      title: spec.title,
      slug: spec.slug,
      shortDescription: spec.shortDescription,
      description: spec.description,
      difficulty: spec.difficulty,
      status: spec.status,
      categoryId: category.id,
      ownerInstructorId: instructorId,
      publishedAt: spec.status === CourseStatus.PUBLISHED ? now : null,
      archivedAt: spec.status === CourseStatus.ARCHIVED ? now : null,
    },
  });

  await replaceCourseTags(course.id, spec.tags);
  await prisma.courseModule.deleteMany({ where: { courseId: course.id } });

  const lessons = [];

  for (const [moduleIndex, moduleSpec] of spec.modules.entries()) {
    const courseModule = await prisma.courseModule.create({
      data: {
        courseId: course.id,
        title: moduleSpec.title,
        description: moduleSpec.description,
        position: moduleIndex + 1,
      },
    });

    for (const [lessonIndex, lessonSpec] of moduleSpec.lessons.entries()) {
      const lesson = await prisma.lesson.create({
        data: {
          moduleId: courseModule.id,
          title: lessonSpec.title,
          description: lessonSpec.description,
          lessonType: lessonSpec.type,
          position: lessonIndex + 1,
        },
      });

      lessons.push({ lesson, spec: lessonSpec, moduleTitle: moduleSpec.title });

      if (lessonSpec.type === LessonType.VIDEO || lessonSpec.projectConfig) {
        const video = await createVideoForLesson(lesson.id, instructorId, lessonIndex + 1);

        if (lessonSpec.codeAlong) {
          await prisma.videoCodeAlongConfig.upsert({
            where: { lessonId: lesson.id },
            update: { enabled: true, language: 'typescript', entryFile: 'src/index.ts' },
            create: { lessonId: lesson.id, enabled: true, language: 'typescript', entryFile: 'src/index.ts' },
          });
          await seedSnapshots(lesson.id, video.id, instructorId);
          await seedInfoCheckpoint(lesson.id, video.id, 'Pause and inspect the User model', 1);
          if (lessonIndex % 2 === 0) {
            await seedCodingCheckpoint(lesson.id, video.id, 'Implement username validation before continuing', 'validateUsername', 2);
          }
        }

        if (lessonSpec.projectConfig) {
          await seedProjectConfig(lesson.id, video.id);
        }
      }

      if (lessonSpec.codingTask) {
        const video = await createVideoForLesson(lesson.id, instructorId, lessonIndex + 20);
        await seedCodingCheckpoint(lesson.id, video.id, lessonSpec.title, lessonSpec.codingTask, 1);
      }
    }
  }

  return { course, lessons };
}

async function seedPracticeProblems(instructorId: string, students: readonly { readonly id: string }[]) {
  const problems = [];

  for (const tagName of practiceTags) {
    await prisma.practiceTag.upsert({
      where: { slug: slugify(tagName) },
      update: { name: tagName },
      create: { name: tagName, slug: slugify(tagName) },
    });
  }

  for (const [index, [title, difficulty, tags]] of practiceProblemSpecs.entries()) {
    const slug = slugify(title);
    const status = index === 18 ? PracticeProblemStatus.DRAFT : index === 19 ? PracticeProblemStatus.ARCHIVED : PracticeProblemStatus.PUBLISHED;
    const problem = await prisma.practiceProblem.upsert({
      where: { slug },
      update: {
        createdByUserId: instructorId,
        title,
        description: article(title, ['problem statement', 'input/output contract', 'edge cases']),
        difficulty,
        status,
        language: 'javascript',
        entryFile: 'index.js',
        starterFilesJson: { files: [{ path: 'index.js', content: `function solution(input) {\n  return input;\n}\n\nmodule.exports = { solution };\n` }] } as Prisma.InputJsonValue,
        passScore: new Prisma.Decimal(70),
        scoringMode: ScoringMode.WEIGHTED,
        publishedAt: status === PracticeProblemStatus.PUBLISHED ? daysAgo(index % 8) : null,
        archivedAt: status === PracticeProblemStatus.ARCHIVED ? daysAgo(1) : null,
      },
      create: {
        createdByUserId: instructorId,
        title,
        slug,
        description: article(title, ['problem statement', 'input/output contract', 'edge cases']),
        difficulty,
        status,
        language: 'javascript',
        entryFile: 'index.js',
        starterFilesJson: { files: [{ path: 'index.js', content: `function solution(input) {\n  return input;\n}\n\nmodule.exports = { solution };\n` }] } as Prisma.InputJsonValue,
        passScore: new Prisma.Decimal(70),
        scoringMode: ScoringMode.WEIGHTED,
        publishedAt: status === PracticeProblemStatus.PUBLISHED ? daysAgo(index % 8) : null,
        archivedAt: status === PracticeProblemStatus.ARCHIVED ? daysAgo(1) : null,
      },
    });

    await prisma.practiceProblemTag.deleteMany({ where: { problemId: problem.id } });
    for (const tagName of tags) {
      const tag = await prisma.practiceTag.upsert({
        where: { slug: slugify(tagName) },
        update: { name: tagName },
        create: { name: tagName, slug: slugify(tagName) },
      });
      await prisma.practiceProblemTag.create({ data: { problemId: problem.id, tagId: tag.id } });
    }

    await prisma.practiceProblemTestCase.deleteMany({ where: { practiceProblemId: problem.id } });
    for (let testIndex = 0; testIndex < 4; testIndex += 1) {
      await prisma.practiceProblemTestCase.create({
        data: {
          practiceProblemId: problem.id,
          name: testIndex < 2 ? `Sample ${testIndex + 1}` : `Hidden edge ${testIndex - 1}`,
          visibility: testIndex < 2 ? TestCaseVisibility.PUBLIC : TestCaseVisibility.HIDDEN,
          input: JSON.stringify({ case: testIndex + 1, title }),
          expectedOutput: JSON.stringify({ ok: true, case: testIndex + 1 }),
          weight: new Prisma.Decimal(25),
          position: testIndex + 1,
        },
      });
    }

    problems.push(problem);
  }

  for (const [studentIndex, student] of students.entries()) {
    for (const [problemIndex, problem] of problems.slice(0, 12).entries()) {
      const mode = (studentIndex + problemIndex) % 4;
      const status = mode === 0 ? PracticeProgressStatus.SOLVED : mode === 1 ? PracticeProgressStatus.ATTEMPTED : PracticeProgressStatus.NOT_STARTED;
      await prisma.practiceProgress.upsert({
        where: { studentId_practiceProblemId: { studentId: student.id, practiceProblemId: problem.id } },
        update: {
          status,
          attemptCount: status === PracticeProgressStatus.NOT_STARTED ? 0 : mode + 1,
          bestScore: status === PracticeProgressStatus.NOT_STARTED ? null : new Prisma.Decimal(status === PracticeProgressStatus.SOLVED ? 90 - problemIndex : 45 + problemIndex),
          firstAttemptedAt: status === PracticeProgressStatus.NOT_STARTED ? null : daysAgo(problemIndex + 1),
          lastAttemptedAt: status === PracticeProgressStatus.NOT_STARTED ? null : daysAgo(problemIndex % 5),
          solvedAt: status === PracticeProgressStatus.SOLVED ? daysAgo(problemIndex % 4) : null,
        },
        create: {
          studentId: student.id,
          practiceProblemId: problem.id,
          status,
          attemptCount: status === PracticeProgressStatus.NOT_STARTED ? 0 : mode + 1,
          bestScore: status === PracticeProgressStatus.NOT_STARTED ? null : new Prisma.Decimal(status === PracticeProgressStatus.SOLVED ? 90 - problemIndex : 45 + problemIndex),
          firstAttemptedAt: status === PracticeProgressStatus.NOT_STARTED ? null : daysAgo(problemIndex + 1),
          lastAttemptedAt: status === PracticeProgressStatus.NOT_STARTED ? null : daysAgo(problemIndex % 5),
          solvedAt: status === PracticeProgressStatus.SOLVED ? daysAgo(problemIndex % 4) : null,
        },
      });
    }
  }

  return problems;
}

async function seedEnrollmentsAndProgress(students: readonly { readonly id: string; readonly email: string }[], courses: readonly { readonly course: { readonly id: string; readonly slug: string } }[]) {
  await prisma.learningActivity.deleteMany({ where: { userId: { in: students.map((student) => student.id) } } });

  const enrollmentPlan: Record<string, readonly string[]> = {
    'student1@codesync.local': [flagshipSlug, 'javascript-fundamentals', 'git-github-developers'],
    'student2@codesync.local': [flagshipSlug, 'typescript-essentials', 'nodejs-rest-api-fundamentals'],
    'student3@codesync.local': ['react-basics-components', 'nextjs-application-fundamentals', 'testing-javascript-applications'],
    'student4@codesync.local': [flagshipSlug, 'clean-code-web-developers'],
    'student5@codesync.local': [flagshipSlug, 'javascript-fundamentals', 'typescript-essentials', 'react-basics-components', 'git-github-developers'],
    'student6@codesync.local': ['nodejs-rest-api-fundamentals', 'nextjs-application-fundamentals', 'clean-code-web-developers'],
  };

  for (const student of students) {
    const slugs = enrollmentPlan[student.email] ?? [];

    for (const [courseIndex, slug] of slugs.entries()) {
      const course = courses.find((item) => item.course.slug === slug)?.course;
      if (!course) {
        continue;
      }

      const lessons = await prisma.lesson.findMany({
        where: { module: { courseId: course.id } },
        orderBy: [{ module: { position: 'asc' } }, { position: 'asc' }],
      });

      const completionRatio = student.email === 'student2@codesync.local' && slug === flagshipSlug
        ? 0.7
        : student.email === 'student1@codesync.local' && slug === flagshipSlug
          ? 0.35
          : student.email === 'student4@codesync.local'
            ? 0.05
            : courseIndex === 0
              ? 0.55
              : 0.2;
      const completedLessons = Math.min(lessons.length, Math.floor(lessons.length * completionRatio));
      const enrollmentStatus = completedLessons === lessons.length && lessons.length > 0 ? EnrollmentStatus.COMPLETED : EnrollmentStatus.ACTIVE;
      const enrollment = await prisma.enrollment.upsert({
        where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
        update: {
          status: enrollmentStatus,
          enrolledAt: daysAgo(20 - courseIndex),
        },
        create: {
          studentId: student.id,
          courseId: course.id,
          status: enrollmentStatus,
          enrolledAt: daysAgo(20 - courseIndex),
        },
      });

      await prisma.courseProgress.upsert({
        where: { enrollmentId: enrollment.id },
        update: {
          totalLessons: lessons.length,
          completedLessons,
          progressPercent: new Prisma.Decimal(lessons.length ? Math.round((completedLessons / lessons.length) * 100) : 0),
          lastAccessedAt: daysAgo(courseIndex),
          completedAt: enrollmentStatus === EnrollmentStatus.COMPLETED ? daysAgo(1) : null,
        },
        create: {
          enrollmentId: enrollment.id,
          totalLessons: lessons.length,
          completedLessons,
          progressPercent: new Prisma.Decimal(lessons.length ? Math.round((completedLessons / lessons.length) * 100) : 0),
          startedAt: daysAgo(20 - courseIndex),
          lastAccessedAt: daysAgo(courseIndex),
          completedAt: enrollmentStatus === EnrollmentStatus.COMPLETED ? daysAgo(1) : null,
        },
      });

      await prisma.learningActivity.create({
        data: {
          userId: student.id,
          type: LearningActivityType.COURSE_ENROLLED,
          courseId: course.id,
          enrollmentId: enrollment.id,
          metadata: { demoSeed: true, courseSlug: slug },
          createdAt: daysAgo(20 - courseIndex),
        },
      });

      for (const [lessonIndex, lesson] of lessons.entries()) {
        const status = lessonIndex < completedLessons
          ? LessonProgressStatus.COMPLETED
          : lessonIndex === completedLessons
            ? LessonProgressStatus.IN_PROGRESS
            : LessonProgressStatus.NOT_STARTED;

        await prisma.lessonProgress.upsert({
          where: { studentId_lessonId: { studentId: student.id, lessonId: lesson.id } },
          update: {
            enrollmentId: enrollment.id,
            status,
            startedAt: status === LessonProgressStatus.NOT_STARTED ? null : daysAgo(Math.max(1, 15 - lessonIndex)),
            lastAccessedAt: status === LessonProgressStatus.NOT_STARTED ? null : daysAgo(Math.max(0, 10 - lessonIndex)),
            completedAt: status === LessonProgressStatus.COMPLETED ? daysAgo(Math.max(0, 9 - lessonIndex)) : null,
          },
          create: {
            studentId: student.id,
            lessonId: lesson.id,
            enrollmentId: enrollment.id,
            status,
            startedAt: status === LessonProgressStatus.NOT_STARTED ? null : daysAgo(Math.max(1, 15 - lessonIndex)),
            lastAccessedAt: status === LessonProgressStatus.NOT_STARTED ? null : daysAgo(Math.max(0, 10 - lessonIndex)),
            completedAt: status === LessonProgressStatus.COMPLETED ? daysAgo(Math.max(0, 9 - lessonIndex)) : null,
          },
        });

        if (status !== LessonProgressStatus.NOT_STARTED) {
          await prisma.learningActivity.create({
            data: {
              userId: student.id,
              type: status === LessonProgressStatus.COMPLETED ? LearningActivityType.LESSON_COMPLETED : LearningActivityType.LESSON_STARTED,
              courseId: course.id,
              lessonId: lesson.id,
              enrollmentId: enrollment.id,
              metadata: { demoSeed: true, lessonTitle: lesson.title },
              createdAt: status === LessonProgressStatus.COMPLETED ? daysAgo(Math.max(0, 9 - lessonIndex)) : daysAgo(Math.max(1, 15 - lessonIndex)),
            },
          });
        }
      }

      const videos = await prisma.videoAsset.findMany({ where: { lesson: { module: { courseId: course.id } } } });
      for (const [videoIndex, video] of videos.slice(0, 2).entries()) {
        await prisma.videoProgress.upsert({
          where: { studentId_videoAssetId: { studentId: student.id, videoAssetId: video.id } },
          update: {
            lessonId: video.lessonId,
            lastPositionSeconds: 180 + videoIndex * 120,
            furthestPositionSeconds: 240 + videoIndex * 180,
            watchedPercent: 25 + videoIndex * 20,
            lastWatchedAt: daysAgo(videoIndex),
          },
          create: {
            studentId: student.id,
            videoAssetId: video.id,
            lessonId: video.lessonId,
            lastPositionSeconds: 180 + videoIndex * 120,
            furthestPositionSeconds: 240 + videoIndex * 180,
            watchedPercent: 25 + videoIndex * 20,
            lastWatchedAt: daysAgo(videoIndex),
          },
        });
      }

      const checkpoints = await prisma.videoCheckpoint.findMany({ where: { lesson: { module: { courseId: course.id } } }, take: 3 });
      for (const checkpoint of checkpoints) {
        await prisma.checkpointProgress.upsert({
          where: { studentId_checkpointId: { studentId: student.id, checkpointId: checkpoint.id } },
          update: {
            status: CheckpointProgressStatus.COMPLETED,
            startedAt: daysAgo(4),
            completedAt: daysAgo(3),
          },
          create: {
            studentId: student.id,
            checkpointId: checkpoint.id,
            status: CheckpointProgressStatus.COMPLETED,
            startedAt: daysAgo(4),
            completedAt: daysAgo(3),
          },
        });
      }
    }
  }
}

async function seedNotifications(users: readonly { readonly id: string; readonly email: string }[]) {
  const templates = [
    [NotificationType.COURSE_PUBLISHED, NotificationCategory.COURSE, 'Course published', 'A new CodeSync demo course is available.', '/courses'],
    [NotificationType.PRACTICE_SOLVED, NotificationCategory.PRACTICE, 'Practice solved', 'Nice work solving a practice problem.', '/practice'],
    [NotificationType.JUDGE_COMPLETED, NotificationCategory.PRACTICE, 'Judge completed', 'Your latest judge submission has completed.', '/practice'],
    [NotificationType.PROJECT_SUBMITTED, NotificationCategory.PROJECT, 'Project submitted', 'Your project submission has been queued for grading.', '/my-courses'],
    [NotificationType.PROJECT_GRADED, NotificationCategory.PROJECT, 'Project graded', 'Project grading feedback is ready to review.', '/my-courses'],
    [NotificationType.VIDEO_PROCESSING_FAILED, NotificationCategory.LEARNING, 'Video upload needs attention', 'A demo video is waiting for a real upload.', '/instructor/courses'],
    [NotificationType.ADMIN_OPERATION_ALERT, NotificationCategory.SYSTEM, 'Admin demo data ready', 'Demo seed populated local development data.', '/admin'],
  ] as const;

  for (const user of users) {
    for (const [index, [type, category, title, message, actionUrl]] of templates.entries()) {
      await prisma.notification.upsert({
        where: { dedupeKey: `demo:${user.email}:${type}` },
        update: {
          type,
          category,
          title,
          message,
          actionUrl,
          dataJson: { demoSeed: true, index },
          readAt: index % 3 === 0 ? daysAgo(index) : null,
          createdAt: daysAgo(index),
        },
        create: {
          userId: user.id,
          type,
          category,
          title,
          message,
          actionUrl,
          dataJson: { demoSeed: true, index },
          dedupeKey: `demo:${user.email}:${type}`,
          readAt: index % 3 === 0 ? daysAgo(index) : null,
          createdAt: daysAgo(index),
        },
      });
    }
  }
}

async function seedAuditLogs(adminId: string, targetUserIds: readonly string[], courseIds: readonly string[]) {
  await prisma.adminAuditLog.deleteMany({
    where: {
      adminUserId: adminId,
      action: { in: ['DEMO_USER_ACTIVATED', 'DEMO_USER_ROLE_UPDATED', 'DEMO_COURSE_ARCHIVED', 'DEMO_VIDEO_RETRY_REQUESTED'] },
    },
  });

  const logs = [
    ['DEMO_USER_ACTIVATED', 'User', targetUserIds[0] ?? adminId, { reason: 'demo account activation' }],
    ['DEMO_USER_ROLE_UPDATED', 'User', targetUserIds[1] ?? adminId, { roles: ['STUDENT'] }],
    ['DEMO_COURSE_ARCHIVED', 'Course', courseIds[0] ?? adminId, { reason: 'demo archived course example' }],
    ['DEMO_VIDEO_RETRY_REQUESTED', 'VideoAsset', courseIds[1] ?? adminId, { reason: 'demo operation log only' }],
  ] as const;

  for (const [index, [action, targetType, targetId, metadataJson]] of logs.entries()) {
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: adminId,
        action,
        targetType,
        targetId,
        metadataJson: metadataJson as Prisma.InputJsonValue,
        createdAt: daysAgo(index + 1),
      },
    });
  }
}

async function verify() {
  const admin = await prisma.user.findUnique({
    where: { email: adminEmail },
    include: { roles: { include: { role: true } } },
  });
  const flagship = await prisma.course.findUnique({
    where: { slug: flagshipSlug },
    include: {
      modules: { include: { lessons: true } },
    },
  });
  const lessonCounts = await prisma.lesson.groupBy({ by: ['lessonType'], _count: true });

  return {
    admin: {
      exists: Boolean(admin),
      roles: admin?.roles.map((role) => role.role.name).sort() ?? [],
    },
    courses: await prisma.course.count(),
    modules: await prisma.courseModule.count(),
    lessonCounts: Object.fromEntries(lessonCounts.map((item) => [item.lessonType, item._count])),
    flagship: {
      exists: Boolean(flagship),
      slug: flagshipSlug,
      modules: flagship?.modules.length ?? 0,
      lessons: flagship?.modules.reduce((sum, module) => sum + module.lessons.length, 0) ?? 0,
    },
    snapshots: await prisma.codeSnapshot.count(),
    codingCheckpointConfigs: await prisma.codingCheckpointConfig.count(),
    testCases: await prisma.testCase.count(),
    projectConfigs: await prisma.projectCheckpointConfig.count(),
    practiceProblems: await prisma.practiceProblem.count(),
    practiceTags: await prisma.practiceTag.count(),
    practiceTestCases: await prisma.practiceProblemTestCase.count(),
    enrollments: await prisma.enrollment.count(),
    learningActivities: await prisma.learningActivity.count(),
    notifications: await prisma.notification.count(),
    auditLogs: await prisma.adminAuditLog.count(),
  };
}

async function main() {
  for (const role of [RoleName.STUDENT, RoleName.INSTRUCTOR, RoleName.ADMIN]) {
    await ensureRole(role);
  }

  for (const category of categories) {
    await ensureCategory(category);
  }

  for (const tag of courseTags) {
    await ensureCourseTag(tag);
  }

  const admin = await ensureUser({ email: adminEmail, displayName: 'CodeSync Admin' }, [RoleName.ADMIN, RoleName.INSTRUCTOR], false);
  const students = [];

  for (const student of demoStudents) {
    students.push(await ensureUser(student, [RoleName.STUDENT], true));
  }

  const seededCourses = [];
  seededCourses.push(await seedCourse(flagshipCourse, admin.id));
  for (const course of additionalCourses) {
    seededCourses.push(await seedCourse(course, admin.id));
  }

  await seedEnrollmentsAndProgress(students, seededCourses);
  await seedPracticeProblems(admin.id, students);
  await seedNotifications([admin, ...students]);
  await seedAuditLogs(admin.id, students.map((student) => student.id), seededCourses.map((item) => item.course.id));

  const summary = await verify();
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
