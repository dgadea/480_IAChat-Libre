import { renderHook } from '@testing-library/react';
import type { Agent, TConversation } from 'librechat-data-provider';
import useHasVideoTool from '../useHasVideoTool';

let mockConversation: Partial<TConversation> | null = null;
let mockAgentsMap: Record<string, Partial<Agent>> | undefined;

jest.mock('~/Providers', () => ({
  useChatContext: () => ({ conversation: mockConversation }),
  useAgentsMapContext: () => mockAgentsMap,
}));

describe('useHasVideoTool', () => {
  beforeEach(() => {
    mockConversation = null;
    mockAgentsMap = undefined;
  });

  it('is false for a conversation with no agent', () => {
    mockConversation = { conversationId: 'c1' };
    expect(renderHook(() => useHasVideoTool()).result.current).toBe(false);
  });

  it('is false when the agent has other tools but not video', () => {
    mockConversation = { conversationId: 'c1', agent_id: 'a1' };
    mockAgentsMap = { a1: { id: 'a1', tools: ['gemini_image_gen', 'web_search'] } };
    expect(renderHook(() => useHasVideoTool()).result.current).toBe(false);
  });

  it('is true when the agent carries the video tool', () => {
    mockConversation = { conversationId: 'c1', agent_id: 'a1' };
    mockAgentsMap = { a1: { id: 'a1', tools: ['gemini_image_gen', 'gemini_video_gen'] } };
    expect(renderHook(() => useHasVideoTool()).result.current).toBe(true);
  });

  it('is false when the agent map has not loaded yet', () => {
    mockConversation = { conversationId: 'c1', agent_id: 'a1' };
    expect(renderHook(() => useHasVideoTool()).result.current).toBe(false);
  });

  it('is false for an agent with no tools at all', () => {
    mockConversation = { conversationId: 'c1', agent_id: 'a1' };
    mockAgentsMap = { a1: { id: 'a1' } };
    expect(renderHook(() => useHasVideoTool()).result.current).toBe(false);
  });
});
