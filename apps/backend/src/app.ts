import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type Redis from 'ioredis';
import pinoHttp from 'pino-http';
import { PrismaClient } from '@prisma/client';
import { loadEnv, type Env } from './config';
import { createReadinessChecker, type ReadinessChecker } from './infrastructure/readiness';
import { cors } from './middlewares/cors';
import { errorHandler } from './middlewares/error-handler';
import { createMemoryRateLimiterStore, createRedisRateLimiterStore, type RateLimiterStore } from './middlewares/rate-limit';
import { requestContext } from './middlewares/request-context';
import { AdminController } from './modules/admin/admin.controller';
import { AdminRepository } from './modules/admin/admin.repository';
import { createAdminRouter } from './modules/admin/admin.routes';
import { AdminService } from './modules/admin/admin.service';
import { AuthController } from './modules/auth/auth.controller';
import { createAuthRouter } from './modules/auth/auth.routes';
import { AuthService } from './modules/auth/auth.service';
import { SessionRepository } from './modules/auth/session.repository';
import { TokenService } from './modules/auth/token.service';
import { CodeExecutionController } from './modules/code-execution/code-execution.controller';
import { CodeExecutionRepository } from './modules/code-execution/code-execution.repository';
import { createCodeExecutionRouter } from './modules/code-execution/code-execution.routes';
import { CodeExecutionService, type CodeExecutionMessagePublisher } from './modules/code-execution/code-execution.service';
import { CourseController } from './modules/courses/course.controller';
import { CourseRepository } from './modules/courses/course.repository';
import { createCourseRouter, createInstructorCourseRouter } from './modules/courses/course.routes';
import { CourseService } from './modules/courses/course.service';
import { EnrollmentController } from './modules/enrollments/enrollment.controller';
import { EnrollmentRepository } from './modules/enrollments/enrollment.repository';
import {
  createCourseEnrollmentRouter,
  createUserEnrollmentRouter,
} from './modules/enrollments/enrollment.routes';
import { EnrollmentService } from './modules/enrollments/enrollment.service';
import { JudgeController } from './modules/judge/judge.controller';
import { JudgeRepository } from './modules/judge/judge.repository';
import { createJudgeRouter } from './modules/judge/judge.routes';
import { JudgeService, type CodeJudgeMessagePublisher } from './modules/judge/judge.service';
import { PracticeController } from './modules/practice/practice.controller';
import { PracticeRepository } from './modules/practice/practice.repository';
import { createInstructorPracticeRouter, createPracticeRouter } from './modules/practice/practice.routes';
import { PracticeService } from './modules/practice/practice.service';
import { QuizController } from './modules/quiz/quiz.controller';
import { QuizRepository } from './modules/quiz/quiz.repository';
import { createInstructorQuizRouter, createStudentQuizRouter } from './modules/quiz/quiz.routes';
import { QuizService } from './modules/quiz/quiz.service';
import { ProjectGradingController } from './modules/project-grading/project-grading.controller';
import { ProjectGradingRepository } from './modules/project-grading/project-grading.repository';
import { createProjectGradingRouter } from './modules/project-grading/project-grading.routes';
import { ProjectGradingService, type CommitResolver, type ProjectGradingMessagePublisher } from './modules/project-grading/project-grading.service';
import { LearningController } from './modules/learning/learning.controller';
import { LearningRepository } from './modules/learning/learning.repository';
import { createLearningRouter } from './modules/learning/learning.routes';
import { LearningService } from './modules/learning/learning.service';
import { NotificationController } from './modules/notifications/notification.controller';
import { NotificationRepository } from './modules/notifications/notification.repository';
import { createNotificationRouter } from './modules/notifications/notification.routes';
import { NotificationService } from './modules/notifications/notification.service';
import { UserController } from './modules/users/user.controller';
import { createUserRouter } from './modules/users/user.routes';
import { UserRepository } from './modules/users/user.repository';
import { UserService } from './modules/users/user.service';
import { VideoLearningController } from './modules/video-learning/video-learning.controller';
import { VideoLearningRepository } from './modules/video-learning/video-learning.repository';
import {
  createInstructorVideoLearningRouter,
  createStudentVideoLearningRouter,
} from './modules/video-learning/video-learning.routes';
import { VideoLearningService } from './modules/video-learning/video-learning.service';
import { VideoTranscriptController } from './modules/video-transcripts/video-transcript.controller';
import { VideoTranscriptRepository } from './modules/video-transcripts/video-transcript.repository';
import {
  createInstructorVideoTranscriptRouter,
  createStudentVideoTranscriptRouter,
} from './modules/video-transcripts/video-transcript.routes';
import { VideoTranscriptService } from './modules/video-transcripts/video-transcript.service';
import { VideoController } from './modules/videos/video.controller';
import type { VideoMessagePublisher } from './modules/videos/video.rabbitmq';
import { VideoRepository } from './modules/videos/video.repository';
import { createInstructorVideoRouter } from './modules/videos/video.routes';
import { VideoService } from './modules/videos/video.service';
import { createHealthRouter } from './routes/health.route';
import { createReadinessRouter } from './routes/readiness.route';
import { HttpError } from './shared/http-error';
import { createLogger, type AppLogger } from './shared/logger';
import './shared/request';

