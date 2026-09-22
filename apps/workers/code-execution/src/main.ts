import amqp from 'amqplib';
import { CODE_EXECUTION_QUEUE, CODE_EXECUTION_ROUTING_KEYS, CODE_EXCHANGE } from '@codesync/shared';
import { loadWorkerEnv } from './config';
import { processCodeExecutionMessage, setupCodeExecutionWorkerTopology } from './consumer';
import { log, logError } from './logger';

async function main() {
  const env = loadWorkerEnv();
  let shuttingDown = false;

  log('worker configuration loaded', {
    environment: env.NODE_ENV,
    rabbitmqUrl: new URL(env.RABBITMQ_URL).host,
    queue: CODE_EXECUTION_QUEUE,
    exchange: CODE_EXCHANGE,
    routingKey: CODE_EXECUTION_ROUTING_KEYS.requested,
  });

  const connection = await amqp.connect(env.RABBITMQ_URL);
  log('rabbitmq connected', {
    rabbitmqUrl: new URL(env.RABBITMQ_URL).host,
    exchange: CODE_EXCHANGE,
    queue: CODE_EXECUTION_QUEUE,
  });

  const channel = await connection.createChannel();
  connection.on('error', (error) => {
    logError('rabbitmq connection error', {
      errorMessage: error instanceof Error ? error.message : 'Unknown RabbitMQ connection error',
    });
  });
  connection.on('close', () => {
    if (!shuttingDown) {
      logError('rabbitmq connection closed unexpectedly');
    }
  });
  channel.on('error', (error) => {
    logError('rabbitmq channel error', {
      errorMessage: error instanceof Error ? error.message : 'Unknown RabbitMQ channel error',
    });
  });
  channel.on('close', () => {
    if (!shuttingDown) {
      logError('rabbitmq channel closed unexpectedly');
    }
  });

  await setupCodeExecutionWorkerTopology(channel, env.CODE_EXECUTION_MAX_ATTEMPTS);
  await channel.prefetch(env.CODE_EXECUTION_WORKER_CONCURRENCY);

  log('worker startup success', {
    environment: env.NODE_ENV,
    concurrency: env.CODE_EXECUTION_WORKER_CONCURRENCY,
  });

  const consumeResult = await channel.consume(CODE_EXECUTION_QUEUE, async (message) => {
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

  log('consumer registered', {
    queue: CODE_EXECUTION_QUEUE,
    consumerTag: consumeResult.consumerTag,
    prefetch: env.CODE_EXECUTION_WORKER_CONCURRENCY,
  });

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
