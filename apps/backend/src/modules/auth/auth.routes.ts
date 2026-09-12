import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { rateLimit, type RateLimiterStore } from '../../middlewares/rate-limit';
import { asyncHandler } from '../../shared/async-handler';
import type { AuthController } from './auth.controller';
import type { TokenService } from './token.service';

export function createAuthRouter(
  controller: AuthController,
  tokenService: TokenService,
  rateLimiterStore: RateLimiterStore,
): Router {
  const router = Router();
  const authRateLimit = rateLimit({
    store: rateLimiterStore,
    windowMs: 60_000,
    maxRequests: 20,
    keyPrefix: 'auth',
  });

  router.post('/register', authRateLimit, asyncHandler(controller.register));
  router.post('/login', authRateLimit, asyncHandler(controller.login));
  router.post('/refresh', authRateLimit, asyncHandler(controller.refresh));
  router.post('/logout', requireAuth(tokenService), asyncHandler(controller.logout));
  router.post('/logout-all', requireAuth(tokenService), asyncHandler(controller.logoutAll));
  router.get('/sessions', requireAuth(tokenService), asyncHandler(controller.listSessions));
  router.delete('/sessions/:sessionId', requireAuth(tokenService), asyncHandler(controller.revokeSession));

  return router;
}
