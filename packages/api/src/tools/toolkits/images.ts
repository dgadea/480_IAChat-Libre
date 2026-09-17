import type { AgentToolOptions } from 'librechat-data-provider';

/**
 * Resolves the image model for one image-generation tool call, preferring the
 * agent's own `tool_options` over the deployment-wide environment value.
 *
 * Shared by every image tool so a second provider is a new caller rather than a
 * second copy of the precedence rule. An agent that sets nothing keeps the
 * deployment default, so existing agents behave as they did before the
 * per-agent option existed.
 */
export function resolveAgentImageModel({
  toolOptions,
  toolId,
  deploymentModel,
  fallbackModel,
}: {
  toolOptions?: AgentToolOptions | null;
  toolId: string;
  deploymentModel?: string;
  fallbackModel: string;
}): string {
  const agentModel = toolOptions?.[toolId]?.image_model?.trim();
  if (agentModel) {
    return agentModel;
  }
  return deploymentModel || fallbackModel;
}
