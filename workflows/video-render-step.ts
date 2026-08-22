import path from 'node:path';
import type { PublishingProvider } from '@/types';
import { effectiveClipDuration, MIN_CLIP_SECONDS } from '@/lib/clip-duration';
import { getIntegrationAccount, getProject, saveProject } from '@/lib/persistence';
import { cleanupProjectWorkspace, projectDir } from '@/lib/paths';
import { now } from '@/lib/utils';
import { renderClip } from '@/services/ffmpeg';
import { publishClip } from '@/services/publishing';
import { materializeProjectMedia, persistProjectMedia, processingInputForVideo } from '@/services/storage';
import { measurePipelineStage, recordProjectTiming } from '@/services/timing';

export async function renderProjectClipStep(
  projectId: string,
  clipId: string,
  batchIndex: number,
  batchTotal: number,
) {
  'use step';

  const key = `render:${projectId}:${clipId}`;
  const project = await getProject(projectId);
  const clip = project?.clips.find((item) => item.id === clipId);
  if (!project || !clip || !project.video) throw new Error('Clip not found.');
  if (clip.status === 'complete' && project.media?.[`export-${clip.id}.mp4`]) return;
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
      stage: `Rendering clip ${batchIndex + 1}/${batchTotal}`,
      progress: 1,
      detail: clip.title,
      updatedAt: now(),
    };
    await saveProject(project);

    const filename = `export-${clip.id}.mp4`;
    const outputPath = path.join(projectDir(project.id), filename);
    const source = await measurePipelineStage(
      { projectId, stage: 'objectMaterialization', detail: `Render source for ${clip.id}` },
      () => processingInputForVideo(project.video!, project.id),
    );
    const selectedMusic = clip.music?.enabled
      ? project.musicTracks?.find((track) => track.id === clip.music.trackId)
      : undefined;
    const musicPath = selectedMusic
      ? await materializeProjectMedia(project, path.basename(selectedMusic.storedPath))
      : undefined;
    let lastSaved = 0;
    let pendingProgressSave = Promise.resolve<unknown>(undefined);
    const rendered = await measurePipelineStage(
      { projectId, stage: 'rendering', detail: `Clip ${batchIndex + 1}/${batchTotal}: ${clip.duration}s` },
      () => renderClip(source.value.input, clip, project.transcript, musicPath, outputPath, (progress) => {
        clip.renderProgress = progress;
        project.job.progress = progress;
        if (progress - lastSaved >= 5 || progress === 100) {
          lastSaved = progress;
          pendingProgressSave = pendingProgressSave.then(() => saveProject(project));
        }
      }),
    );
    await pendingProgressSave;
    await persistProjectMedia(project, filename, outputPath, 'video/mp4');
    const existingRenderMs = project.analysis?.timings?.rendering?.durationMs || 0;
    recordProjectTiming(project, 'rendering', existingRenderMs + rendered.durationMs, `${batchIndex + 1}/${batchTotal} clips rendered`);
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

    const isLast = batchIndex + 1 >= batchTotal;
    project.status = isLast ? 'complete' : 'rendering';
    const publishedCount = publishTargets.filter((provider) => clip.publications?.[provider]?.status === 'published').length;
    const failedCount = publishTargets.filter((provider) => clip.publications?.[provider]?.status === 'failed').length;
    const processingCount = publishTargets.length - publishedCount - failedCount;
    project.job = {
      ...project.job,
      status: isLast ? 'complete' : 'rendering',
      stage: isLast ? 'Complete' : `Rendering clip ${batchIndex + 2}/${batchTotal}`,
      progress: isLast ? 100 : 0,
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
    project.job = {
      ...project.job,
      status: 'failed',
      stage: 'Render failed',
      detail: message,
      error: message,
      updatedAt: now(),
    };
    await saveProject(project);
    throw error;
  } finally {
    await cleanupProjectWorkspace(project.id);
  }
}
