import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NextRequest } from 'next/server';
import { projectDir } from '@/lib/paths';

const contentTypes: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
};

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string; filename: string }> }) {
  const { projectId, filename } = await context.params;
  if (filename !== path.basename(filename)) return new Response('Invalid path.', { status: 400 });
  const directory = projectDir(projectId);
  const filePath = path.resolve(directory, filename);
  if (!filePath.startsWith(path.resolve(directory) + path.sep)) return new Response('Invalid path.', { status: 400 });
  try {
    const info = await stat(filePath);
    const type = contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const range = request.headers.get('range');
    const download = request.nextUrl.searchParams.get('download') === '1';
    const commonHeaders: Record<string, string> = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=0, must-revalidate',
    };
    if (download) commonHeaders['Content-Disposition'] = `attachment; filename="${filename}"`;
    if (range) {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
      if (start > end || start >= info.size) return new Response(null, { status: 416 });
      const stream = createReadStream(filePath, { start, end });
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          ...commonHeaders,
          'Content-Range': `bytes ${start}-${end}/${info.size}`,
          'Content-Length': String(end - start + 1),
        },
      });
    }
    const stream = createReadStream(filePath);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: { ...commonHeaders, 'Content-Length': String(info.size) },
    });
  } catch {
    return new Response('File not found.', { status: 404 });
  }
}
