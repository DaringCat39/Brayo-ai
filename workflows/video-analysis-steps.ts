import path from 'node:path';
import { unlink } from 'node:fs/promises';
import type {
  AnalysisCheckpoint,
  AudioChunkReference,
  Project,
  ProjectAnalysisState,
  TranscriptSegment,
} from '@/types';
import {
  getProject,
  readProjectIntermediate,
  saveProject,
  writeProjectIntermediate,
} from '@/lib/persistence';
import { cleanupProjectWorkspace, IS_VERCEL, projectDir } from '@/lib/paths';
import { clamp, now } from '@/lib/utils';
import {
  createThumbnail,
  detectSceneTimestamps,
  extractAudioWithSilences,
  probeVideo,
  splitAudioForTranscription,
} from '@/services/ffmpeg';
import { generateProjectPreviews, selectProjectClips } from '@/services/analysis';
import { materializeProjectMedia, persistProjectMedia, processingInputForVideo } from '@/services/storage';
import { transcribeAudio } from '@/services/transcription';
import { logPipelineTiming, measurePipelineStage, recordProjectTiming } from '@/services/timing';

export interface PreparedVideoResult {
  duration: number;
  hasReusableTranscript: boolean;
}

export interface AudioPreparationResult {
  chunks: AudioChunkReference[];
  silences: Array<{ start: number; end: number }>;
  concurrency: number;
}

export interface SceneAnalysisResult {
  timestamps: number[];
  durationMs: number;
}

export interface TranscriptionChunkResult {
  index: number;
  mode: Project['transcriptionMode'];
  segmentCount: number;
  durationMs: number;
}

interface TranscriptChunkCheckpoint extends TranscriptionChunkResult {
  segments: TranscriptSegment[];
}

function sourceFingerprint(project: Project) {
  const video = project.video;
  return `${video?.storageKey || video?.storedPath || video?.filename || project.id}:${video?.size || 0}`;
}

function analysisState(project: Project): ProjectAnalysisState {
  const fingerprint = sourceFingerprint(project);
  if (!project.analysis || project.analysis.version !== 2 || project.analysis.sourceFingerprint !== fingerprint) {
    project.analysis = {
      version: 2,
      sourceFingerprint: fingerprint,
      completedStages: [],
      fullVideoFfmpegPasses: 0,
    };
  }
  return project.analysis;
}

function completeStage(state: ProjectAnalysisState, stage: AnalysisCheckpoint) {
  if (!state.completedStages.includes(stage)) state.completedStages.push(stage);
}

