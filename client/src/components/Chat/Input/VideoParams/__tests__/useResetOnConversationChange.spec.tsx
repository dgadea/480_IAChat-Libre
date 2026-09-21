import { renderHook } from '@testing-library/react';
import useResetOnConversationChange from '../useResetOnConversationChange';

let mockConversationId: string | null | undefined;

jest.mock('~/Providers', () => ({
  useChatContext: () => ({ conversation: { conversationId: mockConversationId } }),
}));

function renderWithId(id: string | null | undefined) {
  mockConversationId = id;
  const reset = jest.fn();
  const view = renderHook(() => useResetOnConversationChange(reset));
  const rerenderWith = (next: string | null | undefined) => {
    mockConversationId = next;
    view.rerender();
  };
  return { reset, rerenderWith };
}

describe('useResetOnConversationChange', () => {
  it('does not reset on the first render', () => {
    const { reset } = renderWithId('convo-a');
    expect(reset).not.toHaveBeenCalled();
  });

  it('resets when opening a new chat from an existing one', () => {
    const { reset, rerenderWith } = renderWithId('convo-a');
    rerenderWith('new');
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('keeps the settings when a new chat takes its real id', () => {
    const { reset, rerenderWith } = renderWithId('new');
    rerenderWith('convo-a');
    expect(reset).not.toHaveBeenCalled();
  });

  it('resets when switching between two existing conversations', () => {
    const { reset, rerenderWith } = renderWithId('convo-a');
    rerenderWith('convo-b');
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('does not reset when the id has not changed', () => {
    const { reset, rerenderWith } = renderWithId('convo-a');
    rerenderWith('convo-a');
    expect(reset).not.toHaveBeenCalled();
  });

  it('ignores a momentarily absent conversation', () => {
    const { reset, rerenderWith } = renderWithId('convo-a');
    rerenderWith(undefined);
    expect(reset).not.toHaveBeenCalled();
  });

  it('resets once the conversation comes back as a different one', () => {
    const { reset, rerenderWith } = renderWithId('convo-a');
    rerenderWith(undefined);
    rerenderWith('convo-b');
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
