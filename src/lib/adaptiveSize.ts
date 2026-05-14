export function adaptiveSize(
  text: string,
  minPx: number,
  maxPx: number,
  minChars: number,
  maxChars: number,
): number {
  const len = text.length;
  if (len <= minChars) return maxPx;
  if (len >= maxChars) return minPx;
  return maxPx + (minPx - maxPx) * ((len - minChars) / (maxChars - minChars));
}
