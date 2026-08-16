import { z } from 'zod';

export const systemStateResponseSchema = z.object({
  isPaused: z.boolean(),
  pausedAt: z.string().nullable(),
  pausedByAccountId: z.string().nullable(),
  reason: z.string().nullable(),
});

export type SystemStateResponse = z.infer<typeof systemStateResponseSchema>;

/* A pause always carries a reason, because the first question anyone asks
   afterwards is why trading stopped. */
export const pauseSystemRequestSchema = z.object({
  reason: z.string().min(1).max(280),
});

export type PauseSystemRequest = z.infer<typeof pauseSystemRequestSchema>;

export const auditEntryResponseSchema = z.object({
  id: z.string(),
  actorType: z.string(),
  actorId: z.string(),
  subjectType: z.string(),
  subjectId: z.string(),
  action: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  recordedAt: z.string(),
});

export type AuditEntryResponse = z.infer<typeof auditEntryResponseSchema>;

export const auditPageResponseSchema = z.object({
  items: z.array(auditEntryResponseSchema),
  nextCursor: z.string().nullable(),
});

export type AuditPageResponse = z.infer<typeof auditPageResponseSchema>;
