import type { Clip } from '@/types';

export const MIN_CLIP_SECONDS = 61;
export const DEFAULT_CLIP_SECONDS = 90;
export const CLIP_DURATION_OPTIONS = [75, 90, 120, 180] as const;

export function effectiveClipDuration(clip: Pick<Clip, 'start' | 'end' | 'excludedRanges'>) {
  const ranges = clip.excludedRanges
    .map((range) => ({
      start: Math.max(clip.start, Math.min(clip.end, range.start)),
      end: Math.max(clip.start, Math.min(clip.end, range.end)),
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  const removed = merged.reduce((total, range) => total + range.end - range.start, 0);
  return Math.max(0, clip.end - clip.start - removed);
}

export function requiredClipDuration(sourceDuration: number) {
  return Math.min(MIN_CLIP_SECONDS, Math.max(0, sourceDuration));
}
