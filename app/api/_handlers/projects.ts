import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import type { CaptionSettings, Project } from '@/types';
import { listProjects, saveProject } from '@/lib/db';
import { CLIP_DURATION_OPTIONS, DEFAULT_CLIP_SECONDS } from '@/lib/clip-duration';
import { projectDir } from '@/lib/paths';
import { now, safeFilename, titleFromFilename } from '@/lib/utils';
import { enqueueAnalysis } from '@/services/queue';

const allowedExtensions = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v']);

export async function GET() {
  return NextResponse.json({ projects: listProjects() });
}

export async function POST(request: NextRequest) {
  if (!request.body) return NextResponse.json({ error: 'No video data received.' }, { status: 400 });
  const rawName = request.headers.get('x-file-name');
  if (!rawName) return NextResponse.json({ error: 'Missing file name.' }, { status: 400 });
  let filename = rawName;
  try {
    filename = decodeURIComponent(rawName);
  } catch {
    // Keep the raw ASCII header if it was not URI encoded.
  }
  const extension = path.extname(filename).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    return NextResponse.json({ error: 'Use an MP4, MOV, MKV, WebM or M4V video.' }, { status: 415 });
  }
  const id = randomUUID();
  const requestedDuration = Number(request.headers.get('x-clip-duration'));
  const preferredDuration = CLIP_DURATION_OPTIONS.includes(requestedDuration as (typeof CLIP_DURATION_OPTIONS)[number])
    ? requestedDuration as Project['preferredDuration']
    : DEFAULT_CLIP_SECONDS;
  const captionPresets: CaptionSettings['preset'][] = ['minimal', 'bold', 'hormozi', 'karaoke', 'clean', 'gaming', 'documentary', 'cinematic'];
  const requestedPreset = request.headers.get('x-caption-preset') as CaptionSettings['preset'] | null;
  const defaultCaptionPreset = requestedPreset && captionPresets.includes(requestedPreset) ? requestedPreset : 'bold';
  const storedName = `source${extension}`;
  const outputPath = path.join(projectDir(id), storedName);
  try {
    await pipeline(Readable.fromWeb(request.body as never), createWriteStream(outputPath));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed.' }, { status: 500 });
  }
  const createdAt = now();
  const size = Number(request.headers.get('content-length') || 0);
  const project: Project = {
    id,
    name: titleFromFilename(filename),
    createdAt,
    updatedAt: createdAt,
    status: 'queued',
    sourceUrl: `/api/media/${id}/${storedName}`,
    video: {
      filename: safeFilename(filename),
      storedPath: outputPath,
      size,
      duration: 0,
      width: 0,
      height: 0,
      fps: 0,
      codec: 'probing',
    },
    clips: [],
    transcript: [],
    musicTracks: [],
    transcriptionMode: 'pending',
    preferredDuration,
    defaultCaptionPreset,
    job: {
      id: `analysis:${id}`,
      type: 'analysis',
      status: 'queued',
      stage: 'Queued',
      progress: 2,
      detail: 'Your upload is safely stored on this device',
      updatedAt: createdAt,
    },
  };
  saveProject(project);
  enqueueAnalysis(id);
  return NextResponse.json({ project }, { status: 201 });
}
