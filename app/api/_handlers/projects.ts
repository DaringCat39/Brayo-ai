import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import type { HeadObjectCommandOutput } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import type { CaptionSettings, CompletedVideoUpload, Project, UploadStorageProvider } from '@/types';
import {
  b2BucketName,
  headB2Object,
  logB2Diagnostic,
  projectSourceKey,
  storageErrorDetails,
  validateB2RuntimeConfiguration,
  verifyUploadSession,
} from '@/lib/b2';
import { activateCurrentProject, getProject, listProjects } from '@/lib/persistence';
import { CLIP_DURATION_OPTIONS, DEFAULT_CLIP_SECONDS } from '@/lib/clip-duration';
import { IS_VERCEL, projectDir, projectWorkspacePath } from '@/lib/paths';
import { isAllowedVideoExtension } from '@/lib/upload-config';
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

function jsonError(
  error: string,
  code: string,
  status: number,
  retryable = false,
  missingVariables: readonly string[] = [],
) {
  return NextResponse.json({
    error,
    code,
    retryable,
    ...(missingVariables.length ? { missingVariables } : {}),
  }, { status });
}

async function makeProject(options: {
  id?: string;
  filename: string;
  size: number;
  sourceUrl: string;
  storageProvider: UploadStorageProvider;
  storageKey?: string;
  storageVersionId?: string;
  preferredDuration: Project['preferredDuration'];
  defaultCaptionPreset: CaptionSettings['preset'];
}) {
  const extension = path.extname(options.filename).toLowerCase();
  const id = options.id || randomUUID();
  const storedName = `source${extension}`;
  // Registering a completed object upload does not create a persistent Vercel
  // directory. This is only the future /tmp FFmpeg workspace location.
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
      storageKey: options.storageKey,
      storageVersionId: options.storageVersionId,
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
    storageReady: options.storageProvider === 'local',
    job: {
      id: `analysis:${id}`,
      type: 'analysis',
      status: 'queued',
      stage: 'Queued',
      progress: 2,
      detail: options.storageProvider === 'backblaze-b2'
        ? 'Direct upload complete; analysis queued'
        : 'Your upload is safely stored on this device',
      updatedAt: createdAt,
    },
  };
  await activateCurrentProject(project);
  await enqueueAnalysis(id);
  return project;
}

