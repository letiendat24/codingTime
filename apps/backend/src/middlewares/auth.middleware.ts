import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { RoleName } from '@prisma/client';
import { HttpError } from '../shared/http-error';
import type { TokenService } from '../modules/auth/token.service';

export function requireAuth(tokenService: TokenService): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction) => {
    const authorization = request.header('authorization');
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : (typeof request.query.token === 'string' ? request.query.token : undefined);

    if (!token) {
      next(new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required'));
      return;
    }

    try {
      request.auth = tokenService.verifyAccessToken(token);
      next();
    } catch {
      next(new HttpError(401, 'AUTH_INVALID_TOKEN', 'Invalid or expired access token'));
    }
  };
}

export function requireRole(role: RoleName): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.auth) {
      next(new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required'));
      return;
    }

    if (!request.auth.roles.includes(role)) {
      next(new HttpError(403, 'AUTH_FORBIDDEN', 'Insufficient role'));
      return;
    }

    next();
  };
}
