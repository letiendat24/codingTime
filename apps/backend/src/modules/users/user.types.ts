import type { RoleName, UserStatus } from '@prisma/client';

export interface UserWithRoles {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly status: UserStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly roles: readonly RoleName[];
}
