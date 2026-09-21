import { renderHook } from '@testing-library/react';
import type { Agent, TConversation } from 'librechat-data-provider';
import useHasVideoTool from '../useHasVideoTool';

let mockConversation: Partial<TConversation> | null = null;
let mockAgent: Partial<Agent> | undefined;
const mockQuery = jest.fn();

jest.mock('~/Providers', () => ({
  useChatContext: () => ({ conversation: mockConversation }),
}));

jest.mock('~/data-provider', () => ({
  useGetAgentByIdQuery: (agentId?: string | null) => {
    mockQuery(agentId);
    return { data: mockAgent };
  },
}));

describe('useHasVideoTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConversation = null;
    mockAgent = undefined;
  });

  it('is false for a conversation with no agent', () => {
    mockConversation = { conversationId: 'c1' };
    expect(renderHook(() => useHasVideoTool()).result.current).toBe(false);
    expect(mockQuery).toHaveBeenCalledWith(undefined);
  });

  it('is false while the agent record is still loading', () => {
    mockConversation = { conversationId: 'c1', agent_id: 'a1' };
    expect(renderHook(() => useHasVideoTool()).result.current).toBe(false);
  });

  it('is false when the agent has other tools but not video', () => {
    mockConversation = { conversationId: 'c1', agent_id: 'a1' };
    mockAgent = { id: 'a1', tools: ['gemini_image_gen', 'web_search'] };
    expect(renderHook(() => useHasVideoTool()).result.current).toBe(false);
  });

  it('is true when the agent carries the video tool', () => {
    mockConversation = { conversationId: 'c1', agent_id: 'a1' };
    mockAgent = { id: 'a1', tools: ['gemini_image_gen', 'gemini_video_gen'] };
    expect(renderHook(() => useHasVideoTool()).result.current).toBe(true);
  });

  it('is false for an agent whose record carries no tools at all', () => {
    mockConversation = { conversationId: 'c1', agent_id: 'a1' };
    mockAgent = { id: 'a1' };
    expect(renderHook(() => useHasVideoTool()).result.current).toBe(false);
  });

  it('asks for the conversation agent by id', () => {
    mockConversation = { conversationId: 'c1', agent_id: 'a1' };
    renderHook(() => useHasVideoTool());
    expect(mockQuery).toHaveBeenCalledWith('a1');
  });
});
