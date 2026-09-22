import { LocalStorageKeys } from 'librechat-data-provider';
import type { TEndpointsConfig } from 'librechat-data-provider';
import getDefaultEndpoint from '../getDefaultEndpoint';

const endpointsConfig = {
  google: { order: 0 },
  anthropic: { order: 1 },
  agents: { order: 2 },
} as unknown as TEndpointsConfig;

const storeSetup = (setup: Record<string, unknown>) =>
  localStorage.setItem(`${LocalStorageKeys.LAST_CONVO_SETUP}_0`, JSON.stringify(setup));

describe('getDefaultEndpoint', () => {
  beforeEach(() => localStorage.clear());

  it('honours an explicit setup over anything remembered', () => {
    localStorage.setItem(LocalStorageKeys.LAST_CHAT_ENDPOINT, 'google');
    expect(getDefaultEndpoint({ convoSetup: { endpoint: 'anthropic' }, endpointsConfig })).toBe(
      'anthropic',
    );
  });

  it('opens a new chat on the last plain model, not the agent used since', () => {
    localStorage.setItem(LocalStorageKeys.LAST_CHAT_ENDPOINT, 'anthropic');
    storeSetup({ endpoint: 'agents', agent_id: 'agent-1' });

    expect(getDefaultEndpoint({ convoSetup: {}, endpointsConfig })).toBe('anthropic');
  });

  it('falls back to the stored setup when no chat endpoint is remembered yet', () => {
    storeSetup({ endpoint: 'anthropic' });
    expect(getDefaultEndpoint({ convoSetup: {}, endpointsConfig })).toBe('anthropic');
  });

  it('ignores a remembered endpoint the deployment no longer offers', () => {
    localStorage.setItem(LocalStorageKeys.LAST_CHAT_ENDPOINT, 'openAI');
    storeSetup({ endpoint: 'anthropic' });
    expect(getDefaultEndpoint({ convoSetup: {}, endpointsConfig })).toBe('anthropic');
  });

  it('falls back to the first configured endpoint when nothing is remembered', () => {
    expect(getDefaultEndpoint({ convoSetup: {}, endpointsConfig })).toBe('google');
  });
});
