import { LocalStorageKeys } from 'librechat-data-provider';
import type {
  TPreset,
  TConversation,
  EModelEndpoint,
  TEndpointsConfig,
} from 'librechat-data-provider';
import { getLocalStorageItems } from './localStorage';
import { mapEndpoints } from './endpoints';

type TConvoSetup = Partial<TPreset> | Partial<TConversation>;

type TDefaultEndpoint = { convoSetup: TConvoSetup; endpointsConfig: TEndpointsConfig };

const getEndpointFromSetup = (
  convoSetup: TConvoSetup | null,
  endpointsConfig: TEndpointsConfig,
): EModelEndpoint | null => {
  let { endpoint: targetEndpoint = '' } = convoSetup || {};
  targetEndpoint = targetEndpoint ?? '';
  if (targetEndpoint && endpointsConfig?.[targetEndpoint]) {
    return targetEndpoint as EModelEndpoint;
  } else if (targetEndpoint) {
    console.warn(`Illegal target endpoint ${targetEndpoint}`, endpointsConfig);
  }
  return null;
};

/**
 * The last endpoint the user chatted with that was a plain model.
 *
 * Preferred over the stored setup so that picking an agent for one conversation
 * does not make it the starting point of every later one: the setup key only
 * ever holds the most recent conversation, whatever kind it was.
 */
const getChatEndpointFromLocalStorage = (endpointsConfig: TEndpointsConfig) => {
  try {
    const endpoint = localStorage.getItem(LocalStorageKeys.LAST_CHAT_ENDPOINT);
    return endpoint && endpointsConfig?.[endpoint] != null ? (endpoint as EModelEndpoint) : null;
  } catch (error) {
    console.error(error);
    return null;
  }
};

const getEndpointFromLocalStorage = (endpointsConfig: TEndpointsConfig) => {
  try {
    const { lastConversationSetup } = getLocalStorageItems();
    const { endpoint } = lastConversationSetup ?? { endpoint: null };
    const isDefaultConfig = Object.values(endpointsConfig ?? {}).every((value) => !value);

    if (isDefaultConfig && endpoint) {
      return endpoint;
    }

    if (isDefaultConfig && endpoint) {
      return endpoint;
    }

    return endpoint && endpointsConfig?.[endpoint] != null ? endpoint : null;
  } catch (error) {
    console.error(error);
    return null;
  }
};

const getDefinedEndpoint = (endpointsConfig: TEndpointsConfig) => {
  const endpoints = mapEndpoints(endpointsConfig);
  return endpoints.find((e) => Object.hasOwn(endpointsConfig ?? {}, e));
};

const getDefaultEndpoint = ({
  convoSetup,
  endpointsConfig,
}: TDefaultEndpoint): EModelEndpoint | undefined => {
  return (
    getEndpointFromSetup(convoSetup, endpointsConfig) ||
    getChatEndpointFromLocalStorage(endpointsConfig) ||
    getEndpointFromLocalStorage(endpointsConfig) ||
    getDefinedEndpoint(endpointsConfig)
  );
};

export default getDefaultEndpoint;
