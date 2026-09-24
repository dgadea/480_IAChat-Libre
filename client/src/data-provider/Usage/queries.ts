import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type {
  TUsageParams,
  TUsageResponse,
  TProviderBillingResponse,
} from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';

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

/** Provider billing APIs are rate limited and lag a few minutes, so reads are kept for a while */
export const useUsageProvidersQuery = (
  params: TUsageParams,
  config?: UseQueryOptions<TProviderBillingResponse>,
): QueryObserverResult<TProviderBillingResponse> =>
  useQuery<TProviderBillingResponse>(
    [QueryKeys.usageProviders, params],
    () => dataService.getUsageProviders(params),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 10 * 60_000,
      ...config,
    },
  );
