import { fetchCurrentAccount } from '@depawn/contracts';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { AccountResponse } from '@depawn/contracts';

export const currentAccountKeys = {
  me: ['me'] as const,
};

export function useCurrentAccount(): UseQueryResult<AccountResponse | null> {
  return useQuery({ queryKey: currentAccountKeys.me, queryFn: fetchCurrentAccount });
}
