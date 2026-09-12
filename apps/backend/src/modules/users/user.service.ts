import { UserStatus } from '@prisma/client';
import { HttpError } from '../../shared/http-error';
import type { SafeUser } from '../auth/auth.types';
import { UserRepository } from './user.repository';
import type { UserWithRoles } from './user.types';

export function toSafeUser(user: UserWithRoles): SafeUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    roles: user.roles,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export class UserService {
  constructor(private readonly users: UserRepository) {}

  async getCurrentUser(userId: string): Promise<SafeUser> {
    const user = await this.users.findById(userId);

    if (!user) {
      throw new HttpError(401, 'AUTH_INVALID_TOKEN', 'Invalid or expired access token');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new HttpError(403, 'AUTH_ACCOUNT_INACTIVE', 'Account is not active');
    }

    return toSafeUser(user);
  }
}
