import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { get, issueSignedToken, presignUrl, put } from '@vercel/blob';
import type { Project, StoredMediaArtifact, VideoMetadata } from '@/types';
import { IS_VERCEL, projectDir } from '@/lib/paths';

async function exists(filename: string) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

async function downloadPrivateBlob(pathname: string, targetPath: string, expectedSize?: number) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const partialPath = `${targetPath}.${randomUUID()}.part`;
  try {
    const response = await get(pathname, { access: 'private', useCache: false });
    if (!response || response.statusCode !== 200 || !response.stream) {
      throw new Error('Object storage returned an empty response.');
    }

    await pipeline(Readable.fromWeb(response.stream as never), createWriteStream(partialPath));
    const downloaded = await stat(partialPath);
    if (expectedSize && downloaded.size !== expectedSize) {
      throw new Error(`Downloaded ${downloaded.size} of ${expectedSize} bytes.`);
    }
    await rename(partialPath, targetPath);
    return targetPath;
  } catch (error) {
    await unlink(partialPath).catch(() => undefined);
    throw error;
  }
}

export async function materializeVideo(video: VideoMetadata, projectId: string) {
  const targetPath = IS_VERCEL
    ? path.join(projectDir(projectId), path.basename(video.storedPath || video.filename))
    : video.storedPath;
  if (await exists(targetPath)) return targetPath;
  if (video.storageProvider !== 'vercel-blob' || !video.storageUrl) {
    throw new Error('The uploaded source file could not be located.');
  }

  // FFmpeg needs a seekable local file, but this copy is invocation-scoped
  // under /tmp on Vercel and is never treated as persistent project storage.
  return downloadPrivateBlob(video.storageKey || video.storageUrl, targetPath, video.size || undefined);
}

export async function processingInputForVideo(video: VideoMetadata, projectId: string) {
  if (IS_VERCEL && video.storageProvider === 'vercel-blob' && (video.storageKey || video.storageUrl)) {
    // FFmpeg and ffprobe can seek over HTTPS. A short-lived signed URL avoids
    // copying a multi-gigabyte source into /tmp before the real work starts.
    return {
      input: await signedBlobReadUrl(video.storageKey || video.storageUrl!),
      materialized: false,
      mode: 'private-blob-stream' as const,
    };
  }
  return {
    input: await materializeVideo(video, projectId),
    materialized: true,
    mode: 'temporary-file' as const,
  };
}

export async function persistProjectMedia(
  project: Project,
  filename: string,
  localPath: string,
  contentType: string,
): Promise<StoredMediaArtifact | null> {
  if (!IS_VERCEL) return null;
  const info = await stat(localPath);
  const stored = await put(`brayo/media/projects/${project.id}/${filename}`, createReadStream(localPath), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    multipart: true,
  });
  const artifact: StoredMediaArtifact = {
    provider: 'vercel-blob',
    url: stored.url,
    pathname: stored.pathname,
    contentType: stored.contentType,
    size: info.size,
    etag: stored.etag,
  };
  project.media ||= {};
  project.media[filename] = artifact;
  return artifact;
}

export async function materializeProjectMedia(project: Project, filename: string) {
  const targetPath = path.join(projectDir(project.id), path.basename(filename));
  if (await exists(targetPath)) return targetPath;
  const artifact = project.media?.[filename];
  if (!IS_VERCEL || !artifact) throw new Error(`Project media ${filename} could not be located.`);
  return downloadPrivateBlob(artifact.pathname, targetPath, artifact.size || undefined);
}

export async function signedBlobReadUrl(pathname: string, download = false) {
  const validUntil = Date.now() + 60 * 60 * 1000;
  const signedToken = await issueSignedToken({ pathname, operations: ['get'], validUntil });
  const { presignedUrl } = await presignUrl(signedToken, {
    access: 'private',
    operation: 'get',
    pathname,
    validUntil,
  });
  if (!download) return presignedUrl;
  const url = new URL(presignedUrl);
  url.searchParams.set('download', '1');
  return url.toString();
}
