export const intakeKeys = {
  all: ['intakes'] as const,
  detail: (intakeId: string) => ['intakes', 'detail', intakeId] as const,
  inventory: (status: string) => ['inventory', status] as const,
  exposure: ['exposure'] as const,
};
