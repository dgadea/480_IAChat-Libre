import { readGeminiUsage, GEMINI_TEXT_OUTPUT_VALUE_KEY } from './gemini';
import { recordVideoUsage } from './usage';

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const txData = {
  user: 'user-1',
  model: 'gemini-omni-1.1-flash',
  conversationId: 'convo-1',
  messageId: 'msg-1',
  balance: null,
  transactions: { enabled: true },
};

describe('readGeminiUsage', () => {
  it('bills video output at the model rate and text plus thoughts at the text rate', () => {
    expect(
      readGeminiUsage({
        total_input_tokens: 120,
        total_output_tokens: 60_000,
        total_thought_tokens: 800,
        output_tokens_by_modality: [
          { modality: 'video', tokens: 57_920 },
          { modality: 'text', tokens: 2080 },
        ],
      }),
    ).toEqual({
      inputTokens: 120,
      outputTokens: 57_920,
      otherOutputs: [{ tokens: 2880, valueKey: GEMINI_TEXT_OUTPUT_VALUE_KEY }],
    });
  });

  it('counts all output as video when the breakdown is missing', () => {
    expect(readGeminiUsage({ total_input_tokens: 5, total_output_tokens: 100 })).toEqual({
      inputTokens: 5,
      outputTokens: 100,
    });
  });

  it('reports nothing when the response carries no usage', () => {
    expect(readGeminiUsage(undefined)).toBeUndefined();
  });
});

describe('recordVideoUsage', () => {
  it('spends the video as one call and the text output under its own value key', async () => {
    const spendTokens = jest.fn().mockResolvedValue(undefined);

    await recordVideoUsage({
      usage: {
        inputTokens: 120,
        outputTokens: 57_920,
        otherOutputs: [{ tokens: 2880, valueKey: 'gemini-omni-text' }],
      },
      spendTokens,
      txData,
    });

    expect(spendTokens).toHaveBeenNthCalledWith(
      1,
      { ...txData, context: 'video_generation' },
      { promptTokens: 120, completionTokens: 57_920 },
    );
    expect(spendTokens).toHaveBeenNthCalledWith(
      2,
      { ...txData, context: 'video_generation', valueKey: 'gemini-omni-text' },
      { completionTokens: 2880 },
    );
  });

  it('records nothing when transactions and balance are both off', async () => {
    const spendTokens = jest.fn();

    await recordVideoUsage({
      usage: { inputTokens: 1, outputTokens: 1 },
      spendTokens,
      txData: { ...txData, transactions: { enabled: false } },
    });

    expect(spendTokens).not.toHaveBeenCalled();
  });

  it('never lets a failed write break the generation', async () => {
    const spendTokens = jest.fn().mockRejectedValue(new Error('db down'));

    await expect(
      recordVideoUsage({ usage: { inputTokens: 1, outputTokens: 1 }, spendTokens, txData }),
    ).resolves.toBeUndefined();
  });
});
