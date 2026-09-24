import { isValidToolParamValue } from 'librechat-data-provider';
import type {
  ToolParamOverride,
  AgentToolOptions,
  ToolParamValue,
  MCPToolParam,
  ToolParamConstraints,
} from 'librechat-data-provider';

/** One input-schema property: its constraints, plus what the model is shown. */
export interface ParamPropertySchema extends ToolParamConstraints {
  description?: string;
  default?: ToolParamValue;
}

/** The object schema of a tool's input. */
export interface ParamObjectSchema {
  properties?: Record<string, ParamPropertySchema>;
  required?: string[];
}

export type ParamOverrides = Record<string, ToolParamOverride>;

type ToolArguments = Record<string, ToolParamValue | object | null | undefined>;

const DEFAULT_NOTE = 'Default for this agent:';

/** The overrides that name a property of `schema` and hold a value that property accepts. */
export function resolveParamOverrides(
  schema: ParamObjectSchema | undefined,
  overrides: ParamOverrides | undefined,
): ParamOverrides {
  const properties = schema?.properties ?? {};
  return Object.fromEntries(
    Object.entries(overrides ?? {}).filter(
      ([name, override]) =>
        (override.mode === 'fixed' || override.mode === 'default') &&
        Object.prototype.hasOwnProperty.call(properties, name) &&
        isValidToolParamValue(properties[name], override.value),
    ),
  );
}

/** The overrides an agent stores for one tool, looked up by the tool's key. */
export function getParamOverrides(
  toolOptions: AgentToolOptions | undefined,
  toolKey: string,
): ParamOverrides | undefined {
  return toolOptions?.[toolKey]?.params;
}

function describeDefault(property: ParamPropertySchema, value: ToolParamValue): string {
  if (property.description?.includes(DEFAULT_NOTE)) {
    return property.description;
  }
  const note = `${DEFAULT_NOTE} ${JSON.stringify(value)}. Keep it unless the user asks for another value.`;
  return property.description ? `${property.description} ${note}` : note;
}

/**
 * The input schema the model is shown once the agent's overrides apply: a fixed property is
 * removed, since the call ignores whatever the model would send, and a default property carries
 * its value and stops being required, since the call fills it in. Applying it twice is harmless.
 */
export function applyParamSchema<T extends ParamObjectSchema>(
  schema: T,
  overrides: ParamOverrides | undefined,
): T {
  const resolved = resolveParamOverrides(schema, overrides);
  const names = Object.keys(resolved);
  if (names.length === 0 || !schema.properties) {
    return schema;
  }

  const properties: Record<string, ParamPropertySchema> = {};
  for (const [name, property] of Object.entries(schema.properties)) {
    const override = resolved[name];
    if (override?.mode === 'fixed') {
      continue;
    }
    properties[name] = override
      ? {
          ...property,
          default: override.value,
          description: describeDefault(property, override.value),
        }
      : property;
  }

  const required = schema.required?.filter((name) => !resolved[name]);
  return { ...schema, properties, ...(required ? { required } : {}) };
}

/**
 * The arguments sent to the MCP server: fixed values replace what the model sent, and default
 * values fill in what it left out. `schema` is the tool's original input schema, which validates
 * the overrides.
 */
export function applyParamArguments<A extends ToolArguments>(
  args: A | undefined,
  schema: ParamObjectSchema | undefined,
  overrides: ParamOverrides | undefined,
): A {
  const resolved = resolveParamOverrides(schema, overrides);
  const merged: ToolArguments = { ...(args ?? {}) };
  for (const [name, override] of Object.entries(resolved)) {
    if (override.mode === 'fixed' || merged[name] === undefined) {
      merged[name] = override.value;
    }
  }
  return merged as A;
}

const PRESETTABLE_TYPES = new Set<MCPToolParam['type']>(['string', 'number', 'integer', 'boolean']);

function presettableType(property: ParamPropertySchema): MCPToolParam['type'] | undefined {
  const types = Array.isArray(property.type) ? property.type : [property.type];
  return types.find((type): type is MCPToolParam['type'] =>
    PRESETTABLE_TYPES.has(type as MCPToolParam['type']),
  );
}

function isParamValue(value: string | number | boolean | null): value is ToolParamValue {
  return value !== null;
}

/**
 * The arguments of a tool's input schema an agent editor can preset: those of a scalar type
 * (string, number, integer, boolean), with their options and bounds. Arrays and objects are left
 * to the model.
 */
export function describeToolParams(schema: ParamObjectSchema | undefined): MCPToolParam[] {
  const required = new Set(schema?.required ?? []);
  return Object.entries(schema?.properties ?? {}).flatMap(([name, property]) => {
    const type = presettableType(property);
    if (!type) {
      return [];
    }
    const options = property.enum?.filter(isParamValue);
    const param: MCPToolParam = {
      name,
      type,
      ...(property.description ? { description: property.description } : {}),
      ...(options?.length ? { enum: options } : {}),
      ...(property.minimum != null ? { minimum: property.minimum } : {}),
      ...(property.maximum != null ? { maximum: property.maximum } : {}),
      ...(property.default != null ? { default: property.default } : {}),
      ...(required.has(name) ? { required: true } : {}),
    };
    return [param];
  });
}
