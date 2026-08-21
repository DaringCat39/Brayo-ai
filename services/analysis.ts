import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Clip, ClipCategory, Project, TranscriptSegment } from '@/types';
import { getProject, saveProject } from '@/lib/persistence';
import { cleanupProjectWorkspace, projectDir } from '@/lib/paths';
import { clamp, now } from '@/lib/utils';
import { DEFAULT_CLIP_SECONDS, MIN_CLIP_SECONDS, requiredClipDuration } from '@/lib/clip-duration';
import { createThumbnail, detectSilence, extractAudio, probeVideo } from '@/services/ffmpeg';
import { transcribeAudio } from '@/services/transcription';
import { scoreTranscriptWithAi, type AiCandidate } from '@/services/ai/provider';
import { localTrendHeuristics } from '@/services/trends';
import { materializeVideo, persistProjectMedia } from '@/services/storage';

const categories: ClipCategory[] = ['Story', 'Quote', 'Informative', 'Emotional', 'High energy', 'Funny', 'Controversial'];

async function update(project: Project, progress: number, stage: string, detail: string) {
  project.status = 'analysing';
  project.job = { ...project.job, status: 'analysing', progress, stage, detail, updatedAt: now() };
  await saveProject(project);
}

function transcriptAt(segments: TranscriptSegment[], start: number, end: number) {
  return segments
    .filter((segment) => segment.end > start && segment.start < end)
    .map((segment) => segment.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashScore(seed: string, offset = 0) {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return 62 + (Math.abs(hash + offset * 7919) % 31);
}

function inferCategory(text: string, index: number): ClipCategory {
  const lower = text.toLowerCase();
  if (/laugh|funny|joke|hilarious|ridiculous/.test(lower)) return 'Funny';
  if (/feel|love|fear|hurt|cry|changed my life/.test(lower)) return 'Emotional';
  if (/why|how|learn|because|means/.test(lower)) return 'Informative';
  if (/wrong|truth|unpopular|disagree|controvers/.test(lower)) return 'Controversial';
  if (/then|suddenly|finally|story/.test(lower)) return 'Story';
  if (/!|never|always|best|worst/.test(text)) return 'Quote';
  return categories[index % categories.length];
}

function scoreClip(text: string, start: number, end: number, silenceOverlap: number) {
  const lower = text.toLowerCase();
  const emotional = localTrendHeuristics.emotionalKeywords.filter((word) => lower.includes(word)).length;
  const curiosity = localTrendHeuristics.curiosityKeywords.filter((word) => lower.includes(word)).length;
  const punctuation = (text.match(/[?!]/g) || []).length;
  const density = text ? text.split(/\s+/).length / Math.max(1, end - start) : 1.8;
  const seed = `${text}:${start.toFixed(2)}:${end.toFixed(2)}`;
  const hook = clamp(hashScore(seed, 1) + curiosity * 3 + punctuation * 2 - silenceOverlap * 4, 35, 98);
  const retention = clamp(hashScore(seed, 2) + Math.min(8, density * 2) - silenceOverlap * 6, 35, 97);
  const emotion = clamp(hashScore(seed, 3) + emotional * 4, 35, 98);
  const shareability = clamp(hashScore(seed, 4) + curiosity * 2, 35, 97);
  const novelty = clamp(hashScore(seed, 5), 40, 96);
  const clarity = clamp(hashScore(seed, 6) + (text.length > 40 ? 4 : 0), 38, 97);
  const visual = clamp(hashScore(seed, 7), 42, 95);
  const viral = Math.round(
    hook * 0.22 + retention * 0.2 + emotion * 0.13 + shareability * 0.16 + novelty * 0.1 + clarity * 0.1 + visual * 0.09,
  );
  return {
    viral,
    hook: Math.round(hook),
    retention: Math.round(retention),
    emotion: Math.round(emotion),
    shareability: Math.round(shareability),
    novelty: Math.round(novelty),
    clarity: Math.round(clarity),
    visual: Math.round(visual),
  };
}

function fallbackCandidates(duration: number, desiredLength: number, transcript: TranscriptSegment[], silences: Array<{ start: number; end: number }>) {
  const maxLength = Math.min(Math.max(desiredLength, requiredClipDuration(duration)), duration);
  const count = duration < 40 ? 1 : clamp(Math.round(duration / 75), 5, 15);
  const usable = Math.max(0, duration - maxLength);
  return Array.from({ length: count }, (_, index) => {
    const target = count === 1 ? 0 : (usable * index) / (count - 1);
    const nearbyEnd = silences
      .map((silence) => silence.start)
      .filter((point) => point > target + maxLength * 0.7 && point < target + maxLength * 1.25)
      .sort((a, b) => Math.abs(a - (target + maxLength)) - Math.abs(b - (target + maxLength)))[0];
    const end = clamp(nearbyEnd || target + maxLength, 0, duration);
    const start = clamp(end - maxLength, 0, Math.max(0, duration - 1));
    const text = transcriptAt(transcript, start, end);
    return { start, end, text };
  });
}

function fitCandidateWindow<T extends { start: number; end: number }>(candidate: T, sourceDuration: number, desiredLength: number): T {
  const targetLength = Math.min(sourceDuration, Math.max(MIN_CLIP_SECONDS, desiredLength || DEFAULT_CLIP_SECONDS));
  if (sourceDuration <= targetLength) return { ...candidate, start: 0, end: sourceDuration };
  const start = clamp(candidate.start, 0, sourceDuration - targetLength);
  return { ...candidate, start, end: start + targetLength };
}

function makeClip(candidate: { start: number; end: number; text?: string } & Partial<AiCandidate>, index: number, silences: Array<{ start: number; end: number }>, transcript: TranscriptSegment[], captionPreset: Clip['captions']['preset']): Clip {
  const text = candidate.text || '';
  const overlap = silences.reduce((total, silence) => {
    const amount = Math.max(0, Math.min(candidate.end, silence.end) - Math.max(candidate.start, silence.start));
    return total + amount;
  }, 0);
  const category = (categories.includes(candidate.category as ClipCategory) ? candidate.category : inferCategory(text, index)) as ClipCategory;
  const scores = scoreClip(text || `${candidate.title || category}-${index}`, candidate.start, candidate.end, overlap);
  const shortText = text.split(/\s+/).slice(0, 8).join(' ');
  const title = candidate.title || (shortText ? shortText.replace(/[.,!?]+$/, '') : `${category} moment ${index + 1}`);
  const hook = candidate.hook || (shortText ? `${shortText}${shortText.endsWith('…') ? '' : '…'}` : `The moment everything shifts…`);
  const captionSegments = transcript.filter((segment) => segment.end > candidate.start && segment.start < candidate.end);
  return {
    id: randomUUID(),
    title,
    hook,
    alternativeHook: category === 'Story' ? 'Wait for the payoff…' : 'This deserves a closer look…',
    socialCaption: `${title} — clipped locally with ViralCut.`,
    youtubeTitle: `${title} #Shorts`,
    hashtags: ['#shorts', '#reels', `#${category.toLowerCase().replace(/\s/g, '')}`],
    reason: candidate.reason || (text ? `A self-contained ${category.toLowerCase()} section with clean pacing and an early hook.` : 'A high-signal section with limited dead air and a clean ending.'),
    category,
    start: Number(candidate.start.toFixed(2)),
    end: Number(candidate.end.toFixed(2)),
    duration: Number((candidate.end - candidate.start).toFixed(2)),
    transcript: text,
    captionSegments,
    scores,
    status: 'suggested',
    renderProgress: 0,
    aspectRatio: '9:16',
    framing: 'auto',
    style: 'viral',
    captions: { preset: captionPreset, enabled: captionSegments.length > 0, uppercase: true, fontSize: 54, position: 'bottom', highlight: true },
    music: { enabled: false, volume: 0.16, fadeIn: 1, fadeOut: 1.5, ducking: true },
    hookOverlay: true,
    splitPoints: [],
    excludedRanges: [],
  };
}

export async function analyseProject(projectId: string) {
  const project = await getProject(projectId);
  if (!project) return;
  try {
    const sourceVideo = project.video;
    if (!sourceVideo) throw new Error('The uploaded source file could not be located.');
    if (sourceVideo.storageProvider === 'vercel-blob') {
      await update(project, 4, 'Preparing source', 'Streaming the completed upload from object storage for FFmpeg');
    }
    const sourcePath = await materializeVideo(sourceVideo, project.id);
    await update(project, 7, 'Probing video', 'Reading codec, frame rate, resolution and duration');
    project.video = {
      ...await probeVideo(sourcePath, sourceVideo.filename, sourceVideo.size),
      storageProvider: sourceVideo.storageProvider,
      storageUrl: sourceVideo.storageUrl,
      storageKey: sourceVideo.storageKey,
    };
    await update(project, 16, 'Creating preview', 'Extracting a local project thumbnail');
    const directory = projectDir(project.id);
    const projectThumbnail = path.join(directory, 'thumbnail.jpg');
    await createThumbnail(sourcePath, Math.min(3, project.video.duration * 0.1), projectThumbnail);
    await persistProjectMedia(project, 'thumbnail.jpg', projectThumbnail, 'image/jpeg');
    project.thumbnailUrl = `/api/media/${project.id}/thumbnail.jpg`;

    await update(project, 27, 'Reading audio signals', 'Detecting pauses and clean editorial cut points');
    const silences = await detectSilence(sourcePath);
    const hasReusableTranscript = project.transcript.length > 0 && !['pending', 'signal-only'].includes(project.transcriptionMode);
    if (hasReusableTranscript) {
      await update(project, 43, 'Reusing synchronized speech', 'The saved word-level transcript is ready, so only the edit plan needs rebuilding');
    } else {
      const audioPath = path.join(directory, 'speech.wav');
      await extractAudio(sourcePath, audioPath);
      await update(project, 43, 'Transcribing every spoken phrase', 'Creating word timestamps with local Whisper; the first run may download the model once');
      const transcription = await transcribeAudio(audioPath, directory);
      project.transcript = transcription.segments;
      project.transcriptionMode = transcription.mode;
      await saveProject(project);
    }

    await update(project, 61, 'Finding strongest moments', 'Scoring hooks, pacing, emotion, novelty and clarity');
    const timestamped = project.transcript.map((segment) => `[${segment.start.toFixed(1)}-${segment.end.toFixed(1)}] ${segment.text}`).join('\n');
    let aiCandidates: AiCandidate[] | null = null;
    try {
      aiCandidates = await scoreTranscriptWithAi(timestamped, project.video.duration, project.preferredDuration);
    } catch (error) {
      console.warn('Semantic scoring unavailable; using local heuristics.', error);
    }
    const rawCandidates = aiCandidates?.length
      ? aiCandidates
          .filter((candidate) => Number.isFinite(candidate.start) && Number.isFinite(candidate.end))
          .map((candidate) => ({
            ...candidate,
            start: clamp(candidate.start, 0, project.video!.duration),
            end: clamp(candidate.end, 0, project.video!.duration),
            text: transcriptAt(project.transcript, candidate.start, candidate.end),
          }))
          .filter((candidate) => candidate.end - candidate.start >= 8)
      : fallbackCandidates(project.video.duration, project.preferredDuration, project.transcript, silences);
    const fittedCandidates = rawCandidates.map((candidate) => {
      const fitted = fitCandidateWindow(candidate, project.video!.duration, project.preferredDuration || DEFAULT_CLIP_SECONDS);
      return { ...fitted, text: transcriptAt(project.transcript, fitted.start, fitted.end) };
    });
    project.clips = fittedCandidates.slice(0, 15).map((candidate, index) => makeClip(candidate, index, silences, project.transcript, project.defaultCaptionPreset || 'bold'));

    await update(project, 76, 'Generating clip previews', 'Creating thumbnails for every ranked moment');
    for (let index = 0; index < project.clips.length; index += 1) {
      const clip = project.clips[index];
      const filename = `clip-${clip.id}.jpg`;
      const thumbnailPath = path.join(directory, filename);
      await createThumbnail(sourcePath, clip.start + Math.min(1, clip.duration / 2), thumbnailPath);
      await persistProjectMedia(project, filename, thumbnailPath, 'image/jpeg');
      clip.thumbnailUrl = `/api/media/${project.id}/${filename}`;
      project.job.progress = 76 + Math.round(((index + 1) / project.clips.length) * 20);
      await saveProject(project);
    }
    project.clips.sort((a, b) => b.scores.viral - a.scores.viral);
    project.status = 'ready';
    project.job = {
      ...project.job,
      status: 'ready',
      stage: 'Ready to edit',
      progress: 100,
      detail: `${project.clips.length} candidate clips ranked by estimated potential`,
      updatedAt: now(),
    };
    await saveProject(project);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown analysis error';
    project.status = 'failed';
    project.error = message;
    project.job = { ...project.job, status: 'failed', stage: 'Analysis failed', detail: message, error: message, updatedAt: now() };
    await saveProject(project);
  } finally {
    await cleanupProjectWorkspace(project.id);
  }
}
