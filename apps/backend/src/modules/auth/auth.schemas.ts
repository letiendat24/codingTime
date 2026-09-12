import { z } from 'zod';

const passwordSchema = z.string().min(8).max(128);

export const registerSchema = z.object({
  email: z.string().email().max(320),
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: passwordSchema,
});

export const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
