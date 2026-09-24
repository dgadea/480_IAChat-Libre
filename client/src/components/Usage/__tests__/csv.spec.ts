import type { TUsageUser } from 'librechat-data-provider';
import { usageCsv } from '../csv';

const totals = { requests: 2, inputTokens: 100, outputTokens: 50, totalTokens: 150, cost: 0.0125 };

describe('usageCsv', () => {
  it('writes one row per user and model, quoting commas and neutralizing formulas', () => {
    const users: TUsageUser[] = [
      {
        userId: 'u1',
        name: 'Gadea, Diego',
        email: '=HYPERLINK("x")',
        ...totals,
        models: [
          { model: 'gpt-5', ...totals },
          { model: '', ...totals, cost: 0 },
        ],
      },
    ];

    expect(usageCsv(users).split('\n')).toEqual([
      'name,email,model,requests,input_tokens,output_tokens,total_tokens,cost_usd',
      '"Gadea, Diego","\'=HYPERLINK(""x"")",gpt-5,2,100,50,150,0.012500',
      '"Gadea, Diego","\'=HYPERLINK(""x"")",,2,100,50,150,0.000000',
    ]);
  });

  it('writes only the header when nobody spent anything', () => {
    expect(usageCsv([])).toBe(
      'name,email,model,requests,input_tokens,output_tokens,total_tokens,cost_usd',
    );
  });
});
