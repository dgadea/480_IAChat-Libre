import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import type { TModelPriceRow } from 'librechat-data-provider';
import Prices from '../Prices';

const rows: TModelPriceRow[] = [
  {
    model: 'gemini-omni-1.1-flash',
    source: 'default',
    rates: { prompt: 6, completion: 6 },
    base: { prompt: 6, completion: 6 },
  },
  {
    model: 'gpt-5',
    source: 'override',
    baseKey: 'gpt-5',
    rates: { prompt: 2, completion: 20, cacheWrite: 1.25, cacheRead: 0.125 },
    base: { prompt: 1.25, completion: 10, cacheWrite: 1.25, cacheRead: 0.125 },
  },
];

const mockSave = {
  mutate: jest.fn(),
  reset: jest.fn(),
  isLoading: false,
  isError: false,
  error: null,
};
const mockReset = { mutate: jest.fn(), isLoading: false, isError: false, variables: undefined };

jest.mock('~/data-provider', () => ({
  useModelPricesQuery: () => ({ data: { prices: rows }, isLoading: false, isError: false }),
  useSaveModelPriceMutation: () => mockSave,
  useResetModelPriceMutation: () => mockReset,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const localize = ((key: string, options?: Record<string, string>) =>
  options ? `${key}:${Object.values(options).join('|')}` : key) as Parameters<
  typeof Prices
>[0]['localize'];

const renderPrices = () =>
  render(<Prices models={['gpt-5', 'gemini-omni-1.1-flash']} locale="en" localize={localize} />);

describe('Prices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSave.isError = false;
    mockSave.error = null;
  });

  it('lists each model with its rates and where they come from', () => {
    renderPrices();

    expect(screen.getByText('com_usage_prices_source_default')).toBeInTheDocument();
    expect(screen.getByText('com_usage_prices_source_override')).toBeInTheDocument();
    expect(screen.getByText('$20.00')).toBeInTheDocument();
    expect(screen.getByText('$0.125')).toBeInTheDocument();
  });

  it('offers a reset only for a model an admin has priced', async () => {
    const user = userEvent.setup();
    renderPrices();

    expect(
      screen.queryByRole('button', { name: 'com_usage_prices_reset:gemini-omni-1.1-flash' }),
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: 'com_usage_prices_reset:gpt-5' }));

    expect(mockReset.mutate).toHaveBeenCalledWith('gpt-5');
  });

  it('saves an edited row, leaving blank cache rates out', async () => {
    const user = userEvent.setup();
    renderPrices();

    await user.click(
      screen.getByRole('button', { name: 'com_usage_prices_edit:gemini-omni-1.1-flash' }),
    );
    const prompt = screen.getByLabelText('com_usage_input_tokens · gemini-omni-1.1-flash');
    const completion = screen.getByLabelText('com_usage_output_tokens · gemini-omni-1.1-flash');
    await user.clear(prompt);
    await user.type(prompt, '1.5');
    await user.clear(completion);
    await user.type(completion, '17.5');
    await user.click(screen.getByRole('button', { name: 'com_ui_save' }));

    expect(mockSave.mutate).toHaveBeenCalledWith(
      { model: 'gemini-omni-1.1-flash', prompt: 1.5, completion: 17.5 },
      expect.anything(),
    );
  });

  it('adds a model by name', async () => {
    const user = userEvent.setup();
    renderPrices();

    await user.click(screen.getByRole('button', { name: 'com_usage_prices_add' }));
    await user.type(screen.getByLabelText('com_usage_model'), 'grok-4.5');
    await user.type(screen.getByLabelText('com_usage_input_tokens · grok-4.5'), '4');
    await user.type(screen.getByLabelText('com_usage_output_tokens · grok-4.5'), '12');
    await user.type(screen.getByLabelText('com_usage_prices_cache_read · grok-4.5'), '0.4');
    await user.click(screen.getByRole('button', { name: 'com_ui_save' }));

    expect(mockSave.mutate).toHaveBeenCalledWith(
      { model: 'grok-4.5', prompt: 4, completion: 12, cacheRead: 0.4 },
      expect.anything(),
    );
  });

  it('refuses an edit without an output rate', async () => {
    const user = userEvent.setup();
    renderPrices();

    await user.click(screen.getByRole('button', { name: 'com_usage_prices_add' }));
    await user.type(screen.getByLabelText('com_usage_model'), 'grok-4.5');
    await user.type(screen.getByLabelText('com_usage_input_tokens · grok-4.5'), '4');
    await user.click(screen.getByRole('button', { name: 'com_ui_save' }));

    expect(mockSave.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('com_usage_prices_invalid');
  });

  it('says so when the admin may not edit prices', () => {
    mockSave.isError = true;
    mockSave.error = { response: { status: 403 } } as unknown as null;
    renderPrices();

    expect(screen.getByRole('alert')).toHaveTextContent('com_usage_prices_forbidden');
  });
});
