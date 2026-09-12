'use client';

import { useQuery } from '@tanstack/react-query';
import { type CurrentUser, requestJson } from '../lib/api';
import { queryKeys } from '../lib/query/keys';

export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => requestJson<{ user: CurrentUser }>('/users/me'),
    retry: false,
  });
}
