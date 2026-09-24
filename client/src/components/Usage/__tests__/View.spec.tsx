import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import type { TUsageParams, TUsageResponse } from 'librechat-data-provider';
import UsageView from '../View';

const usageData: TUsageResponse = {
  from: '2026-09-01T00:00:00.000Z',
  to: '2026-09-20T00:00:00.000Z',
  summary: {
    users: 1,
    requests: 3,
    inputTokens: 1200,
    outputTokens: 300,
    totalTokens: 1500,
    cost: 5.1,
  },
  users: [
    {
      userId: 'u1',
      name: 'Ana',
      email: 'ana@example.com',
      requests: 3,
      inputTokens: 1200,
      outputTokens: 300,
      totalTokens: 1500,
      cost: 5.1,
      models: [
        {
          model: 'gpt-5',
          requests: 2,
          inputTokens: 1000,
          outputTokens: 300,
          totalTokens: 1300,
          cost: 5,
        },
        {
          model: 'gemini',
          requests: 1,
          inputTokens: 200,
          outputTokens: 0,
          totalTokens: 200,
          cost: 0.1,
        },
      ],
    },
  ],
  models: [],
};

type QueryState = {
  data?: TUsageResponse;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
};

const loaded: QueryState = {
  data: usageData,
  isLoading: false,
  isFetching: false,
  isError: false,
  error: null,
};
const mockUseUsageQuery = jest.fn((_params: TUsageParams): QueryState => loaded);

jest.mock('~/data-provider', () => ({
  useUsageQuery: (params: TUsageParams) => mockUseUsageQuery(params),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: { name?: string }) =>
    options?.name ? `${key}:${options.name}` : key,
  useDocumentTitle: () => undefined,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en', resolvedLanguage: 'en' } }),
}));

jest.mock('~/components/Chat/Menus/OpenSidebar', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('~/components/ui', () => ({
  LocalizedDateRangePicker: () => null,
}));

const lastParams = () => mockUseUsageQuery.mock.calls[mockUseUsageQuery.mock.calls.length - 1][0];

describe('UsageView', () => {
  beforeEach(() => {
    mockUseUsageQuery.mockReset();
    mockUseUsageQuery.mockReturnValue(loaded);
  });

  it('opens on the current month and shows spend per user, expandable by model', async () => {
    const user = userEvent.setup();
    render(<UsageView />);

    const from = new Date(lastParams().fromTimestamp);
    expect(from.getDate()).toBe(1);
    expect(from.getHours()).toBe(0);
    expect(screen.getAllByText('$5.10')).not.toHaveLength(0);
    expect(screen.queryByText('gpt-5')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'com_usage_toggle_models:Ana' });
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('gpt-5')).toBeInTheDocument();
    expect(screen.getByText('$0.10')).toBeInTheDocument();
  });

  it('queries a rolling window when a preset is chosen', async () => {
    const user = userEvent.setup();
    render(<UsageView />);

    await user.click(screen.getByRole('button', { name: 'com_usage_range_7_days' }));

    const { fromTimestamp, toTimestamp } = lastParams();
    const days = (Date.parse(toTimestamp) - Date.parse(fromTimestamp)) / (24 * 60 * 60 * 1000);
    expect(days).toBe(7);
  });

  it('shows the empty state and disables export when nothing was spent', () => {
    mockUseUsageQuery.mockReturnValue({
      ...loaded,
      data: { ...usageData, users: [], summary: { ...usageData.summary, users: 0 } },
    });
    render(<UsageView />);

    expect(screen.getByText('com_usage_no_data')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_usage_export_csv' })).toBeDisabled();
  });

  it('shows loading, then forbidden and generic errors', () => {
    mockUseUsageQuery.mockReturnValue({ ...loaded, data: undefined, isLoading: true });
    const { rerender } = render(<UsageView />);
    expect(screen.getByText('com_usage_loading')).toBeInTheDocument();

    mockUseUsageQuery.mockReturnValue({
      ...loaded,
      data: undefined,
      isError: true,
      error: { response: { status: 403 } },
    });
    rerender(<UsageView />);
    expect(screen.getByRole('alert')).toHaveTextContent('com_usage_forbidden');

    mockUseUsageQuery.mockReturnValue({
      ...loaded,
      data: undefined,
      isError: true,
      error: new Error('down'),
    });
    rerender(<UsageView />);
    expect(screen.getByRole('alert')).toHaveTextContent('com_usage_load_error');
  });
});
