import { createServer } from 'node:http';
import { createApp } from './app';
import { loadEnv } from './config';
import { closeInfrastructure, initializeInfrastructure } from './infrastructure';
import { createLogger } from './shared/logger';

function closeHttpServer(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function shutdownTimeout(milliseconds: number) {
  return new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error('Graceful shutdown timed out')), milliseconds).unref();
  });
}

async function bootstrap() {
  const env = loadEnv();
  const logger = createLogger(env.NODE_ENV);
  const infrastructure = await initializeInfrastructure(env, logger);
  const app = createApp({
    env,
    logger,
    prisma: infrastructure.prisma,
    redis: infrastructure.redis,
    rabbitmq: infrastructure.rabbitmq,
    storage: infrastructure.storage,
    videoPublisher: infrastructure.videoPublisher,
    codeExecutionPublisher: infrastructure.codeExecutionPublisher,
    judgePublisher: infrastructure.judgePublisher,
    projectGradingPublisher: infrastructure.projectGradingPublisher,
  });
  const server = createServer(app);
  let isShuttingDown = false;

  server.listen(env.API_PORT, () => {
    logger.info(
      {
        environment: env.NODE_ENV,
        port: env.API_PORT,
        apiBasePath: '/api/v1',
      },
      'Backend startup success',
    );
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown started');

    try {
      await Promise.race([closeHttpServer(server), shutdownTimeout(10_000)]);
      await closeInfrastructure(infrastructure, logger);
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Graceful shutdown failed');
      await closeInfrastructure(infrastructure, logger);
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error: unknown) => {
  const logger = createLogger(process.env.NODE_ENV ?? 'development');
  logger.fatal({ error }, 'Backend startup failed');
  process.exit(1);
});
