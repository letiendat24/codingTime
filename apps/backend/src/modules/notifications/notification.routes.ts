import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../shared/async-handler';
import type { TokenService } from '../auth/token.service';
import type { NotificationController } from './notification.controller';

export function createNotificationRouter(controller: NotificationController, tokenService: TokenService): Router {
  const router = Router();
  const authenticated = [requireAuth(tokenService)] as const;

  router.get('/', ...authenticated, asyncHandler(controller.list));
  router.get('/unread-count', ...authenticated, asyncHandler(controller.unreadCount));
  router.post('/read-all', ...authenticated, asyncHandler(controller.readAll));
  router.get('/preferences', ...authenticated, asyncHandler(controller.getPreferences));
  router.put('/preferences', ...authenticated, asyncHandler(controller.updatePreferences));
  router.patch('/:notificationId/read', ...authenticated, asyncHandler(controller.markRead));
  router.patch('/:notificationId/unread', ...authenticated, asyncHandler(controller.markUnread));

  return router;
}
