import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db';
import { enqueueRender } from '@/services/queue';
import { effectiveClipDuration, MIN_CLIP_SECONDS } from '@/lib/clip-duration';

export const runtime = 'nodejs';

export async function POST(_: NextRequest, context: { params: Promise<{ id: string; clipId: string }> }) {
  const { id, clipId } = await context.params;
  const project = getProject(id);
  const clip = project?.clips.find((item) => item.id === clipId);
  if (!project || !clip) {
    return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  }
  if ((project.video?.duration || 0) >= MIN_CLIP_SECONDS && effectiveClipDuration(clip) < MIN_CLIP_SECONDS) {
    return NextResponse.json({ error: 'Keep at least 61 seconds after cuts before exporting.' }, { status: 400 });
  }
  enqueueRender(id, clipId);
  return NextResponse.json({ queued: true }, { status: 202 });
}
