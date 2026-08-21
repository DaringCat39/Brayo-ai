import { NextRequest, NextResponse } from 'next/server';
import { getProject, saveProject } from '@/lib/db';
import { publishClip } from '@/services/publishing';
import type { PublishingProvider } from '@/types';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; clipId: string }> }) {
  const { id, clipId } = await context.params;
  const project = getProject(id);
  const clip = project?.clips.find((item) => item.id === clipId);
  if (!project || !clip) return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  if (!clip.outputPath) return NextResponse.json({ error: 'Export the clip before publishing it.' }, { status: 400 });
  const body = await request.json() as { provider?: PublishingProvider };
  if (body.provider !== 'youtube' && body.provider !== 'tiktok') {
    return NextResponse.json({ error: 'Choose YouTube or TikTok.' }, { status: 400 });
  }
  clip.publications = { ...clip.publications, [body.provider]: { status: 'publishing', updatedAt: new Date().toISOString() } };
  saveProject(project);
  clip.publications[body.provider] = await publishClip(project, clip, body.provider);
  saveProject(project);
  const publication = clip.publications[body.provider]!;
  return NextResponse.json({ publication }, { status: publication.status === 'failed' ? 502 : 200 });
}
