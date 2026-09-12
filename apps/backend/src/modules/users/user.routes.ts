import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';
import type { TokenService } from '../auth/token.service';
import type { UserController } from './user.controller';

export function createUserRouter(controller: UserController, tokenService: TokenService): Router {
  const router = Router();

  router.get('/me', requireAuth(tokenService), asyncHandler(controller.getMe));

  return router;
}
