/** Wheel segments, in order. The last one is the neutral fallback for any other `passage` value. */
export const SETTINGS = [
  'Meeting',
  'Email',
  'Break room',
  'Client call',
  'Feedback chat',
  'Team chat',
  'Office',
] as const;

export const SEGMENT_COUNT = SETTINGS.length;
export const SEGMENT_DEGREES = 360 / SEGMENT_COUNT;

/** Full turns before the wheel settles. */
const EXTRA_TURNS = 3;

/** Index of the segment for a CSV `passage` value. Anything unknown lands on "Office". */
export function segmentFor(passage: string | null | undefined): number {
  const wanted = (passage ?? '').trim().toLowerCase();
  const found = SETTINGS.findIndex((name) => name.toLowerCase() === wanted);
  return found >= 0 ? found : SEGMENT_COUNT - 1;
}

/** Angle of a segment's middle, in degrees clockwise from the top. */
export function segmentMiddle(index: number): number {
  return (index + 0.5) * SEGMENT_DEGREES;
}

/** Wheel rotation that leaves the middle of `index` under the pointer at the top. */
export function finalRotation(index: number): number {
  return EXTRA_TURNS * 360 - segmentMiddle(index);
}

/** Point on a circle, angle in degrees clockwise from the top. */
export function polar(cx: number, cy: number, radius: number, degrees: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  return [cx + radius * Math.sin(radians), cy - radius * Math.cos(radians)];
}

/** SVG path for one pie slice. */
export function slicePath(cx: number, cy: number, radius: number, index: number): string {
  const [x0, y0] = polar(cx, cy, radius, index * SEGMENT_DEGREES);
  const [x1, y1] = polar(cx, cy, radius, (index + 1) * SEGMENT_DEGREES);
  return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}
