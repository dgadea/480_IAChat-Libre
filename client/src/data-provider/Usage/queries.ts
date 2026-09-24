import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type { TUsageParams, TUsageResponse } from 'librechat-data-provider';

export const useUsageQuery = (
  params: TUsageParams,
  config?: UseQueryOptions<TUsageResponse>,
): QueryObserverResult<TUsageResponse> =>
  useQuery<TUsageResponse>([QueryKeys.usage, params], () => dataService.getUsage(params), {
    keepPreviousData: true,
    refetchOnWindowFocus: false,
    retry: false,
    ...config,
  });
