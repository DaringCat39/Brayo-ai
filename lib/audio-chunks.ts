export interface PlannedAudioChunk {
  index: number;
  start: number;
  end: number;
  overlap: number;
}

function bounded(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function planAudioChunks(duration: number, chunkSeconds = 300, overlap = 5): PlannedAudioChunk[] {
  const safeDuration = Math.max(0, duration);
  const safeChunkSeconds = bounded(chunkSeconds, 60, 480);
  const safeOverlap = bounded(overlap, 0, Math.min(15, safeChunkSeconds / 4));
  const stride = safeChunkSeconds - safeOverlap;
  const chunks: PlannedAudioChunk[] = [];
  for (let start = 0, index = 0; start < safeDuration; start += stride, index += 1) {
    const end = Math.min(safeDuration, start + safeChunkSeconds);
    chunks.push({ index, start, end, overlap: safeOverlap });
    if (end >= safeDuration) break;
  }
  return chunks;
}
