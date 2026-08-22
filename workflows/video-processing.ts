import {
  analyseScenesStep,
  checkpointTranscriptionStep,
  extractAudioChunksStep,
  failAnalysisStep,
  generatePreviewsStep,
  mergeAnalysisResultsStep,
  prepareVideoStep,
  selectClipsStep,
  transcribeAudioChunkStep,
} from '@/workflows/video-analysis-steps';
import { renderProjectClipStep } from '@/workflows/video-render-step';

export async function analyseProjectWorkflow(projectId: string) {
  'use workflow';

  try {
    const prepared = await prepareVideoStep(projectId);
    if (prepared.hasReusableTranscript) {
      const scene = await analyseScenesStep(projectId, prepared.duration);
      await mergeAnalysisResultsStep(projectId, [], scene, 0);
    } else {
      const audio = await extractAudioChunksStep(projectId, prepared.duration);
      // This promise is intentionally started before transcription. Workflow
      // persists both branches while Vercel schedules the scene scan and the
      // speech workers concurrently.
      const scenePromise = analyseScenesStep(projectId, prepared.duration);
      let completed = 0;
      let transcriptionWallMs = 0;
      for (let offset = 0; offset < audio.chunks.length; offset += audio.concurrency) {
        const batch = audio.chunks.slice(offset, offset + audio.concurrency);
        const results = await Promise.all(batch.map((chunk) => transcribeAudioChunkStep(projectId, chunk)));
        completed += results.length;
        transcriptionWallMs += Math.max(0, ...results.map((result) => result.durationMs));
        await checkpointTranscriptionStep(projectId, completed, audio.chunks.length, transcriptionWallMs);
      }
      const scene = await scenePromise;
      await mergeAnalysisResultsStep(projectId, audio.chunks, scene, transcriptionWallMs);
    }
    await selectClipsStep(projectId);
    await generatePreviewsStep(projectId);
    return { projectId, status: 'complete' as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown analysis error';
    await failAnalysisStep(projectId, message);
    throw error;
  }
}

export async function renderProjectWorkflow(projectId: string, clipIds: string[]) {
  'use workflow';

  for (let index = 0; index < clipIds.length; index += 1) {
    await renderProjectClipStep(projectId, clipIds[index], index, clipIds.length);
  }
  return { projectId, rendered: clipIds.length };
}
