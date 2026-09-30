import type { Channel, ConsumeMessage } from 'amqplib';
import {
  CODE_EXECUTION_DLQ,
  CODE_EXECUTION_QUEUE,
  CODE_EXECUTION_ROUTING_KEYS,
  CODE_EXCHANGE,
  type AsyncMessage,
  type CodeExecutionCompletedPayload,
  type CodeExecutionFailedPayload,
  type CodeExecutionRequestedPayload,
  type CodeExecutionStartedPayload,
  type CodeExecutionTimedOutPayload,
} from '@codesync/shared';
import type { CodeExecutionWorkerEnv } from './config';
import { log, logError } from './logger';
import { getRuntime } from './runtimes';
import { runInDockerSandbox } from './sandbox';

function parseMessage(message: ConsumeMessage): AsyncMessage<CodeExecutionRequestedPayload> {
  return JSON.parse(message.content.toString('utf8')) as AsyncMessage<CodeExecutionRequestedPayload>;
}

function publish<TPayload extends Record<string, unknown>>(input: {
  readonly channel: Channel;
  readonly routingKey: string;
  readonly envelope: AsyncMessage<CodeExecutionRequestedPayload>;
  readonly payload: TPayload;
}) {
  const outgoing: AsyncMessage<TPayload> = {
    jobId: input.envelope.jobId,
    idempotencyKey: input.envelope.idempotencyKey,
    correlationId: input.envelope.correlationId,
    requestedByUserId: input.envelope.requestedByUserId,
    createdAt: new Date().toISOString(),
    payload: input.payload,
  };

  input.channel.publish(CODE_EXCHANGE, input.routingKey, Buffer.from(JSON.stringify(outgoing)), {
    contentType: 'application/json',
    deliveryMode: 2,
    correlationId: outgoing.correlationId,
    messageId: outgoing.jobId,
  });
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown worker error';
}

interface SafeExecutionFailure {
  readonly errorCode: string;
  readonly stderr: string;
  readonly retryable: boolean;
}

const SAFE_GENERATOR_ERROR_CODES = new Set([
  'GENERATOR_EXECUTION_FAILED',
  'GENERATOR_CONTRACT_INVALID',
  'GENERATOR_OUTPUT_LIMIT_EXCEEDED',
  'REFERENCE_SOLUTION_FAILED',
  'EXECUTION_WORKER_FAILED',
]);

function isPracticeOracleMode(mode: CodeExecutionRequestedPayload['executionMode'] | undefined) {
  return mode === 'PRACTICE_ORACLE_BATCH' || mode === 'PRACTICE_GENERATOR_ORACLE';
}

function parseStructuredFailure(stderr: string): SafeExecutionFailure | null {
  const marker = 'CODESYNC_ERROR_JSON:';
  const markerIndex = stderr.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  try {
    const parsed = JSON.parse(stderr.slice(markerIndex + marker.length)) as {
      readonly code?: unknown;
      readonly message?: unknown;
    };
    const errorCode = typeof parsed.code === 'string' && SAFE_GENERATOR_ERROR_CODES.has(parsed.code)
      ? parsed.code
      : 'EXECUTION_WORKER_FAILED';
    const message = typeof parsed.message === 'string' && parsed.message.trim()
      ? parsed.message.trim().slice(0, 500)
      : 'Code execution failed.';

    return {
      errorCode,
      stderr: message,
      retryable: errorCode === 'EXECUTION_WORKER_FAILED',
    };
  } catch {
    return {
      errorCode: 'EXECUTION_RESULT_INVALID',
      stderr: 'Worker result could not be parsed.',
      retryable: false,
    };
  }
}

export function mapSandboxFailure(input: {
  readonly executionMode?: CodeExecutionRequestedPayload['executionMode'];
  readonly stderr: string;
  readonly outputTruncated: boolean;
}): SafeExecutionFailure {
  if (input.executionMode === 'PRACTICE_ORACLE_BATCH') {
    return {
      errorCode: 'REFERENCE_SOLUTION_FAILED',
      stderr: input.stderr.trim() || 'Reference Solution failed while generating expected output.',
      retryable: false,
    };
  }

  if (input.executionMode === 'PRACTICE_GENERATOR_ORACLE') {
    if (input.outputTruncated) {
      return {
        errorCode: 'GENERATOR_OUTPUT_LIMIT_EXCEEDED',
        stderr: 'Generated payload exceeds the configured output limit.',
        retryable: false,
      };
    }

    const structured = parseStructuredFailure(input.stderr);
    if (structured) {
      return structured;
    }
  }

  return {
    errorCode: 'USER_RUNTIME_ERROR',
    stderr: input.stderr,
    retryable: false,
  };
}

export async function setupCodeExecutionWorkerTopology(channel: Channel, maxAttempts: number) {
  await channel.assertExchange(CODE_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(CODE_EXECUTION_DLQ, { durable: true });
  await channel.assertQueue(CODE_EXECUTION_QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': CODE_EXCHANGE,
      'x-dead-letter-routing-key': `${CODE_EXECUTION_ROUTING_KEYS.requested}.dead`,
      'x-queue-type': 'quorum',
      'x-delivery-limit': maxAttempts,
    },
  });
  await channel.bindQueue(CODE_EXECUTION_QUEUE, CODE_EXCHANGE, CODE_EXECUTION_ROUTING_KEYS.requested);
  await channel.bindQueue(CODE_EXECUTION_DLQ, CODE_EXCHANGE, `${CODE_EXECUTION_ROUTING_KEYS.requested}.dead`);

  log('rabbitmq topology ready', {
    exchange: CODE_EXCHANGE,
    queue: CODE_EXECUTION_QUEUE,
    deadLetterQueue: CODE_EXECUTION_DLQ,
    routingKey: CODE_EXECUTION_ROUTING_KEYS.requested,
    deadLetterRoutingKey: `${CODE_EXECUTION_ROUTING_KEYS.requested}.dead`,
    maxAttempts,
  });
}