async function registerDirectUpload(request: NextRequest) {
  try {
    validateB2RuntimeConfiguration();
  } catch (error) {
    const detail = storageErrorDetails(error, 'Private object storage configuration is invalid.');
    return jsonError(detail.error, detail.code, detail.status, detail.retryable, detail.missingVariables);
  }

  let body: DirectProjectRequest;
  try {
    body = await request.json() as DirectProjectRequest;
  } catch {
    return jsonError('Invalid upload metadata.', 'INVALID_JSON', 400);
  }

  const upload = body.upload;
  try {
    if (!upload || upload.provider !== 'backblaze-b2' || !upload.sessionToken) {
      return jsonError('Invalid video upload metadata.', 'INVALID_UPLOAD_METADATA', 400);
    }
    const claims = verifyUploadSession(upload.sessionToken);
    const extension = path.extname(claims.filename).toLowerCase();
    if (
      !isAllowedVideoExtension(extension)
      || upload.projectId !== claims.projectId
      || upload.key !== claims.key
      || upload.key !== projectSourceKey(claims.projectId, extension)
      || upload.bucket !== b2BucketName()
      || upload.size !== claims.size
    ) {
      return jsonError('Invalid video upload metadata.', 'INVALID_UPLOAD_METADATA', 400);
    }

    let stored: HeadObjectCommandOutput;
    try {
      stored = await headB2Object(claims.key);
    } catch (error) {
      logB2Diagnostic('project.upload-verification.failed', {
        projectId: claims.projectId,
        key: claims.key,
      }, error);
      throw error;
    }
    if (
      stored.ContentLength !== claims.size
      || stored.ETag !== upload.etag
      || (upload.versionId && stored.VersionId !== upload.versionId)
    ) {
      logB2Diagnostic('project.upload-verification.mismatch', {
        projectId: claims.projectId,
        key: claims.key,
        expectedSize: claims.size,
        storedSize: stored.ContentLength,
      });
      return jsonError('The completed upload could not be verified.', 'UPLOAD_VERIFICATION_FAILED', 400, true);
    }
    logB2Diagnostic('project.upload-verification.completed', {
      projectId: claims.projectId,
      key: claims.key,
      size: stored.ContentLength,
      requestId: stored.$metadata.requestId,
    });

    // Registration is idempotent: if the small response was lost after the
    // project was created, retrying must not erase analysis already in flight.
    const existing = await getProject(claims.projectId);
    if (existing?.video?.storageKey === claims.key && existing.video.size === claims.size) {
      if (!existing.storageReady) {
        await activateCurrentProject(existing);
        await enqueueAnalysis(existing.id);
      }
      return NextResponse.json({ project: existing });
    }
    if (existing) {
      return jsonError('This upload identifier is already in use.', 'UPLOAD_ALREADY_REGISTERED', 409);
    }

    // Only verified metadata reaches this Function. Video bytes travelled
    // directly from the browser to the private B2 bucket.
    const project = await makeProject({
      id: claims.projectId,
      filename: claims.filename,
      size: claims.size,
      sourceUrl: `/api/projects/${claims.projectId}/source`,
      storageProvider: 'backblaze-b2',
      storageKey: claims.key,
      storageVersionId: stored.VersionId,
      preferredDuration: preferredDuration(body.preferredDuration),
      defaultCaptionPreset: captionPreset(body.captionPreset),
    });
    logB2Diagnostic('project.created', {
      projectId: claims.projectId,
      key: claims.key,
      size: claims.size,
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /upload session|Invalid project/i.test(error.message)) {
      return jsonError(error.message, 'INVALID_UPLOAD_SESSION', 400);
    }
    const detail = storageErrorDetails(error, 'The completed upload could not be verified in object storage.');
    return jsonError(detail.error, detail.code, detail.status, detail.retryable, detail.missingVariables);
  }
}

export async function GET() {
  try {
    return NextResponse.json({ projects: await listProjects() });
  } catch (error) {
    const detail = storageErrorDetails(error, 'Projects could not be read from object storage.');
    console.error('[api/projects] Project storage request failed', {
      code: detail.code,
      status: detail.status,
      error: detail.error,
    });
    return jsonError(detail.error, detail.code, detail.status, detail.retryable, detail.missingVariables);
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get('content-type')?.includes('application/json')) {
    return registerDirectUpload(request);
  }

  if (IS_VERCEL) {
    return jsonError('Production video uploads must use the direct object-storage flow.', 'DIRECT_UPLOAD_REQUIRED', 409);
  }

  if (!request.body) return jsonError('No video data received.', 'EMPTY_UPLOAD', 400);
  const rawName = request.headers.get('x-file-name');
  if (!rawName) return jsonError('Missing file name.', 'MISSING_FILENAME', 400);
  let filename = rawName;
  try {
    filename = decodeURIComponent(rawName);
  } catch {
    // Keep the raw ASCII header if it was not URI encoded.
  }
  const extension = path.extname(filename).toLowerCase();
  if (!isAllowedVideoExtension(extension)) {
    return jsonError('Use an MP4, MOV, MKV, WebM or M4V video.', 'VIDEO_TYPE_NOT_ALLOWED', 415);
  }
  const id = randomUUID();
  const storedName = `source${extension}`;
  const outputPath = path.join(projectDir(id), storedName);
  try {
    await pipeline(Readable.fromWeb(request.body as never), createWriteStream(outputPath));
  } catch (error) {
    await unlink(outputPath).catch(() => undefined);
    return jsonError(error instanceof Error ? error.message : 'Upload failed.', 'LOCAL_UPLOAD_FAILED', 500, true);
  }
  const size = Number(request.headers.get('content-length') || 0);
  // Local development retains its streamed upload path and never buffers the
  // complete video in memory.
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