interface CreateAppOptions {
  readonly env?: Env;
  readonly logger?: AppLogger;
  readonly prisma?: PrismaClient;
  readonly redis?: Redis;
  readonly rabbitmq?: import('amqplib').ChannelModel;
  readonly storage?: import('minio').Client;
  readonly rateLimiterStore?: RateLimiterStore;
  readonly readinessChecker?: ReadinessChecker;
  readonly videoPublisher?: VideoMessagePublisher;
  readonly codeExecutionPublisher?: CodeExecutionMessagePublisher;
  readonly judgePublisher?: CodeJudgeMessagePublisher;
  readonly projectGradingPublisher?: ProjectGradingMessagePublisher;
  readonly commitResolver?: CommitResolver;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const env = options.env ?? loadEnv();
  const logger = options.logger ?? createLogger(env.NODE_ENV);
  const prisma = options.prisma ?? new PrismaClient();
  const tokenService = new TokenService(env);
  const userRepository = new UserRepository(prisma);
  const sessionRepository = new SessionRepository(prisma);
  const authService = new AuthService(prisma, userRepository, sessionRepository, tokenService, logger);
  const userService = new UserService(userRepository);
  const courseRepository = new CourseRepository(prisma);
  const enrollmentRepository = new EnrollmentRepository(prisma);
  const learningRepository = new LearningRepository(prisma);
  const videoRepository = new VideoRepository(prisma);
  const codeExecutionRepository = new CodeExecutionRepository(prisma);
  const judgeRepository = new JudgeRepository(prisma);
  const practiceRepository = new PracticeRepository(prisma);
  const quizRepository = new QuizRepository(prisma);
  const projectGradingRepository = new ProjectGradingRepository(prisma);
  const videoLearningRepository = new VideoLearningRepository(prisma);
  const videoTranscriptRepository = new VideoTranscriptRepository(prisma);
  const adminRepository = new AdminRepository(prisma);
  const notificationRepository = new NotificationRepository(prisma);
  const courseService = new CourseService(prisma, courseRepository);
  const learningService = new LearningService(prisma, learningRepository);
  const notificationService = new NotificationService(notificationRepository, logger);
  const videoPublisher =
    options.videoPublisher ??
    ({
      publishProcessingRequested: () => undefined,
    } satisfies VideoMessagePublisher);
  const videoService = new VideoService(prisma, videoRepository, options.storage ?? ({} as never), videoPublisher, env, logger);
  const codeExecutionPublisher =
    options.codeExecutionPublisher ??
    ({
      publishExecutionRequested: () => undefined,
    } satisfies CodeExecutionMessagePublisher);
  const codeExecutionService = new CodeExecutionService(prisma, codeExecutionRepository, codeExecutionPublisher, env, logger);
  const videoLearningService = new VideoLearningService(
    prisma,
    videoLearningRepository,
    options.storage ?? ({} as never),
    env,
    logger,
    learningService,
  );
  const enrollmentService = new EnrollmentService(prisma, enrollmentRepository, courseRepository, learningRepository);
  const judgePublisher =
    options.judgePublisher ??
    ({
      publishJudgeRequested: () => undefined,
    } satisfies CodeJudgeMessagePublisher);
  const judgeService = new JudgeService(prisma, judgeRepository, judgePublisher, env, logger, learningService, notificationService);
  const practiceService = new PracticeService(prisma, practiceRepository, judgeService, env);
  const quizService = new QuizService(prisma, quizRepository, learningService);
  const videoTranscriptService = new VideoTranscriptService(prisma, videoTranscriptRepository);
  const projectGradingPublisher =
    options.projectGradingPublisher ??
    ({
      publishProjectGradingRequested: () => undefined,
    } satisfies ProjectGradingMessagePublisher);
  const projectGradingService = new ProjectGradingService(
    prisma,
    projectGradingRepository,
    projectGradingPublisher,
    env,
    logger,
    learningService,
    options.commitResolver,
    notificationService,
  );
  const rateLimiterStore =
    options.rateLimiterStore ??
    (options.redis ? createRedisRateLimiterStore(options.redis) : createMemoryRateLimiterStore());
  const readinessChecker =
    options.readinessChecker ??
    (options.redis && options.rabbitmq && options.storage
      ? createReadinessChecker({
          prisma,
          redis: options.redis,
          rabbitmq: options.rabbitmq,
          storage: options.storage,
          minioBucket: env.MINIO_BUCKET,
        })
      : async () => ({
          postgres: 'error',
          redis: 'error',
          rabbitmq: 'error',
          minio: 'error',
        }));
  const adminService = new AdminService(prisma, adminRepository, readinessChecker, videoService, logger);
  const authController = new AuthController(authService, env);
  const userController = new UserController(userService);
  const courseController = new CourseController(courseService);
  const enrollmentController = new EnrollmentController(enrollmentService);
  const learningController = new LearningController(learningService);
  const videoController = new VideoController(videoService);
  const codeExecutionController = new CodeExecutionController(codeExecutionService);
  const judgeController = new JudgeController(judgeService);
  const practiceController = new PracticeController(practiceService);
  const quizController = new QuizController(quizService);
  const projectGradingController = new ProjectGradingController(projectGradingService);
  const videoLearningController = new VideoLearningController(videoLearningService);
  const videoTranscriptController = new VideoTranscriptController(videoTranscriptService);
  const adminController = new AdminController(adminService);
  const notificationController = new NotificationController(notificationService);
  const app = express();

