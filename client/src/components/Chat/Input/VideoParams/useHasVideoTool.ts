import { useMemo } from 'react';
import { useAgentsMapContext, useChatContext } from '~/Providers';
import { VIDEO_TOOL_ID } from './state';

/**
 * Whether the conversation's agent can generate video. The controls are only
 * meaningful for such an agent, and a row of format pickers on a plain chat
 * would promise something the turn cannot do.
 */
export default function useHasVideoTool(): boolean {
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const agentId = conversation?.agent_id;

  return useMemo(() => {
    if (!agentId) {
      return false;
    }
    return agentsMap?.[agentId]?.tools?.includes(VIDEO_TOOL_ID) === true;
  }, [agentId, agentsMap]);
}
