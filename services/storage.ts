import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { get } from '@vercel/blob';
import type { VideoMetadata } from '@/types';

async function exists(filename: string) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

export async function materializeVideo(video: VideoMetadata) {
  if (await exists(video.storedPath)) return video.storedPath;
  if (video.storageProvider !== 'vercel-blob' || !video.storageUrl) {
    throw new Error('The uploaded source file could not be located.');
  }

  await mkdir(path.dirname(video.storedPath), { recursive: true });
  const partialPath = `${video.storedPath}.${randomUUID()}.part`;
  try {
    const response = await get(video.storageKey || video.storageUrl, { access: 'private' });
    if (!response || response.statusCode !== 200 || !response.stream) {
      throw new Error('Object storage returned an empty response.');
    }

    // FFmpeg needs a seekable file. Stream the completed object to the runtime
    // filesystem without ever creating an in-memory ArrayBuffer/Buffer copy.
    await pipeline(Readable.fromWeb(response.stream as never), createWriteStream(partialPath));
    const downloaded = await stat(partialPath);
    if (video.size > 0 && downloaded.size !== video.size) {
      throw new Error(`Downloaded ${downloaded.size} of ${video.size} video bytes.`);
    }
    await rename(partialPath, video.storedPath);
    return video.storedPath;
  } catch (error) {
    await unlink(partialPath).catch(() => undefined);
    throw error;
  }
}
