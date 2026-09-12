import type { Logger } from 'pino';
import type { RoleName } from '@prisma/client';

export interface AuthContext {
  readonly userId: string;
  readonly sessionId: string;
  readonly roles: readonly RoleName[];
}

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    log: Logger;
    auth?: AuthContext;
  }
}

export {};
