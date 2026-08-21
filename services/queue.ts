import path from 'node:path';
import { getIntegrationAccount, getProject, saveProject } from '@/lib/persistence';
import { cleanupProjectWorkspace, projectDir } from '@/lib/paths';
import { now } from '@/lib/utils';
import { analyseProject } from '@/services/analysis';
import { renderClip } from '@/services/ffmpeg';
import { effectiveClipDuration, MIN_CLIP_SECONDS } from '@/lib/clip-duration';
import { publishClip } from '@/services/publishing';
import type { PublishingProvider } from '@/types';
import { materializeProjectMedia, materializeVideo, persistProjectMedia } from '@/services/storage';

declare global {
  // eslint-disable-next-line no-var
  var viralcutActiveJobs: Set<string> | undefined;
  // eslint-disable-next-line no-var
  var viralcutRenderQueues: Map<string, string[]> | undefined;
}

const activeJobs = global.viralcutActiveJobs || new Set<string>();
global.viralcutActiveJobs = activeJobs;
const renderQueues = global.viralcutRenderQueues || new Map<string, string[]>();
global.viralcutRenderQueues = renderQueues;

export function enqueueAnalysis(projectId: string) {
  const key = `analysis:${projectId}`;
  if (activeJobs.has(key)) return;
  activeJobs.add(key);
  setTimeout(() => {
    analyseProject(projectId).finally(() => activeJobs.delete(key));
  }, 20);
}

async function runRender(projectId: string, clipId: string) {
    const key = `render:${projectId}:${clipId}`;
    const project = await getProject(projectId);
    const clip = project?.clips.find((item) => item.id === clipId);
    if (!project || !clip || !project.video) return;
    try {
      if (project.video.duration >= MIN_CLIP_SECONDS && effectiveClipDuration(clip) < MIN_CLIP_SECONDS) {
        throw new Error('Keep at least 61 seconds after cuts before exporting.');
      }
      clip.status = 'rendering';
      clip.renderProgress = 1;
      project.status = 'rendering';
      project.job = {
        id: key,
        type: 'render',
        status: 'rendering',
        stage: 'Rendering clip',
        progress: 1,
        detail: clip.title,
        updatedAt: now(),
      };
      await saveProject(project);
      const filename = `export-${clip.id}.mp4`;
      const outputPath = path.join(projectDir(project.id), filename);
      const sourcePath = await materializeVideo(project.video, project.id);
      const selectedMusic = clip.music?.enabled
        ? project.musicTracks?.find((track) => track.id === clip.music.trackId)
        : undefined;
      const musicPath = selectedMusic
        ? await materializeProjectMedia(project, path.basename(selectedMusic.storedPath))
        : undefined;
      let lastSaved = 0;
      let pendingProgressSave = Promise.resolve<unknown>(undefined);
      await renderClip(sourcePath, clip, project.transcript, musicPath, outputPath, (progress) => {
        clip.renderProgress = progress;
        project.job.progress = progress;
        if (progress - lastSaved >= 3 || progress === 100) {
          lastSaved = progress;
          pendingProgressSave = pendingProgressSave.then(() => saveProject(project));
        }
      });
      await pendingProgressSave;
      await persistProjectMedia(project, filename, outputPath, 'video/mp4');
      clip.status = 'complete';
      clip.outputPath = outputPath;
      clip.outputUrl = `/api/media/${project.id}/${filename}?download=1`;
      const shouldAutoPublish = async (provider: PublishingProvider) => {
        if (clip.autoPublish) return clip.autoPublish[provider];
        const account = await getIntegrationAccount(provider);
        return Boolean(account && account.autoPublish !== false);
      };
      const [publishYouTube, publishTikTok] = await Promise.all([
        shouldAutoPublish('youtube'),
        shouldAutoPublish('tiktok'),
      ]);
      const publishTargets: PublishingProvider[] = [
        ...(publishYouTube ? ['youtube' as const] : []),
        ...(publishTikTok ? ['tiktok' as const] : []),
      ];
      for (const provider of publishTargets) {
        project.job.stage = `Publishing to ${provider === 'youtube' ? 'YouTube' : 'TikTok'}`;
        project.job.detail = `Your export is ready. Uploading ${clip.title} now…`;
        clip.publications = {
          ...clip.publications,
          [provider]: { status: 'publishing', updatedAt: now() },
        };
        await saveProject(project);
        clip.publications[provider] = await publishClip(project, clip, provider);
        await saveProject(project);
      }
      project.status = project.clips.some((item) => item.status === 'rendering') ? 'rendering' : 'complete';
      const publishedCount = publishTargets.filter((provider) => clip.publications?.[provider]?.status === 'published').length;
      const failedCount = publishTargets.filter((provider) => clip.publications?.[provider]?.status === 'failed').length;
      const processingCount = publishTargets.length - publishedCount - failedCount;
      project.job = {
        ...project.job,
        status: 'complete',
        stage: 'Export complete',
        progress: 100,
        detail: publishTargets.length
          ? `${clip.title} is ready · ${publishedCount} published${processingCount ? ` · ${processingCount} processing` : ''}${failedCount ? ` · ${failedCount} needs attention` : ''}`
          : `${clip.title} is ready to download`,
        updatedAt: now(),
      };
      await saveProject(project);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown render error';
      clip.status = 'failed';
      project.status = 'ready';
      project.job = { ...project.job, status: 'failed', stage: 'Render failed', detail: message, error: message, updatedAt: now() };
      await saveProject(project);
    }
}

async function processRenderQueue(projectId: string) {
  const key = `render-project:${projectId}`;
  if (activeJobs.has(key)) return;
  activeJobs.add(key);
  try {
    const queue = renderQueues.get(projectId) || [];
    while (queue.length) {
      const clipId = queue.shift();
      if (clipId) await runRender(projectId, clipId);
    }
  } finally {
    activeJobs.delete(key);
    renderQueues.delete(projectId);
    await cleanupProjectWorkspace(projectId);
  }
}

export function enqueueRender(projectId: string, clipId: string) {
  const queue = renderQueues.get(projectId) || [];
  if (!queue.includes(clipId)) queue.push(clipId);
  renderQueues.set(projectId, queue);
  setTimeout(() => void processRenderQueue(projectId), 20);
}
