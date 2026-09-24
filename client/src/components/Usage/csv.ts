import type { TUsageUser } from 'librechat-data-provider';

const header = [
  'name',
  'email',
  'model',
  'requests',
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'cost_usd',
];

/** Quotes a cell when it could break the row, and neutralizes spreadsheet formulas */
function cell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value === 'string' ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One row per user and model, so the file pivots cleanly in a spreadsheet */
export function usageCsv(users: TUsageUser[]): string {
  const rows = users.flatMap((user) =>
    user.models.map((model) =>
      [
        user.name,
        user.email,
        model.model,
        model.requests,
        model.inputTokens,
        model.outputTokens,
        model.totalTokens,
        model.cost.toFixed(6),
      ]
        .map(cell)
        .join(','),
    ),
  );
  return [header.join(','), ...rows].join('\n');
}

export function downloadCsv(content: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
