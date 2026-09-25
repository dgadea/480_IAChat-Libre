import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService, MutationKeys } from 'librechat-data-provider';
import type {
  TModelPrice,
  TUsageParams,
  TUsageResponse,
  TModelPricesResponse,
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

export const useModelPricesQuery = (
  models: string[],
  config?: UseQueryOptions<TModelPricesResponse>,
): QueryObserverResult<TModelPricesResponse> =>
  useQuery<TModelPricesResponse>(
    [QueryKeys.usagePrices, models],
    () => dataService.getModelPrices(models),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );

/** Every listing includes the edited models, so each one is refetched after a change */
function usePriceMutation<TVariables>(
  mutationKey: MutationKeys,
  mutate: (variables: TVariables) => Promise<TModelPricesResponse>,
) {
  const queryClient = useQueryClient();
  return useMutation<TModelPricesResponse, unknown, TVariables>(mutate, {
    mutationKey: [mutationKey],
    onSuccess: () => queryClient.invalidateQueries([QueryKeys.usagePrices]),
  });
}

export const useSaveModelPriceMutation = () =>
  usePriceMutation<TModelPrice>(MutationKeys.saveModelPrice, dataService.saveModelPrice);

export const useResetModelPriceMutation = () =>
  usePriceMutation<string>(MutationKeys.resetModelPrice, dataService.resetModelPrice);
