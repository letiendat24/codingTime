type LogValue = string | number | boolean | null | undefined | readonly LogValue[] | { readonly [key: string]: LogValue };

export function log(message: string, context: Record<string, LogValue> = {}) {
  console.log(JSON.stringify({
    level: 'info',
    timestamp: new Date().toISOString(),
    workerName: 'code-execution',
    message,
    ...context,
  }));
}

export function logError(message: string, context: Record<string, LogValue> = {}) {
  console.error(JSON.stringify({
    level: 'error',
    timestamp: new Date().toISOString(),
    workerName: 'code-execution',
    message,
    ...context,
  }));
}
