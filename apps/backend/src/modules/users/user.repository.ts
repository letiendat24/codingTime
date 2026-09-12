import { RoleName, type Prisma, type PrismaClient } from '@prisma/client';
import type { UserWithRoles } from './user.types';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const includeRoles = {
  roles: {
    include: {
      role: true,
    },
  },
} satisfies Prisma.UserInclude;

type UserRecord = Prisma.UserGetPayload<{ include: typeof includeRoles }>;

function mapUser(record: UserRecord): UserWithRoles {
  return {
    id: record.id,
    email: record.email,
    passwordHash: record.passwordHash,
    displayName: record.displayName,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    roles: record.roles.map((userRole) => userRole.role.name),
  };
}

export class UserRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async findByEmail(email: string): Promise<UserWithRoles | null> {
    const record = await this.prisma.user.findUnique({
      where: { email },
      include: includeRoles,
    });

    return record ? mapUser(record) : null;
  }

  async findById(userId: string): Promise<UserWithRoles | null> {
    const record = await this.prisma.user.findUnique({
      where: { id: userId },
      include: includeRoles,
    });

    return record ? mapUser(record) : null;
  }

  async createStudent(input: {
    readonly email: string;
    readonly passwordHash: string;
    readonly displayName: string;
  }): Promise<UserWithRoles> {
    const studentRole = await this.prisma.role.findUnique({
      where: {
        name: RoleName.STUDENT,
      },
    });

    if (!studentRole) {
      throw new Error('STUDENT role has not been seeded');
    }

    const record = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        roles: {
          create: {
            roleId: studentRole.id,
          },
        },
      },
      include: includeRoles,
    });

    return mapUser(record);
  }
}
