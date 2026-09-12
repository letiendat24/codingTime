export function log(message: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    level: 'info',
    timestamp: new Date().toISOString(),
    workerName: 'video-processing',
    message,
    ...fields,
  }));
}

export function logError(message: string, fields: Record<string, unknown> = {}) {
  console.error(JSON.stringify({
    level: 'error',
    timestamp: new Date().toISOString(),
    workerName: 'video-processing',
    message,
    ...fields,
  }));
}
