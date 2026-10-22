/**
 * The passage column holds the facts the listener already knows, separated by
 * " | ", each optionally prefixed with "Known:". Returns clean fact strings.
 */
export function parseFacts(passage: string | null | undefined): string[] {
  if (!passage) return [];
  return passage
    .split('|')
    .map((part) => part.trim().replace(/^known:\s*/i, ''))
    .filter((part) => part.length > 0);
}

/**
 * Points for the polygraph trace. Pure: the wobble depends only on elapsed
 * time and the fraction of time left, so the render stays deterministic.
 * With reduced motion the trace is a flat line.
 */
export function tracePoints(elapsedMs: number, fractionLeft: number, reduced: boolean): string {
  const width = 200;
  const mid = 20;
  const steps = 40;
  const amplitude = reduced ? 0 : 3 + 9 * (1 - Math.max(0, Math.min(1, fractionLeft)));
  const phase = reduced ? 0 : elapsedMs / 160;
  const points: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * width;
    const y = mid + amplitude * Math.sin(i * 0.9 + phase) * (0.5 + 0.5 * Math.sin(i * 0.23));
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(' ');
}
