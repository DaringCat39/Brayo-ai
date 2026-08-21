import { NextRequest, NextResponse } from 'next/server';
import { getProject, saveProject } from '@/lib/db';
import { analyseActionFocus } from '@/services/ffmpeg';
import { materializeVideo } from '@/services/storage';

export async function POST(_: NextRequest, context: { params: Promise<{ id: string; clipId: string }> }) {
  const { id, clipId } = await context.params;
  const project = getProject(id);
  const clip = project?.clips.find((item) => item.id === clipId);
  if (!project || !clip || !project.video) return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  try {
    const sourcePath = await materializeVideo(project.video);
    clip.focusTrack = await analyseActionFocus(sourcePath, clip.start, clip.end);
    saveProject(project);
    return NextResponse.json({ focusTrack: clip.focusTrack });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Action tracking failed.' }, { status: 500 });
  }
}
