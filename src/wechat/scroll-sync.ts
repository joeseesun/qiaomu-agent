/** Map a scroll position between panes whose rendered content has different heights. */
export function mapScrollTop(sourceTop: number, sourceMax: number, targetMax: number): number {
  if (sourceMax <= 0 || targetMax <= 0) return 0;
  return Math.round(Math.min(Math.max(sourceTop / sourceMax, 0), 1) * targetMax);
}
