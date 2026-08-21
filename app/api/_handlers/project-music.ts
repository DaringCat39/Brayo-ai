import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { unlink } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { getProject, saveProject } from '@/lib/persistence';
import { IS_VERCEL, projectDir } from '@/lib/paths';
import { safeFilename } from '@/lib/utils';
import { probeAudio } from '@/services/ffmpeg';
import { persistProjectMedia } from '@/services/storage';

const allowedExtensions = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  if (!request.body) return NextResponse.json({ error: 'No audio data received.' }, { status: 400 });
  let filename = request.headers.get('x-file-name') || 'music.mp3';
  try { filename = decodeURIComponent(filename); } catch { /* Keep safe header text. */ }
  const extension = path.extname(filename).toLowerCase();
  if (!allowedExtensions.has(extension)) return NextResponse.json({ error: 'Use MP3, WAV, M4A, AAC, OGG or FLAC audio.' }, { status: 415 });
  const trackId = randomUUID();
  const storedFilename = `music-${trackId}${extension}`;
  const storedPath = path.join(projectDir(id), storedFilename);
  try {
    await pipeline(Readable.fromWeb(request.body as never), createWriteStream(storedPath));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Music upload failed.' }, { status: 500 });
  }
  let duration = 0;
  try {
    duration = await probeAudio(storedPath);
  } catch (error) {
    await unlink(storedPath).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'This audio file could not be played.' }, { status: 415 });
  }
  const contentTypes: Record<string, string> = {
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
    '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
  };
  try {
    const storage = await persistProjectMedia(project, storedFilename, storedPath, contentTypes[extension] || 'application/octet-stream');
    project.musicTracks ||= [];
    const track = {
      id: trackId,
      name: safeFilename(filename).replace(/\.[^/.]+$/, '').replace(/-/g, ' '),
      filename: safeFilename(filename),
      storedPath,
      url: `/api/media/${id}/${storedFilename}`,
      storage: storage || undefined,
      duration,
    };
    project.musicTracks.push(track);
    await saveProject(project);
    return NextResponse.json({ project, track }, { status: 201 });
  } finally {
    if (IS_VERCEL) await unlink(storedPath).catch(() => undefined);
  }
}
