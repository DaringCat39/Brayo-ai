import type { ProcessingTimingStage, Project } from '@/types';
import { now } from '@/lib/utils';

interface TimingContext {
  projectId: string;
  stage: ProcessingTimingStage;
  detail?: string;
  cached?: boolean;
  [key: string]: unknown;
}

export function logPipelineTiming(context: TimingContext, durationMs: number) {
  console.info('[brayo:pipeline]', JSON.stringify({
    event: 'stage_timing',
    ...context,
    durationMs: Math.max(0, Math.round(durationMs)),
    at: now(),
  }));
}

export function recordProjectTiming(
  project: Project,
  stage: ProcessingTimingStage,
  durationMs: number,
  detail?: string,
) {
  if (!project.analysis) return;
  project.analysis.timings ||= {};
  project.analysis.timings[stage] = {
    durationMs: Math.max(0, Math.round(durationMs)),
    detail,
    updatedAt: now(),
  };
}

export async function measurePipelineStage<T>(
  context: TimingContext,
  operation: () => Promise<T>,
): Promise<{ value: T; durationMs: number }> {
  const startedAt = performance.now();
  try {
    const value = await operation();
    const durationMs = performance.now() - startedAt;
    logPipelineTiming(context, durationMs);
    return { value, durationMs };
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    console.error('[brayo:pipeline]', JSON.stringify({
      event: 'stage_failed',
      ...context,
      durationMs: Math.max(0, Math.round(durationMs)),
      error: error instanceof Error ? error.message : String(error),
      at: now(),
    }));
    throw error;
  }
}
