export const VIDEO_TREATMENTS = ['live_action', 'animation', '3d', 'motion_graphics'] as const;
export const VIDEO_SOUND = ['ambient', 'music', 'silent'] as const;

export type VideoTreatment = (typeof VIDEO_TREATMENTS)[number];
export type VideoSound = (typeof VIDEO_SOUND)[number];

export interface VideoDirection {
  treatment?: VideoTreatment;
  sound?: VideoSound;
}

/**
 * Treatment and sound are creative direction, not API arguments: no video
 * provider exposes a field for either, so the only way to apply them is to say
 * so in the prompt. That makes them a request rather than a guarantee — unlike
 * aspect ratio and resolution, which the provider enforces.
 *
 * Written as instructions to the model that renders the clip, in English
 * because that is what these models are trained to follow, and appended after
 * the user's own description so it reads as direction layered on a brief rather
 * than as part of it.
 */
const TREATMENT_DIRECTION: Record<VideoTreatment, string> = {
  live_action:
    'Treatment: live action. Real people and real locations, photographic lighting and lenses. Not animated or illustrated.',
  animation:
    'Treatment: 2D animation. Drawn or illustrated frames with animated motion. Not photographic footage.',
  '3d': 'Treatment: 3D CG animation. Modelled characters and environments with rendered lighting and materials. Not photographic footage.',
  motion_graphics:
    'Treatment: motion graphics. Typography, shapes, icons and graphic elements in motion. No photographic footage and no characters.',
};

const SOUND_DIRECTION: Record<VideoSound, string> = {
  ambient:
    'Audio: diegetic ambient sound from the scene only — room tone, movement, environment. No music track.',
  music: 'Audio: a music track carrying the piece, matched to its pace and mood.',
  silent: 'Audio: none. Generate the clip without sound.',
};

/**
 * The direction to append to a video prompt, or an empty string when the user
 * expressed no preference — an unset control must add nothing, so a plain
 * request reaches the provider exactly as it was written.
 */
export function describeVideoDirection({ treatment, sound }: VideoDirection): string {
  const lines = [
    treatment ? TREATMENT_DIRECTION[treatment] : '',
    sound ? SOUND_DIRECTION[sound] : '',
  ].filter(Boolean);

  return lines.length ? `\n\n${lines.join('\n')}` : '';
}

/** The user's prompt with any direction appended. */
export function applyVideoDirection(prompt: string, direction: VideoDirection): string {
  return `${prompt}${describeVideoDirection(direction)}`;
}
