import pino from 'pino';

export type AppLogger = pino.Logger;

export function createLogger(environment: string): AppLogger {
  return pino({
    level: environment === 'production' ? 'info' : 'debug',
    base: {
      service: 'codesync-backend',
      environment,
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers.set-cookie',
        '*.password',
        '*.accessToken',
        '*.refreshToken',
        '*.refreshTokenHash',
        '*.JWT_ACCESS_SECRET',
        '*.JWT_REFRESH_SECRET',
        '*.MINIO_SECRET_KEY',
      ],
      remove: true,
    },
  });
}
