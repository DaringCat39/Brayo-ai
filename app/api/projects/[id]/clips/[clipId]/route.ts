import { NextRequest, NextResponse } from 'next/server';
import { getProject, saveProject } from '@/lib/db';
import type { Clip } from '@/types';
import { clamp } from '@/lib/utils';
import { requiredClipDuration } from '@/lib/clip-duration';

export const runtime = 'nodejs';

const allowedKeys: Array<keyof Clip> = [
  'title',
  'hook',
  'alternativeHook',
  'socialCaption',
  'youtubeTitle',
  'hashtags',
  'start',
  'end',
  'transcript',
  'captionSegments',
  'aspectRatio',
  'framing',
  'focusTrack',
  'style',
  'captions',
  'music',
  'autoPublish',
  'hookOverlay',
  'splitPoints',
  'excludedRanges',
];

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; clipId: string }> }) {
  const { id, clipId } = await context.params;
  const project = getProject(id);
  const clip = project?.clips.find((item) => item.id === clipId);
  if (!project || !clip || !project.video) return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  const body = (await request.json()) as Partial<Clip>;
  for (const key of allowedKeys) {
    if (body[key] !== undefined) Object.assign(clip, { [key]: body[key] });
  }
  const minimumDuration = requiredClipDuration(project.video.duration);
  clip.start = clamp(Number(clip.start), 0, Math.max(0, project.video.duration - minimumDuration));
  clip.end = clamp(Number(clip.end), clip.start + minimumDuration, project.video.duration);
  clip.duration = Number((clip.end - clip.start).toFixed(2));
  clip.status = 'suggested';
  clip.renderProgress = 0;
  clip.outputUrl = undefined;
  clip.outputPath = undefined;
  saveProject(project);
  return NextResponse.json({ project, clip });
}
