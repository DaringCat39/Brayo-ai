import { NextRequest, NextResponse } from 'next/server';
import { getProject, saveProject } from '@/lib/db';
import { now } from '@/lib/utils';
import { enqueueAnalysis } from '@/services/queue';

export const runtime = 'nodejs';

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  project.status = 'queued';
  project.error = undefined;
  project.job = {
    id: `analysis:${id}`,
    type: 'analysis',
    status: 'queued',
    stage: 'Queued',
    progress: 1,
    detail: 'Analysis is ready to restart',
    updatedAt: now(),
  };
  saveProject(project);
  enqueueAnalysis(id);
  return NextResponse.json({ project }, { status: 202 });
}
