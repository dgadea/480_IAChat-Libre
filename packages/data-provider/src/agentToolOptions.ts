import {
  actionDelimiter,
  actionDomainSeparator,
  isActionTool,
  type AgentToolOptions,
  type AllowedCaller,
  type ToolParamValue,
} from './types/tools';

const actionDomainSeparatorRegex = new RegExp(actionDomainSeparator, 'g');

/**
 * Collapses the encoded-domain suffix of an action tool name to the shape used
 * by runtime tool definitions. The operation id is deliberately preserved.
 */
export function normalizeActionToolName(toolName: string): string {
  if (!isActionTool(toolName)) {
    return toolName;
  }
  const delimiterIndex = toolName.lastIndexOf(actionDelimiter);
  const prefixEnd = delimiterIndex + actionDelimiter.length;
  const encodedDomain = toolName.slice(prefixEnd);
  return toolName.slice(0, prefixEnd) + encodedDomain.replace(actionDomainSeparatorRegex, '_');
}

/**
 * Removes Code Interpreter as an allowed caller without mutating the input.
 * Tool entries and unrelated options are preserved; an empty entry is removed.
 */
export function removeCodeExecutionCaller(
  toolOptions: AgentToolOptions | undefined,
): AgentToolOptions | undefined {
  if (toolOptions == null) {
    return toolOptions;
  }

  const normalized: AgentToolOptions = {};
  for (const [toolName, options] of Object.entries(toolOptions)) {
    const callers = options.allowed_callers;
    if (callers?.includes('code_execution') !== true) {
      normalized[toolName] = options;
      continue;
    }

    const allowedCallers = callers.filter(
      (caller): caller is AllowedCaller => caller !== 'code_execution',
    );
    const { allowed_callers: _removed, ...remainingOptions } = options;
    const nextOptions =
      allowedCallers.length > 0
        ? { ...remainingOptions, allowed_callers: allowedCallers }
        : remainingOptions;
    if (Object.keys(nextOptions).length > 0) {
      normalized[toolName] = nextOptions;
    }
  }

  return normalized;
}

/** The parts of a tool argument's schema a preset value is checked against. */
export interface ToolParamConstraints {
  type?: string | string[];
  enum?: ReadonlyArray<string | number | boolean | null>;
  minimum?: number;
  maximum?: number;
}

function acceptsParamType(constraints: ToolParamConstraints, value: ToolParamValue): boolean {
  const types = Array.isArray(constraints.type) ? constraints.type : [constraints.type];
  return types.some((type) => {
    switch (type) {
      case undefined:
        return true;
      case 'string':
        return typeof value === 'string';
      case 'boolean':
        return typeof value === 'boolean';
      case 'integer':
        return Number.isInteger(value);
      case 'number':
        return typeof value === 'number' && Number.isFinite(value);
      default:
        return false;
    }
  });
}

function withinParamBounds(constraints: ToolParamConstraints, value: ToolParamValue): boolean {
  if (typeof value !== 'number') {
    return true;
  }
  return (
    (constraints.minimum == null || value >= constraints.minimum) &&
    (constraints.maximum == null || value <= constraints.maximum)
  );
}

/**
 * Whether a preset value fits the argument it targets: one of its options when it lists them,
 * otherwise its type and bounds. Shared by the agent editor, which refuses to store a value that
 * does not fit, and the server, which drops a stored value the tool's schema no longer accepts.
 */
export function isValidToolParamValue(
  constraints: ToolParamConstraints | undefined,
  value: ToolParamValue,
): boolean {
  if (!constraints) {
    return false;
  }
  if (constraints.enum) {
    return constraints.enum.includes(value);
  }
  return acceptsParamType(constraints, value) && withinParamBounds(constraints, value);
}
