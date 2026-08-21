import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db';
import { enqueueRender } from '@/services/queue';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  const body = (await request.json()) as { clipIds?: string[] };
  const ids = (body.clipIds || []).filter((clipId) => project.clips.some((clip) => clip.id === clipId));
  ids.forEach((clipId) => enqueueRender(id, clipId));
  return NextResponse.json({ queued: ids.length }, { status: 202 });
}
