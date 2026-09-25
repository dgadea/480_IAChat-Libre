import { createBillingSources } from './keys';

describe('createBillingSources', () => {
  it('prefers an admin key over the chat key', () => {
    const sources = createBillingSources({
      OPENAI_ADMIN_KEY: 'sk-admin',
      OPENAI_API_KEY: 'sk-chat',
    });
    expect(sources.openai?.usesChatKey).toBe(false);
  });

  it('falls back to the chat key so no second variable is needed', () => {
    const sources = createBillingSources({ ANTHROPIC_API_KEY: 'sk-ant-chat' });
    expect(sources.anthropic?.usesChatKey).toBe(true);
    expect(sources.openai).toBeUndefined();
  });

  it('skips a chat key each user supplies themselves', () => {
    expect(createBillingSources({ OPENAI_API_KEY: 'user_provided' })).toEqual({});
  });
});