  app.use(requestContext(logger));
  app.use(cors(env.CORS_ORIGIN));
  app.use(express.json());
  app.use(
    pinoHttp({
      logger,
      customProps: (request) => ({
        requestId: request.requestId,
      }),
      genReqId: (request) => request.requestId,
    }),
  );

  app.use('/api/v1', createHealthRouter());
  app.use('/api/v1', createReadinessRouter(readinessChecker));
  app.use('/api/v1/auth', createAuthRouter(authController, tokenService, rateLimiterStore));
  app.use('/api/v1/admin', createAdminRouter(adminController, tokenService));
  app.use('/api/v1/courses', createCourseEnrollmentRouter(enrollmentController, tokenService));
  app.use('/api/v1/courses', createCourseRouter(courseController));
  app.use('/api/v1/instructor', createInstructorVideoRouter(videoController, tokenService));
  app.use('/api/v1/instructor', createInstructorVideoLearningRouter(videoLearningController, tokenService));
  app.use('/api/v1/instructor', createInstructorVideoTranscriptRouter(videoTranscriptController, tokenService));
  app.use('/api/v1/learning', createLearningRouter(learningController, tokenService));
  app.use('/api/v1/learning', createStudentVideoLearningRouter(videoLearningController, tokenService));
  app.use('/api/v1/learning', createStudentVideoTranscriptRouter(videoTranscriptController, tokenService));
  app.use('/api/v1/learning', createStudentQuizRouter(quizController, tokenService));
  app.use('/api/v1', createCodeExecutionRouter(codeExecutionController, tokenService, rateLimiterStore, env));
  app.use('/api/v1', createJudgeRouter(judgeController, tokenService, rateLimiterStore, env));
  app.use('/api/v1', createPracticeRouter(practiceController, tokenService, rateLimiterStore, env));
  app.use('/api/v1', createProjectGradingRouter(projectGradingController, tokenService, rateLimiterStore, env));
  app.use('/api/v1/notifications', createNotificationRouter(notificationController, tokenService));
  app.use('/api/v1/instructor', createInstructorCourseRouter(courseController, tokenService));
  app.use('/api/v1/instructor', createInstructorPracticeRouter(practiceController, tokenService));
  app.use('/api/v1/instructor', createInstructorQuizRouter(quizController, tokenService));
  app.use('/api/v1/users', createUserEnrollmentRouter(enrollmentController, tokenService));
  app.use('/api/v1/users', createUserRouter(userController, tokenService));

  app.use((_request: Request, _response: Response, next: NextFunction) => {
    next(new HttpError(404, 'ROUTE_NOT_FOUND', 'Route not found'));
  });

  app.use(errorHandler(env.NODE_ENV));

  return app;
}
