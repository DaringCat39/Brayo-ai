import path from 'node:path';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import type { UploadCapabilities } from '@/types';
import {
  BLOB_VIDEO_PREFIX,
  DEFAULT_MAX_VIDEO_UPLOAD_BYTES,
  isAllowedVideoExtension,
  VIDEO_CONTENT_TYPES,
} from '@/lib/upload-config';

declare global {
  // A lightweight abuse guard for this unauthenticated local-first app. A
  // persistent/auth-backed limiter can replace it when user accounts exist.
  // eslint-disable-next-line no-var
  var brayoUploadTokenWindows: Map<string, { count: number; resetsAt: number }> | undefined;
}

const tokenWindows = global.brayoUploadTokenWindows || new Map<string, { count: number; resetsAt: number }>();
global.brayoUploadTokenWindows = tokenWindows;

function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function maximumUploadBytes() {
  const configured = Number(process.env.MAX_VIDEO_UPLOAD_BYTES);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_VIDEO_UPLOAD_BYTES;
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const expectedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const expectedProtocol = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '');
  try {
    return new URL(origin).host === expectedHost && new URL(origin).protocol === `${expectedProtocol}:`;
  } catch {
    return false;
  }
}

function withinTokenRate(request: NextRequest) {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const time = Date.now();
  const current = tokenWindows.get(key);
  if (!current || current.resetsAt <= time) {
    tokenWindows.set(key, { count: 1, resetsAt: time + 60 * 60 * 1000 });
    return true;
  }
  if (current.count >= 20) return false;
  current.count += 1;
  return true;
}

export async function GET() {
  const capabilities: UploadCapabilities = blobConfigured()
    ? { provider: 'vercel-blob', direct: true, multipart: true, localFallback: false }
    : { provider: 'local', direct: false, multipart: false, localFallback: !process.env.VERCEL };

  return NextResponse.json(capabilities);
}

export async function POST(request: NextRequest) {
  if (!blobConfigured()) {
    return NextResponse.json(
      { error: 'Direct storage is not configured. Local uploads remain available in development.' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json() as HandleUploadBody;
    if (body.type === 'blob.generate-client-token') {
      if (!isSameOrigin(request)) {
        return NextResponse.json({ error: 'Upload authorization must come from this app.' }, { status: 403 });
      }
      if (!withinTokenRate(request)) {
        return NextResponse.json({ error: 'Too many upload attempts. Try again later.' }, { status: 429 });
      }
    }

    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, _clientPayload, multipart) => {
        const extension = path.extname(pathname).toLowerCase();
        if (!multipart) {
          throw new Error('Video uploads must use the multipart transfer path.');
        }
        if (!pathname.startsWith(BLOB_VIDEO_PREFIX) || !isAllowedVideoExtension(extension)) {
          throw new Error('Use an MP4, MOV, MKV, WebM or M4V video.');
        }

        return {
          allowedContentTypes: [...VIDEO_CONTENT_TYPES],
          maximumSizeInBytes: maximumUploadBytes(),
          addRandomSuffix: true,
        };
      },
      // Project creation happens through the small metadata request sent after
      // upload() resolves. This avoids relying on a webhook in localhost and
      // guarantees analysis never starts before every multipart part completes.
      onUploadCompleted: async () => undefined,
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not authorize the direct upload.' },
      { status: 400 },
    );
  }
}
