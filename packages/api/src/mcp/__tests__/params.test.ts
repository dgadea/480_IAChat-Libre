import type { ParamObjectSchema, ParamOverrides } from '../params';
import {
  applyParamSchema,
  getParamOverrides,
  describeToolParams,
  applyParamArguments,
  resolveParamOverrides,
} from '../params';
import { buildToolRegistryFromAgentOptions } from '~/tools/classification';

const seedance: ParamObjectSchema = {
  properties: {
    image_url: { type: 'string', description: 'Public URL of the input image.' },
    duration: { type: 'integer', description: 'Seconds.', minimum: 4, maximum: 30, default: 5 },
    resolution: { type: 'string', enum: ['480p', '720p'], default: '720p' },
    generate_audio: { type: 'boolean', description: 'Generate audio with the video.' },
    tags: { type: 'array' },
  },
  required: ['image_url', 'duration', 'resolution'],
};

describe('resolveParamOverrides', () => {
  it('keeps overrides that fit their property and drops stale or unknown ones', () => {
    const overrides: ParamOverrides = {
      duration: { mode: 'default', value: 10 },
      resolution: { mode: 'fixed', value: '1080p' },
      generate_audio: { mode: 'fixed', value: 'yes' },
      removed_param: { mode: 'fixed', value: 'x' },
    };

    expect(resolveParamOverrides(seedance, overrides)).toEqual({
      duration: { mode: 'default', value: 10 },
    });
  });

  it('enforces bounds and integer types', () => {
    expect(
      resolveParamOverrides(seedance, {
        duration: { mode: 'fixed', value: 45 },
      }),
    ).toEqual({});
    expect(
      resolveParamOverrides(seedance, {
        duration: { mode: 'fixed', value: 7.5 },
      }),
    ).toEqual({});
  });
});

describe('applyParamSchema', () => {
  const overrides: ParamOverrides = {
    resolution: { mode: 'fixed', value: '720p' },
    duration: { mode: 'default', value: 10 },
  };

  it('hides fixed arguments and marks defaults, releasing both from required', () => {
    const schema = applyParamSchema(seedance, overrides);

    expect(schema.properties?.resolution).toBeUndefined();
    expect(schema.properties?.duration).toMatchObject({ default: 10 });
    expect(schema.properties?.duration.description).toBe(
      'Seconds. Default for this agent: 10. Keep it unless the user asks for another value.',
    );
    expect(schema.required).toEqual(['image_url']);
    expect(seedance.properties?.resolution).toBeDefined();
  });

  it('is unchanged by a second application', () => {
    const once = applyParamSchema(seedance, overrides);

    expect(applyParamSchema(once, overrides)).toEqual(once);
  });

  it('returns the schema itself when nothing applies', () => {
    expect(applyParamSchema(seedance, undefined)).toBe(seedance);
    expect(applyParamSchema(seedance, { nope: { mode: 'fixed', value: 1 } })).toBe(seedance);
  });
});

describe('applyParamArguments', () => {
  const overrides: ParamOverrides = {
    resolution: { mode: 'fixed', value: '480p' },
    duration: { mode: 'default', value: 10 },
    generate_audio: { mode: 'default', value: false },
  };

  it('forces fixed values over the model and fills defaults it left out', () => {
    const args = applyParamArguments(
      { image_url: 'https://x/a.png', resolution: '720p', generate_audio: true },
      seedance,
      overrides,
    );

    expect(args).toEqual({
      image_url: 'https://x/a.png',
      resolution: '480p',
      duration: 10,
      generate_audio: true,
    });
  });

  it('leaves arguments alone without overrides', () => {
    const args = { image_url: 'https://x/a.png' };
    expect(applyParamArguments(args, seedance, undefined)).toEqual(args);
  });
});

describe('getParamOverrides', () => {
  it('reads the overrides stored under the tool key', () => {
    const params: ParamOverrides = { duration: { mode: 'fixed', value: 8 } };
    expect(
      getParamOverrides({ seedance_mcp_higgsfield: { params } }, 'seedance_mcp_higgsfield'),
    ).toBe(params);
    expect(getParamOverrides(undefined, 'seedance_mcp_higgsfield')).toBeUndefined();
  });
});

describe('describeToolParams', () => {
  it('describes the scalar arguments with their options and bounds, skipping the rest', () => {
    expect(describeToolParams(seedance)).toEqual([
      {
        name: 'image_url',
        type: 'string',
        description: 'Public URL of the input image.',
        required: true,
      },
      {
        name: 'duration',
        type: 'integer',
        description: 'Seconds.',
        minimum: 4,
        maximum: 30,
        default: 5,
        required: true,
      },
      {
        name: 'resolution',
        type: 'string',
        enum: ['480p', '720p'],
        default: '720p',
        required: true,
      },
      { name: 'generate_audio', type: 'boolean', description: 'Generate audio with the video.' },
    ]);
  });

  it('returns nothing for a tool without a schema', () => {
    expect(describeToolParams(undefined)).toEqual([]);
  });
});

describe('tool registry', () => {
  it('shows the model the schema with the agent overrides applied', () => {
    const registry = buildToolRegistryFromAgentOptions(
      [
        {
          name: 'seedance_mcp_higgsfield',
          parameters: { type: 'object', ...seedance } as Parameters<
            typeof buildToolRegistryFromAgentOptions
          >[0][number]['parameters'],
        },
      ],
      {
        seedance_mcp_higgsfield: { params: { resolution: { mode: 'fixed', value: '720p' } } },
      },
    );

    const parameters = registry.get('seedance_mcp_higgsfield')?.parameters;
    expect(parameters?.properties?.resolution).toBeUndefined();
    expect(parameters?.required).toEqual(['image_url', 'duration']);
  });
});
