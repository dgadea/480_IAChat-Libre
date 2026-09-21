import { useRef, useEffect } from 'react';
import { Constants } from 'librechat-data-provider';
import { useChatContext } from '~/Providers';

/**
 * Runs `reset` when the composer moves to a different conversation, so opening
 * a new chat starts from the defaults instead of inheriting whatever the last
 * one was set to.
 *
 * Skips one transition on purpose: a new conversation is `new` until its first
 * message is sent, then takes its real id. That is the same conversation
 * gaining an identity, not a move — resetting there would discard the settings
 * the user chose moments earlier, silently changing what the next generation in
 * that chat produces.
 */
export default function useResetOnConversationChange(reset: () => void): void {
  const { conversation } = useChatContext();
  const conversationId = conversation?.conversationId;
  const previousId = useRef(conversationId);

  useEffect(() => {
    const previous = previousId.current;
    previousId.current = conversationId;

    if (!conversationId || conversationId === previous) {
      return;
    }
    const isPromotion = previous === Constants.NEW_CONVO;
    if (!isPromotion) {
      reset();
    }
  }, [conversationId, reset]);
}
