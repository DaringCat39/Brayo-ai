import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/persistence';
import { enqueueRender } from '@/services/queue';
import { effectiveClipDuration, MIN_CLIP_SECONDS } from '@/lib/clip-duration';

export async function POST(_: NextRequest, context: { params: Promise<{ id: string; clipId: string }> }) {
  const { id, clipId } = await context.params;
  const project = await getProject(id);
  const clip = project?.clips.find((item) => item.id === clipId);
  if (!project || !clip) {
    return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  }
  if ((project.video?.duration || 0) >= MIN_CLIP_SECONDS && effectiveClipDuration(clip) < MIN_CLIP_SECONDS) {
    return NextResponse.json({ error: 'Keep at least 61 seconds after cuts before exporting.' }, { status: 400 });
  }
  try {
    await enqueueRender(id, clipId);
    return NextResponse.json({ queued: true }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The MP4 render could not be started.';
    console.error('[api/render] Could not queue clip export', { projectId: id, clipId, message });
    return NextResponse.json(
      { error: message, code: 'RENDER_QUEUE_FAILED', retryable: true },
      { status: 503 },
    );
  }
}
