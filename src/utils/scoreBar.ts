export function getScoreBarFillWidth(value: number, max: number, railWidth: number): number {
  if (value <= 0 || max <= 0 || railWidth <= 0) return 0
  return Math.max((value / max) * railWidth, 2)
}
