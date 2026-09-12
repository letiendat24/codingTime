import type { Request, Response } from 'express';
import { HttpError } from '../../shared/http-error';
import {
  notificationIdParamSchema,
  notificationListQuerySchema,
  notificationPreferenceUpdateSchema,
  notificationReadAllSchema,
} from './notification.schemas';
import { NotificationService } from './notification.service';

function requireRequestAuth(request: Request) {
  if (!request.auth) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required');
  }

  return request.auth;
}

export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  list = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const query = notificationListQuerySchema.parse(request.query);
    response.status(200).json(await this.notifications.list(auth.userId, query));
  };

  unreadCount = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    response.status(200).json(await this.notifications.unreadCount(auth.userId));
  };

  markRead = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = notificationIdParamSchema.parse(request.params);
    response.status(200).json(await this.notifications.markRead(auth.userId, params.notificationId));
  };

  markUnread = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const params = notificationIdParamSchema.parse(request.params);
    response.status(200).json(await this.notifications.markUnread(auth.userId, params.notificationId));
  };

  readAll = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const body = notificationReadAllSchema.parse(request.body ?? {});
    response.status(200).json(await this.notifications.markAllRead(auth.userId, body.category));
  };

  getPreferences = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    response.status(200).json(await this.notifications.getPreferences(auth.userId));
  };

  updatePreferences = async (request: Request, response: Response) => {
    const auth = requireRequestAuth(request);
    const body = notificationPreferenceUpdateSchema.parse(request.body);
    response.status(200).json(await this.notifications.updatePreferences(auth.userId, body));
  };
}
