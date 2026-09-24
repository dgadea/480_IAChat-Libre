import '@testing-library/jest-dom/extend-expect';
import { useForm, FormProvider, useWatch } from 'react-hook-form';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { MCPToolParam } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { AgentForm } from '~/common';
import ToolParams from '../ToolParams';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const TOOL_ID = 'seedance_mcp_higgsfield';

const params: MCPToolParam[] = [
  { name: 'duration', type: 'integer', minimum: 4, maximum: 30, default: 5 },
  { name: 'resolution', type: 'string', enum: ['480p', '720p'], default: '720p' },
  { name: 'generate_audio', type: 'boolean', description: 'Generate audio with the video.' },
];

function OptionsProbe() {
  const value = useWatch<AgentForm>({ name: 'tool_options' });
  return <span data-testid="options">{JSON.stringify(value ?? null)}</span>;
}

function renderParams(defaultValues: Partial<AgentForm> = {}) {
  function Wrapper({ children }: { children: ReactNode }) {
    const methods = useForm<AgentForm>({ defaultValues: defaultValues as AgentForm });
    return (
      <FormProvider {...methods}>
        {children}
        <OptionsProbe />
      </FormProvider>
    );
  }

  return render(<ToolParams toolId={TOOL_ID} params={params} />, { wrapper: Wrapper });
}

const stored = () => JSON.parse(screen.getByTestId('options').textContent ?? 'null');

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('li') as HTMLElement;
}

function chooseMode(name: string, mode: string) {
  const row = rowOf(name);
  fireEvent.click(within(row).getByRole('combobox', { name: 'com_ui_mcp_param_mode_label' }));
  fireEvent.click(within(row).getByRole('option', { name: mode }));
}

describe('ToolParams', () => {
  test('lists every argument on "model decides" and stores nothing', () => {
    renderParams();

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(stored()).toBeNull();
  });

  test('a default starts from the schema default and only stores values in range', () => {
    renderParams();

    chooseMode('duration', 'com_ui_mcp_param_mode_default');
    expect(stored()).toEqual({
      [TOOL_ID]: { params: { duration: { mode: 'default', value: 5 } } },
    });

    const input = within(rowOf('duration')).getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '45' } });
    expect(stored()).toEqual({});
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('com_ui_mcp_param_invalid')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '10' } });
    expect(stored()).toEqual({
      [TOOL_ID]: { params: { duration: { mode: 'default', value: 10 } } },
    });
  });

  test('a fixed boolean follows its switch', () => {
    renderParams();

    chooseMode('generate_audio', 'com_ui_mcp_param_mode_fixed');
    expect(stored()[TOOL_ID].params.generate_audio).toEqual({ mode: 'fixed', value: false });

    fireEvent.click(within(rowOf('generate_audio')).getByRole('switch'));
    expect(stored()[TOOL_ID].params.generate_audio).toEqual({ mode: 'fixed', value: true });
  });

  test('going back to "model decides" clears the preset but keeps other tool options', () => {
    renderParams({
      tool_options: {
        [TOOL_ID]: {
          defer_loading: true,
          params: { resolution: { mode: 'fixed', value: '480p' } },
        },
      },
    });

    expect(
      within(rowOf('resolution')).getAllByRole('combobox', {
        name: 'com_ui_mcp_param_value_label',
      })[0],
    ).toHaveTextContent('480p');

    chooseMode('resolution', 'com_ui_mcp_param_mode_auto');
    expect(stored()).toEqual({ [TOOL_ID]: { defer_loading: true } });
  });
});
