import type { Request, Response } from 'express';
import { HttpError } from '../../shared/http-error';
import { UserService } from './user.service';

export class UserController {
  constructor(private readonly users: UserService) {}

  getMe = async (request: Request, response: Response) => {
    if (!request.auth) {
      throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required');
    }

    const user = await this.users.getCurrentUser(request.auth.userId);
    response.status(200).json({ user });
  };
}
