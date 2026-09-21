import type { VideoTreatment, VideoSound } from './direction';

export interface VideoToolContextParams {
  aspect_ratio?: string;
  resolution?: string;
  treatment?: VideoTreatment;
  sound?: VideoSound;
}

/** How each shape frames a shot, so the model composes for it instead of
 *  describing a wide vista that a portrait frame will crop to nothing. */
const ASPECT_GUIDANCE: Record<string, string> = {
  '16:9': 'a wide landscape frame — room for horizontal movement and negative space',
  '9:16':
    'a tall portrait frame — subjects read close and centred, and wide establishing shots crop badly',
};

const TREATMENT_LABEL: Record<VideoTreatment, string> = {
  live_action: 'live action',
  animation: '2D animation',
  '3d': '3D CG animation',
  motion_graphics: 'motion graphics',
};

const SOUND_LABEL: Record<VideoSound, string> = {
  ambient: 'ambient sound only',
  music: 'a music track',
  silent: 'no audio',
};

/**
 * Tells the model what the user selected in the composer.
 *
 * Without this the model is blind to its own output format: the settings are
 * applied to the call after it has written the prompt, so it can compose a wide
 * horizontal shot for a portrait clip and never know. It learns the real values
 * from the tool's result, which fixes the second generation and not the first —
 * usually the one that matters.
 *
 * Returns an empty string when nothing is selected, so an unset composer adds
 * no instructions.
 */
export function buildVideoToolContext(params: VideoToolContextParams): string {
  const lines: string[] = [];

  if (params.aspect_ratio) {
    const guidance = ASPECT_GUIDANCE[params.aspect_ratio];
    lines.push(`- Format: ${params.aspect_ratio}${guidance ? ` — ${guidance}` : ''}`);
  }
  if (params.resolution) {
    lines.push(`- Resolution: ${params.resolution}`);
  }
  if (params.treatment) {
    lines.push(`- Treatment: ${TREATMENT_LABEL[params.treatment]}`);
  }
  if (params.sound) {
    lines.push(`- Sound: ${SOUND_LABEL[params.sound]}`);
  }

  if (lines.length === 0) {
    return '';
  }

  return [
    'The user set these in the composer controls. They are applied to your `gemini_video_gen` call regardless of what you pass, so treat them as fixed:',
    lines.join('\n'),
    'Compose the shot for this format rather than describing one the frame cannot hold. These live in controls above the message box, not in chat — if the user asks to change one, say where it is instead of accepting it as an instruction. If what they describe does not suit the selected format, say so before generating rather than producing a clip that crops badly.',
  ].join('\n\n');
}

/** The tool's full context: the images available to it, then the settings the
 *  composer has fixed for this turn. */
export function composeVideoToolContext({
  imageContext,
  params,
}: {
  imageContext: string;
  params: VideoToolContextParams;
}): string {
  return [imageContext, buildVideoToolContext(params)].filter(Boolean).join('\n\n');
}
