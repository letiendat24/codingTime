export interface WorkerLogger {
  info(data: Record<string, unknown>, message: string): void;
  warn(data: Record<string, unknown>, message: string): void;
  error(data: Record<string, unknown>, message: string): void;
}

function write(level: 'info' | 'warn' | 'error', data: Record<string, unknown>, message: string) {
  const payload = {
    level,
    timestamp: new Date().toISOString(),
    workerName: 'project-grading',
    message,
    ...data,
  };

  console[level === 'error' ? 'error' : 'log'](JSON.stringify(payload));
}

export const logger: WorkerLogger = {
  info: (data, message) => write('info', data, message),
  warn: (data, message) => write('warn', data, message),
  error: (data, message) => write('error', data, message),
};
