import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Upload } from '@aws-sdk/lib-storage';
import type { Project, StoredMediaArtifact, VideoMetadata } from '@/types';
import {
  b2BucketName,
  b2Client,
  deleteObjectVersion,
  deleteOlderObjectVersions,
  getB2Object,
  projectMediaKey,
  signedB2ReadUrl,
} from '@/lib/b2';
import { IS_VERCEL, projectDir } from '@/lib/paths';
import { assertCurrentProject } from '@/lib/persistence';

async function exists(filename: string) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

async function downloadPrivateObject(key: string, targetPath: string, expectedSize?: number) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const partialPath = `${targetPath}.${randomUUID()}.part`;
  try {
    const response = await getB2Object(key);
    if (!response.Body) throw new Error('Object storage returned an empty response.');
    const body = response.Body instanceof Readable
      ? response.Body
      : Readable.from(response.Body as unknown as AsyncIterable<Uint8Array>);
    await pipeline(body, createWriteStream(partialPath));
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
  if (video.storageProvider !== 'backblaze-b2' || !video.storageKey) {
    throw new Error('The uploaded source file could not be located.');
  }

  // FFmpeg scratch materialisation is invocation-scoped under /tmp on Vercel.
  // The persistent source remains private in B2.
  return downloadPrivateObject(video.storageKey, targetPath, video.size || undefined);
}

export async function processingInputForVideo(video: VideoMetadata, projectId: string) {
  if (IS_VERCEL && video.storageProvider === 'backblaze-b2' && video.storageKey) {
    // FFmpeg and ffprobe can seek over a short-lived private HTTPS URL, avoiding
    // a separate full source download when the codec operation supports it.
    return {
      input: await signedB2ReadUrl(video.storageKey),
      materialized: false,
      mode: 'private-b2-stream' as const,
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
  await assertCurrentProject(project.id);
  const info = await stat(localPath);
  const key = projectMediaKey(project.id, filename);
  const stored = await new Upload({
    client: b2Client(),
    params: {
      Bucket: b2BucketName(),
      Key: key,
      Body: createReadStream(localPath),
      ContentType: contentType,
      CacheControl: 'private, max-age=0, must-revalidate',
    },
    queueSize: 3,
    partSize: 16 * 1024 * 1024,
    leavePartsOnError: false,
  }).done();
  try {
    await assertCurrentProject(project.id);
  } catch (error) {
    await deleteObjectVersion(key, stored.VersionId);
    throw error;
  }
  await deleteOlderObjectVersions(key, stored.VersionId);
  const artifact: StoredMediaArtifact = {
    provider: 'backblaze-b2',
    key,
    contentType,
    size: info.size,
    etag: stored.ETag || '',
    versionId: stored.VersionId,
  };
  project.media ||= {};
  project.media[filename] = artifact;
  return artifact;
}

export async function materializeProjectMedia(project: Project, filename: string) {
  const targetPath = path.join(projectDir(project.id), path.basename(filename));
  if (await exists(targetPath)) return targetPath;
  const artifact = project.media?.[filename];
  if (!IS_VERCEL || !artifact || artifact.provider !== 'backblaze-b2') {
    throw new Error(`Project media ${filename} could not be located.`);
  }
  return downloadPrivateObject(artifact.key, targetPath, artifact.size || undefined);
}

export async function signedObjectReadUrl(key: string, downloadFilename?: string) {
  return signedB2ReadUrl(key, downloadFilename);
}