function setAnalysing(project: Project, progress: number, stage: string, detail: string) {
  project.status = 'analysing';
  project.error = undefined;
  project.job = {
    ...project.job,
    status: 'analysing',
    progress,
    stage,
    detail,
    error: undefined,
    updatedAt: now(),
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return results;
}

export async function prepareVideoStep(projectId: string): Promise<PreparedVideoResult> {
  'use step';

  const project = await getProject(projectId);
  if (!project?.video) throw new Error('The uploaded source file could not be located.');
  const state = analysisState(project);
  const reusableTranscript = project.transcript.length > 0 && !['pending', 'signal-only'].includes(project.transcriptionMode);
  if (state.completedStages.includes('video-prepared') && project.video.duration > 0 && project.thumbnailUrl) {
    logPipelineTiming({ projectId, stage: 'objectMaterialization', detail: 'Prepared video checkpoint', cached: true }, 0);
    return { duration: project.video.duration, hasReusableTranscript: reusableTranscript };
  }

  setAnalysing(project, 5, 'Preparing video', 'Opening the private object stream and reading video metadata');
  await saveProject(project);
  const originalVideo = project.video;
  const sourceTiming = await measurePipelineStage(
    { projectId, stage: 'objectMaterialization', detail: 'Resolve seekable private B2 input' },
    () => processingInputForVideo(originalVideo, project.id),
  );
  recordProjectTiming(project, 'objectMaterialization', sourceTiming.durationMs, sourceTiming.value.mode);

  const directory = projectDir(project.id);
  const thumbnailPath = path.join(directory, 'thumbnail.jpg');
  try {
    const [metadata] = await Promise.all([
      probeVideo(sourceTiming.value.input, originalVideo.filename, originalVideo.size),
      createThumbnail(sourceTiming.value.input, 3, thumbnailPath),
    ]);
    project.video = {
      ...metadata,
      storedPath: originalVideo.storedPath,
      storageProvider: originalVideo.storageProvider,
      storageKey: originalVideo.storageKey,
      storageVersionId: originalVideo.storageVersionId,
    };
    await persistProjectMedia(project, 'thumbnail.jpg', thumbnailPath, 'image/jpeg');
    project.thumbnailUrl = `/api/media/${project.id}/thumbnail.jpg`;
    completeStage(state, 'video-prepared');
    setAnalysing(project, 12, 'Preparing video', 'Video metadata and preview are ready');
    await saveProject(project);
    return { duration: metadata.duration, hasReusableTranscript: reusableTranscript };
  } finally {
    await cleanupProjectWorkspace(project.id);
  }
}

export async function extractAudioChunksStep(projectId: string, duration: number): Promise<AudioPreparationResult> {
  'use step';

  const project = await getProject(projectId);
  if (!project?.video) throw new Error('The uploaded source file could not be located.');
  const state = analysisState(project);
  const configuredConcurrency = process.env.BRAYO_TRANSCRIPTION_CONCURRENCY?.trim()
    ? Number(process.env.BRAYO_TRANSCRIPTION_CONCURRENCY)
    : Number.NaN;
  const defaultConcurrency = process.env.BRAYO_TRANSCRIPTION_PROVIDER === 'openai' ? 4 : IS_VERCEL ? 3 : 2;
  const concurrency = Number.isFinite(configuredConcurrency) ? clamp(Math.round(configuredConcurrency), 1, 6) : defaultConcurrency;
  if (state.completedStages.includes('audio-prepared') && state.audioChunks?.length) {
    logPipelineTiming({ projectId, stage: 'audioExtraction', detail: 'Audio chunk checkpoint', cached: true }, 0);
    return { chunks: state.audioChunks, silences: state.silences || [], concurrency };
  }

  setAnalysing(project, 15, 'Preparing video', 'Extracting speech once and finding clean cut points');
  await saveProject(project);
  const directory = projectDir(project.id);
  const audioPath = path.join(directory, 'analysis-audio.wav');
  try {
    const source = await processingInputForVideo(project.video, project.id);
    const extraction = await measurePipelineStage(
      { projectId, stage: 'audioExtraction', detail: 'One source decode plus bounded audio chunking' },
      async () => {
        const silences = await extractAudioWithSilences(source.input, audioPath);
        const chunks = await splitAudioForTranscription(audioPath, directory, duration);
        await mapWithConcurrency(chunks, 4, (chunk) => persistProjectMedia(project, chunk.filename, chunk.outputPath, 'audio/wav'));
        return { silences, chunks };
      },
    );
    state.audioChunks = extraction.value.chunks.map(({ index, filename, start, end, overlap }) => ({
      index,
      filename,
      start,
      end,
      overlap,
    }));
    state.silences = extraction.value.silences;
    state.fullVideoFfmpegPasses = 1;
    recordProjectTiming(project, 'audioExtraction', extraction.durationMs, `${state.audioChunks.length} overlapping chunks`);
    completeStage(state, 'audio-prepared');
    setAnalysing(project, 27, 'Transcribing 0%', `${state.audioChunks.length} audio chunks are ready`);
    await saveProject(project);
    return { chunks: state.audioChunks, silences: state.silences, concurrency };
  } finally {
    await unlink(audioPath).catch(() => undefined);
    await cleanupProjectWorkspace(project.id);
  }
}

export async function analyseScenesStep(projectId: string, duration: number): Promise<SceneAnalysisResult> {
  'use step';

  const cacheKey = 'scene-analysis-v2.json';
  const cached = await readProjectIntermediate<SceneAnalysisResult>(projectId, cacheKey);
  if (cached) {
    logPipelineTiming({ projectId, stage: 'sceneAnalysis', detail: 'Scene checkpoint', cached: true }, 0);
    return cached;
  }
  const project = await getProject(projectId);
  if (!project?.video) throw new Error('The uploaded source file could not be located.');
  const source = await processingInputForVideo(project.video, project.id);
  const measured = await measurePipelineStage(
    { projectId, stage: 'sceneAnalysis', detail: 'Keyframe and scene boundary scan' },
    () => detectSceneTimestamps(source.input, duration),
  );
  const result = { timestamps: measured.value, durationMs: measured.durationMs };
  await writeProjectIntermediate(projectId, cacheKey, result);
  return result;
}

export async function transcribeAudioChunkStep(
  projectId: string,
  chunk: AudioChunkReference,
): Promise<TranscriptionChunkResult> {
  'use step';

  const cacheKey = `transcripts/v2-${String(chunk.index).padStart(3, '0')}.json`;
  const cached = await readProjectIntermediate<TranscriptChunkCheckpoint>(projectId, cacheKey);
  if (cached) {
    logPipelineTiming({ projectId, stage: 'transcription', detail: `Chunk ${chunk.index + 1}`, cached: true }, 0);
    const { segments: _segments, ...summary } = cached;
    return { ...summary, durationMs: 0 };
  }
  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found.');
  const directory = projectDir(project.id);
  try {
    const audioPath = await materializeProjectMedia(project, chunk.filename);
    const measured = await measurePipelineStage(
      { projectId, stage: 'transcription', detail: `Chunk ${chunk.index + 1}: ${chunk.start.toFixed(1)}-${chunk.end.toFixed(1)}s` },
      () => transcribeAudio(audioPath, directory),
    );
    const segments = measured.value.segments.map((segment) => ({
      ...segment,
      start: segment.start + chunk.start,
      end: segment.end + chunk.start,
      words: segment.words?.map((word) => ({
        ...word,
        start: word.start + chunk.start,
        end: word.end + chunk.start,
      })),
    }));
    const checkpoint: TranscriptChunkCheckpoint = {
      index: chunk.index,
      mode: measured.value.mode,
      segmentCount: segments.length,
      durationMs: measured.durationMs,
      segments,
    };
    await writeProjectIntermediate(projectId, cacheKey, checkpoint);
    const { segments: _segments, ...summary } = checkpoint;
    return summary;
  } finally {
    await cleanupProjectWorkspace(project.id);
  }
}

export async function checkpointTranscriptionStep(
  projectId: string,
  completed: number,
  total: number,
  estimatedWallMs: number,
) {
  'use step';

  const project = await getProject(projectId);
  if (!project) return;
  analysisState(project);
  const percent = Math.round((completed / Math.max(1, total)) * 100);
  setAnalysing(
    project,
    27 + Math.round((completed / Math.max(1, total)) * 34),
    `Transcribing ${percent}%`,
    `${completed}/${total} chunks complete · scene analysis is running in parallel`,
  );
  recordProjectTiming(project, 'transcription', estimatedWallMs, `${completed}/${total} chunks`);
  await saveProject(project);
}

function mergeChunkSegments(chunks: AudioChunkReference[], checkpoints: TranscriptChunkCheckpoint[]) {
  const orderedChunks = [...chunks].sort((a, b) => a.index - b.index);
  const byIndex = new Map(checkpoints.map((checkpoint) => [checkpoint.index, checkpoint]));
  const merged = orderedChunks.flatMap((chunk, index) => {
    const checkpoint = byIndex.get(chunk.index);
    if (!checkpoint) return [];
    const lower = index === 0 ? chunk.start : chunk.start + chunk.overlap / 2;
    const upper = index === orderedChunks.length - 1 ? chunk.end : chunk.end - chunk.overlap / 2;
    return checkpoint.segments.filter((segment) => {
      const midpoint = (segment.start + segment.end) / 2;
      return midpoint >= lower && midpoint < upper;
    });
  }).sort((a, b) => a.start - b.start);
  return merged.filter((segment, index) => {
    const previous = merged[index - 1];
    return !previous || segment.text !== previous.text || Math.abs(segment.start - previous.start) > 0.75;
  });
}

export async function mergeAnalysisResultsStep(
  projectId: string,
  chunks: AudioChunkReference[],
  scene: SceneAnalysisResult,
  transcriptionWallMs: number,
) {
  'use step';

  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found.');
  const state = analysisState(project);
  if (chunks.length) {
    const checkpoints = await Promise.all(chunks.map((chunk) =>
      readProjectIntermediate<TranscriptChunkCheckpoint>(projectId, `transcripts/v2-${String(chunk.index).padStart(3, '0')}.json`),
    ));
    if (checkpoints.some((checkpoint) => !checkpoint)) throw new Error('A transcription chunk is missing after processing.');
    const complete = checkpoints as TranscriptChunkCheckpoint[];
    project.transcript = mergeChunkSegments(chunks, complete);
    const modes = complete.map((checkpoint) => checkpoint.mode);
    project.transcriptionMode = modes.includes('openai')
      ? 'openai'
      : modes.includes('local-whisper')
        ? 'local-whisper'
        : modes.includes('built-in-whisper')
          ? 'built-in-whisper'
          : 'signal-only';
    recordProjectTiming(project, 'transcription', transcriptionWallMs, `${chunks.length} chunks merged in timeline order`);
  }
  completeStage(state, 'transcript-complete');
  state.sceneTimestamps = scene.timestamps;
  recordProjectTiming(project, 'sceneAnalysis', scene.durationMs, `${scene.timestamps.length} scene/keyframe boundaries`);
  completeStage(state, 'scenes-complete');
  setAnalysing(project, 64, 'Analysing scenes 100%', 'Speech, pauses and scene boundaries are merged and cached');
  await saveProject(project);
}

export async function selectClipsStep(projectId: string) {
  'use step';

  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found.');
  await selectProjectClips(projectId, project.analysis?.silences || [], project.analysis?.sceneTimestamps || []);
}

export async function generatePreviewsStep(projectId: string) {
  'use step';

  await generateProjectPreviews(projectId);
}

export async function failAnalysisStep(projectId: string, message: string) {
  'use step';

  const project = await getProject(projectId);
  if (!project) return;
  project.status = 'failed';
  project.error = message;
  project.job = {
    ...project.job,
    status: 'failed',
    stage: 'Analysis failed',
    detail: message,
    error: message,
    updatedAt: now(),
  };
  await saveProject(project);
}
