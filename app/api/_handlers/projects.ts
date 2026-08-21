import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { head } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import type { CaptionSettings, CompletedVideoUpload, Project } from '@/types';
import { listProjects, saveProject } from '@/lib/persistence';
import { CLIP_DURATION_OPTIONS, DEFAULT_CLIP_SECONDS } from '@/lib/clip-duration';
import { IS_VERCEL, projectDir, projectWorkspacePath } from '@/lib/paths';
import { BLOB_VIDEO_PREFIX, isAllowedVideoExtension } from '@/lib/upload-config';
import { now, safeFilename, titleFromFilename } from '@/lib/utils';
import { enqueueAnalysis } from '@/services/queue';

const captionPresets: CaptionSettings['preset'][] = ['minimal', 'bold', 'hormozi', 'karaoke', 'clean', 'gaming', 'documentary', 'cinematic'];

interface DirectProjectRequest {
  filename: string;
  preferredDuration?: number;
  captionPreset?: CaptionSettings['preset'];
  upload: CompletedVideoUpload;
}

function preferredDuration(value: unknown): Project['preferredDuration'] {
  const requested = Number(value);
  return CLIP_DURATION_OPTIONS.includes(requested as (typeof CLIP_DURATION_OPTIONS)[number])
    ? requested as Project['preferredDuration']
    : DEFAULT_CLIP_SECONDS;
}

function captionPreset(value: unknown): CaptionSettings['preset'] {
  return captionPresets.includes(value as CaptionSettings['preset']) ? value as CaptionSettings['preset'] : 'bold';
}

async function makeProject(options: {
  id?: string;
  filename: string;
  size: number;
  sourceUrl: string;
  storageProvider: 'local' | 'vercel-blob';
  storageUrl?: string;
  storageKey?: string;
  preferredDuration: Project['preferredDuration'];
  defaultCaptionPreset: CaptionSettings['preset'];
}) {
  const extension = path.extname(options.filename).toLowerCase();
  const id = options.id || randomUUID();
  const storedName = `source${extension}`;
  // Merely registering a completed Blob upload must not create a filesystem
  // directory. The path is only a future FFmpeg workspace location.
  const outputPath = path.join(projectWorkspacePath(id), storedName);
  const createdAt = now();
  const project: Project = {
    id,
    name: titleFromFilename(options.filename),
    createdAt,
    updatedAt: createdAt,
    status: 'queued',
    sourceUrl: options.sourceUrl,
    video: {
      filename: safeFilename(options.filename),
      storedPath: outputPath,
      storageProvider: options.storageProvider,
      storageUrl: options.storageUrl,
      storageKey: options.storageKey,
      size: options.size,
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
    preferredDuration: options.preferredDuration,
    defaultCaptionPreset: options.defaultCaptionPreset,
    job: {
      id: `analysis:${id}`,
      type: 'analysis',
      status: 'queued',
      stage: 'Queued',
      progress: 2,
      detail: options.storageProvider === 'vercel-blob'
        ? 'Direct upload complete; analysis queued'
        : 'Your upload is safely stored on this device',
      updatedAt: createdAt,
    },
  };
  await saveProject(project);
  enqueueAnalysis(id);
  return project;
}

async function registerDirectUpload(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Direct object storage is not configured.' }, { status: 503 });
  }

  let body: DirectProjectRequest;
  try {
    body = await request.json() as DirectProjectRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid upload metadata.' }, { status: 400 });
  }

  const extension = path.extname(body.filename || '').toLowerCase();
  const upload = body.upload;
  if (
    !isAllowedVideoExtension(extension)
    || upload?.provider !== 'vercel-blob'
    || !upload.url
    || !upload.pathname?.startsWith(BLOB_VIDEO_PREFIX)
  ) {
    return NextResponse.json({ error: 'Invalid video upload metadata.' }, { status: 400 });
  }

  try {
    const uploadUrl = new URL(upload.url);
    if (!uploadUrl.hostname.endsWith('.private.blob.vercel-storage.com')) {
      return NextResponse.json({ error: 'The upload does not belong to the configured private Blob store.' }, { status: 400 });
    }
    const stored = await head(upload.url);
    if (
      stored.pathname !== upload.pathname
      || stored.size !== upload.size
      || stored.etag !== upload.etag
      || stored.contentType !== upload.contentType
      || !stored.pathname.startsWith(BLOB_VIDEO_PREFIX)
    ) {
      return NextResponse.json({ error: 'The completed upload could not be verified.' }, { status: 400 });
    }

    // Only compact, verified metadata reaches this Function. The video bytes
    // have already travelled directly from the browser to object storage.
    const id = randomUUID();
    const project = await makeProject({
      id,
      filename: body.filename,
      size: stored.size,
      sourceUrl: `/api/projects/${id}/source`,
      storageProvider: 'vercel-blob',
      storageUrl: stored.url,
      storageKey: stored.pathname,
      preferredDuration: preferredDuration(body.preferredDuration),
      defaultCaptionPreset: captionPreset(body.captionPreset),
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? `Could not verify the completed upload: ${error.message}` : 'Could not verify the completed upload.' },
      { status: 400 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ projects: await listProjects() });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('content-type')?.includes('application/json')) {
    return registerDirectUpload(request);
  }

  if (IS_VERCEL) {
    return NextResponse.json(
      { error: 'Vercel video uploads must use the direct Blob upload flow.' },
      { status: 409 },
    );
  }

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
  if (!isAllowedVideoExtension(extension)) {
    return NextResponse.json({ error: 'Use an MP4, MOV, MKV, WebM or M4V video.' }, { status: 415 });
  }
  const id = randomUUID();
  const storedName = `source${extension}`;
  const outputPath = path.join(projectDir(id), storedName);
  try {
    await pipeline(Readable.fromWeb(request.body as never), createWriteStream(outputPath));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed.' }, { status: 500 });
  }
  const size = Number(request.headers.get('content-length') || 0);
  // Local development keeps the original streamed upload path. It writes the
  // request incrementally and never buffers the complete video in memory.
  const project = await makeProject({
    id,
    filename,
    size,
    sourceUrl: `/api/media/${id}/${storedName}`,
    storageProvider: 'local',
    preferredDuration: preferredDuration(request.headers.get('x-clip-duration')),
    defaultCaptionPreset: captionPreset(request.headers.get('x-caption-preset')),
  });
  return NextResponse.json({ project }, { status: 201 });
}
