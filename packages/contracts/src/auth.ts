import { z } from 'zod';

export const roleSchema = z.enum(['MEMBER', 'VAULT_STAFF', 'OPERATIONS', 'COMPLIANCE']);

export type Role = z.infer<typeof roleSchema>;

export const registerRequestSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(10).max(200),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const accountResponseSchema = z.object({
  id: z.string(),
  email: z.email(),
  roles: z.array(roleSchema),
});

export type AccountResponse = z.infer<typeof accountResponseSchema>;
