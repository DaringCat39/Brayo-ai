import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/persistence';
import { enqueueRenderBatch } from '@/services/queue';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  let body: { clipIds?: string[] };
  try {
    body = (await request.json()) as { clipIds?: string[] };
  } catch {
    return NextResponse.json({ error: 'Invalid export request.', code: 'INVALID_JSON', retryable: false }, { status: 400 });
  }
  const ids = (body.clipIds || []).filter((clipId) => project.clips.some((clip) => clip.id === clipId));
  if (!ids.length) {
    return NextResponse.json({ error: 'Select at least one clip to export.', code: 'NO_CLIPS_SELECTED', retryable: false }, { status: 400 });
  }
  try {
    await enqueueRenderBatch(id, ids);
    return NextResponse.json({ queued: ids.length }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The MP4 renders could not be started.';
    console.error('[api/render-batch] Could not queue exports', { projectId: id, clipCount: ids.length, message });
    return NextResponse.json(
      { error: message, code: 'RENDER_QUEUE_FAILED', retryable: true },
      { status: 503 },
    );
  }
}