export async function processCodeExecutionMessage(input: {
  readonly message: ConsumeMessage;
  readonly channel: Channel;
  readonly env: CodeExecutionWorkerEnv;
}) {
  const envelope = parseMessage(input.message);

  log('execution worker received job', {
    executionId: envelope.payload.executionId,
    jobId: envelope.jobId,
    correlationId: envelope.correlationId,
    language: envelope.payload.language,
    executionMode: envelope.payload.executionMode ?? 'DIRECT',
    hasStdin: envelope.payload.stdin !== undefined,
  });

  try {
    const runtime = getRuntime(envelope.payload.language);

    if (
      (envelope.payload.executionMode === 'FUNCTION' || envelope.payload.executionMode === 'PRACTICE_ORACLE_BATCH') &&
      envelope.payload.stdin === undefined
    ) {
      publish<CodeExecutionFailedPayload>({
        channel: input.channel,
        routingKey: CODE_EXECUTION_ROUTING_KEYS.failed,
        envelope,
        payload: {
          executionId: envelope.payload.executionId,
          exitCode: null,
          stdout: '',
          stderr: 'Practice execution input was not provided by the API.',
          durationMs: 0,
          memoryBytes: null,
          errorCode: 'EXECUTION_INPUT_MISSING',
          retryable: false,
        },
      });
      logError('practice execution missing stdin', {
        executionId: envelope.payload.executionId,
        jobId: envelope.jobId,
      });
      return;
    }

    publish<CodeExecutionStartedPayload>({
      channel: input.channel,
      routingKey: CODE_EXECUTION_ROUTING_KEYS.started,
      envelope,
      payload: { executionId: envelope.payload.executionId },
    });

    log('sandbox created', { executionId: envelope.payload.executionId, jobId: envelope.jobId });
    const result = await runInDockerSandbox({
      executionId: envelope.payload.executionId,
      jobId: envelope.jobId,
      runtime,
      entryFile: envelope.payload.entryFile,
      files: envelope.payload.files,
      ...(envelope.payload.executionMode ? { executionMode: envelope.payload.executionMode } : {}),
      ...(envelope.payload.stdin !== undefined ? { stdin: envelope.payload.stdin } : {}),
      env: input.env,
    });
    const stderr = result.outputTruncated ? `${result.stderr}\n[CodeSync output truncated]` : result.stderr;

    if (result.status === 'timed_out') {
      const oracleTimeout = isPracticeOracleMode(envelope.payload.executionMode);
      publish<CodeExecutionTimedOutPayload>({
        channel: input.channel,
        routingKey: CODE_EXECUTION_ROUTING_KEYS.timedOut,
        envelope,
        payload: {
          executionId: envelope.payload.executionId,
          stdout: result.stdout,
          stderr: oracleTimeout ? 'Reference Solution timed out while generating expected output.' : stderr,
          durationMs: result.durationMs,
          errorCode: oracleTimeout ? 'REFERENCE_SOLUTION_TIMEOUT' : 'EXECUTION_TIMED_OUT',
        },
      });
      log('execution timed out', {
        executionId: envelope.payload.executionId,
        jobId: envelope.jobId,
        durationMs: result.durationMs,
        executionMode: envelope.payload.executionMode ?? 'DIRECT',
        safeErrorCode: oracleTimeout ? 'REFERENCE_SOLUTION_TIMEOUT' : 'EXECUTION_TIMED_OUT',
      });
      return;
    }

    if (result.exitCode === 0 && !(envelope.payload.executionMode === 'PRACTICE_GENERATOR_ORACLE' && result.outputTruncated)) {
      publish<CodeExecutionCompletedPayload>({
        channel: input.channel,
        routingKey: CODE_EXECUTION_ROUTING_KEYS.completed,
        envelope,
        payload: {
          executionId: envelope.payload.executionId,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr,
          durationMs: result.durationMs,
          memoryBytes: null,
        },
      });
    } else {
      const failure = mapSandboxFailure({
        executionMode: envelope.payload.executionMode,
        stderr,
        outputTruncated: result.outputTruncated,
      });
      publish<CodeExecutionFailedPayload>({
        channel: input.channel,
        routingKey: CODE_EXECUTION_ROUTING_KEYS.failed,
        envelope,
        payload: {
          executionId: envelope.payload.executionId,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: failure.stderr,
          durationMs: result.durationMs,
          memoryBytes: null,
          errorCode: failure.errorCode,
          retryable: failure.retryable,
        },
      });
    }

    log('execution finished', {
      executionId: envelope.payload.executionId,
      jobId: envelope.jobId,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      executionMode: envelope.payload.executionMode ?? 'DIRECT',
    });
  } catch (error) {
    const errorMessage = safeErrorMessage(error);
    logError('execution infrastructure failure', {
      executionId: envelope.payload.executionId,
      jobId: envelope.jobId,
      errorMessage,
    });
    publish<CodeExecutionFailedPayload>({
      channel: input.channel,
      routingKey: CODE_EXECUTION_ROUTING_KEYS.failed,
      envelope,
      payload: {
        executionId: envelope.payload.executionId,
        exitCode: null,
        stdout: '',
        stderr: 'Code execution worker failed before producing a sandbox result.',
        durationMs: 0,
        memoryBytes: null,
        errorCode: 'EXECUTION_WORKER_FAILED',
        retryable: true,
      },
    });
  } finally {
    log('sandbox removed', { executionId: envelope.payload.executionId, jobId: envelope.jobId });
  }
}
