import amqp from 'amqplib';
import { PROJECT_GRADING_QUEUE } from '@codesync/shared';
import { loadWorkerEnv } from './config';
import { handleProjectGradingMessage, setupProjectGradingTopology } from './consumer';
import { logger } from './logger';

async function main() {
  const env = loadWorkerEnv();
  const connection = await amqp.connect(env.RABBITMQ_URL);
  const channel = await setupProjectGradingTopology(connection, env.PROJECT_GRADING_MAX_ATTEMPTS);

  await channel.prefetch(env.PROJECT_GRADING_WORKER_CONCURRENCY);
  await channel.consume(PROJECT_GRADING_QUEUE, async (message) => {
    if (!message) {
      return;
    }

    try {
      await handleProjectGradingMessage({ channel, message, env, logger });
      channel.ack(message);
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : 'unknown' }, 'project grading job failed before result publish');
      channel.nack(message, false, true);
    }
  });

  logger.info({
    environment: env.NODE_ENV,
    concurrency: env.PROJECT_GRADING_WORKER_CONCURRENCY,
  }, 'worker startup success');

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, 'worker shutdown started');
    await channel.close();
    await connection.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  logger.error({ error: error instanceof Error ? error.message : 'unknown' }, 'worker startup failed');
  process.exit(1);
});
