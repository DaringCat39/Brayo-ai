import { NextRequest, NextResponse } from 'next/server';
import { getProject, saveProject } from '@/lib/db';
import type { CaptionSettings, Project } from '@/types';
import { CLIP_DURATION_OPTIONS } from '@/lib/clip-duration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  const body = (await request.json()) as Partial<Pick<Project, 'name' | 'preferredDuration' | 'defaultCaptionPreset'>>;
  if (typeof body.name === 'string' && body.name.trim()) project.name = body.name.trim().slice(0, 120);
  if (CLIP_DURATION_OPTIONS.includes(Number(body.preferredDuration) as (typeof CLIP_DURATION_OPTIONS)[number])) {
    project.preferredDuration = Number(body.preferredDuration) as Project['preferredDuration'];
  }
  const captionPresets: CaptionSettings['preset'][] = ['minimal', 'bold', 'hormozi', 'karaoke', 'clean', 'gaming', 'documentary', 'cinematic'];
  if (body.defaultCaptionPreset && captionPresets.includes(body.defaultCaptionPreset)) project.defaultCaptionPreset = body.defaultCaptionPreset;
  saveProject(project);
  return NextResponse.json({ project });
}
