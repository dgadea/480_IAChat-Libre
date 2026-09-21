import { useGetAgentByIdQuery } from '~/data-provider';
import { useChatContext } from '~/Providers';
import { VIDEO_TOOL_ID } from './state';

/**
 * Whether the conversation's agent can generate video. The controls are only
 * meaningful for such an agent, and a row of format pickers on a plain chat
 * would promise something the turn cannot do.
 *
 * Reads the agent's detail record rather than the catalog in `AgentsMapContext`:
 * the list projection omits `tools` unless the caller asks for the execution
 * config, so every agent looks toolless there. The query is shared with the
 * agent side panel and does not refetch on mount, so this is usually a cache
 * read rather than a request.
 */
export default function useHasVideoTool(): boolean {
  const { conversation } = useChatContext();
  const { data: agent } = useGetAgentByIdQuery(conversation?.agent_id);
  return agent?.tools?.includes(VIDEO_TOOL_ID) === true;
}
