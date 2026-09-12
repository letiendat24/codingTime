export interface WorkerLogger {
  info(context: Record<string, unknown> | string, message?: string): void;
  warn(context: Record<string, unknown> | string, message?: string): void;
  error(context: Record<string, unknown> | string, message?: string): void;
}

function write(level: 'info' | 'warn' | 'error', context: Record<string, unknown> | string, message?: string) {
  const payload = typeof context === 'string'
    ? { level, timestamp: new Date().toISOString(), workerName: 'code-judge', message: context }
    : { level, timestamp: new Date().toISOString(), workerName: 'code-judge', message, ...context };

  console[level === 'error' ? 'error' : 'log'](JSON.stringify(payload));
}

export const logger: WorkerLogger = {
  info: (context, message) => write('info', context, message),
  warn: (context, message) => write('warn', context, message),
  error: (context, message) => write('error', context, message),
};
