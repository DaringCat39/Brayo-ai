import { start } from 'workflow/api';
import { getProject, saveProject } from '@/lib/persistence';
import { now } from '@/lib/utils';
import { analyseProjectWorkflow, renderProjectWorkflow } from '@/workflows/video-processing';

export async function enqueueAnalysis(projectId: string) {
  try {
    return await start(analyseProjectWorkflow, [projectId]);
  } catch (error) {
    const project = await getProject(projectId);
    if (project) {
      const message = error instanceof Error ? error.message : 'Could not start the durable analysis workflow.';
      project.status = 'failed';
      project.error = message;
      project.job = {
        ...project.job,
        status: 'failed',
        stage: 'Analysis failed to start',
        detail: message,
        error: message,
        updatedAt: now(),
      };
      await saveProject(project);
    }
    throw error;
  }
}

export async function enqueueRenderBatch(projectId: string, clipIds: string[]) {
  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found.');
  const validIds = clipIds.filter((clipId, index) =>
    clipIds.indexOf(clipId) === index
    && project.clips.some((clip) => clip.id === clipId && clip.status !== 'rendering'),
  );
  if (!validIds.length) return null;
  for (const clipId of validIds) {
    const clip = project.clips.find((item) => item.id === clipId)!;
    clip.status = 'queued';
    clip.renderProgress = 0;
  }
  project.status = 'rendering';
  project.job = {
    id: `render:${projectId}`,
    type: 'render',
    status: 'rendering',
    stage: `Rendering clip 1/${validIds.length}`,
    progress: 0,
    detail: 'Durable render queued on Vercel',
    updatedAt: now(),
  };
  await saveProject(project);
  try {
    return await start(renderProjectWorkflow, [projectId, validIds]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start the durable render workflow.';
    for (const clipId of validIds) {
      const clip = project.clips.find((item) => item.id === clipId)!;
      clip.status = 'failed';
    }
    project.status = 'ready';
    project.job = {
      ...project.job,
      status: 'failed',
      stage: 'Render failed to start',
      detail: message,
      error: message,
      updatedAt: now(),
    };
    await saveProject(project);
    throw error;
  }
}

export async function enqueueRender(projectId: string, clipId: string) {
  return enqueueRenderBatch(projectId, [clipId]);
}
