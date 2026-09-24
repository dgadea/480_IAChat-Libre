import type { TUsageAgent } from 'librechat-data-provider';
import { usageCsv } from '../csv';

const totals = { requests: 2, inputTokens: 100, outputTokens: 50, totalTokens: 150, cost: 0.0125 };
const header =
  'agent,agent_id,name,email,model,requests,input_tokens,output_tokens,total_tokens,cost_usd';
const label = (agent: TUsageAgent) => agent.name || 'No agent';

describe('usageCsv', () => {
  it('writes one row per agent, user and model, quoting commas and neutralizing formulas', () => {
    const agents: TUsageAgent[] = [
      {
        agentId: 'agent_sales',
        name: 'Ventas',
        ...totals,
        users: [
          {
            userId: 'u1',
            name: 'Gadea, Diego',
            email: '=HYPERLINK("x")',
            ...totals,
            models: [{ model: 'gpt-5', ...totals }],
          },
        ],
      },
      {
        agentId: '',
        name: '',
        ...totals,
        users: [
          {
            userId: 'u1',
            name: 'Ana',
            email: 'ana@example.com',
            ...totals,
            models: [{ model: '', ...totals, cost: 0 }],
          },
        ],
      },
    ];

    expect(usageCsv(agents, label).split('\n')).toEqual([
      header,
      'Ventas,agent_sales,"Gadea, Diego","\'=HYPERLINK(""x"")",gpt-5,2,100,50,150,0.012500',
      'No agent,,Ana,ana@example.com,,2,100,50,150,0.000000',
    ]);
  });

  it('writes only the header when nobody spent anything', () => {
    expect(usageCsv([], label)).toBe(header);
  });
});
