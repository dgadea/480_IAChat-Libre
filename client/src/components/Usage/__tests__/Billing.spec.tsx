import React from 'react';
import { render, screen } from '@testing-library/react';
import type { TProviderBillingResponse } from 'librechat-data-provider';
import Billing from '../Billing';

type QueryState = {
  data?: TProviderBillingResponse;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
};

const mockUseUsageProvidersQuery = jest.fn(
  (): QueryState => ({ isLoading: true, isFetching: true, isError: false }),
);

jest.mock('~/data-provider', () => ({
  useUsageProvidersQuery: () => mockUseUsageProvidersQuery(),
}));

const localize = (key: string, options?: Record<string, string>) =>
  options ? `${key}:${Object.values(options).join('|')}` : key;

const params = { fromTimestamp: '2026-09-01T10:00:00Z', toTimestamp: '2026-09-02T10:00:00Z' };

function renderBilling() {
  return render(
    <Billing
      params={params}
      locale="en"
      localize={localize as Parameters<typeof Billing>[0]['localize']}
    />,
  );
}

describe('Billing', () => {
  it('shows a loading state while providers answer', () => {
    renderBilling();
    expect(screen.getByText('com_usage_billing_loading')).toBeInTheDocument();
  });

  it('shows billed cost per model, the missing key, and a rejected key', () => {
    mockUseUsageProvidersQuery.mockReturnValue({
      isLoading: false,
      isFetching: false,
      isError: false,
      data: {
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-03T00:00:00.000Z',
        providers: [
          {
            provider: 'openai',
            configured: true,
            cost: 3.5,
            lines: [
              { name: 'gpt-5', cost: 3.25 },
              { name: 'web search tool calls', cost: 0.25 },
            ],
          },
          { provider: 'anthropic', configured: false, cost: 0, lines: [] },
        ],
      },
    });
    const { rerender } = renderBilling();

    expect(screen.getByText('$3.50')).toBeInTheDocument();
    expect(screen.getByText('gpt-5')).toBeInTheDocument();
    expect(screen.getByText('$0.25')).toBeInTheDocument();
    expect(
      screen.getByText('com_usage_billing_not_configured:ANTHROPIC_ADMIN_KEY'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('com_usage_billing_window:Sep 1, 2026|Sep 2, 2026'),
    ).toBeInTheDocument();

    mockUseUsageProvidersQuery.mockReturnValue({
      isLoading: false,
      isFetching: false,
      isError: false,
      data: {
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-03T00:00:00.000Z',
        providers: [
          { provider: 'openai', configured: true, cost: 0, lines: [], error: 'auth' },
          { provider: 'anthropic', configured: true, cost: 0, lines: [] },
        ],
      },
    });
    rerender(
      <Billing
        params={params}
        locale="en"
        localize={localize as Parameters<typeof Billing>[0]['localize']}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('com_usage_billing_error_auth');
    expect(screen.getByText('com_usage_no_data')).toBeInTheDocument();

    mockUseUsageProvidersQuery.mockReturnValue({
      isLoading: false,
      isFetching: false,
      isError: false,
      data: {
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-03T00:00:00.000Z',
        providers: [
          { provider: 'openai', configured: true, cost: 0, lines: [], error: 'needs_admin_key' },
          { provider: 'anthropic', configured: true, cost: 0, lines: [] },
        ],
      },
    });
    rerender(
      <Billing
        params={params}
        locale="en"
        localize={localize as Parameters<typeof Billing>[0]['localize']}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'com_usage_billing_error_needs_admin_key:OPENAI_ADMIN_KEY',
    );
    expect(screen.getByText('com_usage_no_data')).toBeInTheDocument();
  });

  it('shows an error when the request itself fails', () => {
    mockUseUsageProvidersQuery.mockReturnValue({
      isLoading: false,
      isFetching: false,
      isError: true,
    });
    renderBilling();

    expect(screen.getByRole('alert')).toHaveTextContent('com_usage_billing_error_failed');
  });
});
