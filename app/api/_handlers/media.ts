import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { storageErrorDetails } from '@/lib/b2';
import { getProject } from '@/lib/persistence';
import { IS_VERCEL, projectWorkspacePath } from '@/lib/paths';
import { signedObjectReadUrl } from '@/services/storage';

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
  if (filename !== path.basename(filename)) {
    return NextResponse.json({ error: 'Invalid path.', code: 'INVALID_MEDIA_PATH', retryable: false }, { status: 400 });
  }
  if (IS_VERCEL) {
    try {
      const project = await getProject(projectId);
      const artifact = project?.media?.[filename];
      if (!artifact) {
        return NextResponse.json({ error: 'File not found.', code: 'MEDIA_NOT_FOUND', retryable: false }, { status: 404 });
      }
      const download = request.nextUrl.searchParams.get('download') === '1'
        ? artifact.downloadFilename || filename
        : undefined;
      const signedUrl = await signedObjectReadUrl(artifact.key, download);
      return Response.redirect(signedUrl, 307);
    } catch (error) {
      const detail = storageErrorDetails(error, 'Could not open the stored media.');
      return NextResponse.json(
        { error: detail.error, code: detail.code, retryable: detail.retryable },
        { status: detail.status },
      );
    }
  }
  const directory = projectWorkspacePath(projectId);
  const filePath = path.resolve(directory, filename);
  if (!filePath.startsWith(path.resolve(directory) + path.sep)) {
    return NextResponse.json({ error: 'Invalid path.', code: 'INVALID_MEDIA_PATH', retryable: false }, { status: 400 });
  }
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
    return NextResponse.json({ error: 'File not found.', code: 'MEDIA_NOT_FOUND', retryable: false }, { status: 404 });
  }
}
