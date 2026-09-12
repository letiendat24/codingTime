import amqp from 'amqplib';
import { CODE_EXECUTION_QUEUE } from '@codesync/shared';
import { loadWorkerEnv } from './config';
import { processCodeExecutionMessage, setupCodeExecutionWorkerTopology } from './consumer';
import { log, logError } from './logger';

async function main() {
  const env = loadWorkerEnv();
  const connection = await amqp.connect(env.RABBITMQ_URL);
  const channel = await connection.createChannel();

  await setupCodeExecutionWorkerTopology(channel, env.CODE_EXECUTION_MAX_ATTEMPTS);
  await channel.prefetch(env.CODE_EXECUTION_WORKER_CONCURRENCY);

  log('worker startup success', {
    environment: env.NODE_ENV,
    concurrency: env.CODE_EXECUTION_WORKER_CONCURRENCY,
  });

  await channel.consume(CODE_EXECUTION_QUEUE, async (message) => {
    if (!message) {
      return;
    }

    try {
      await processCodeExecutionMessage({ message, channel, env });
      channel.ack(message);
    } catch {
      channel.nack(message, false, true);
    }
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    log('worker shutdown started', { signal });
    await Promise.allSettled([channel.close(), connection.close()]);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  logError('worker startup failed', {
    errorMessage: error instanceof Error ? error.message : 'Unknown startup error',
  });
  process.exit(1);
});
