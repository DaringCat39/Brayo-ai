import path from 'node:path';
import type { CompletedPart } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import type { CompletedVideoUpload, MultipartUploadSession, UploadCapabilities } from '@/types';
import {
  abortB2MultipartUpload,
  b2BucketName,
  b2Configured,
  completeB2MultipartUpload,
  configuredAppOrigin,
  createB2MultipartUpload,
  multipartPartSize,
  signB2UploadParts,
  storageErrorDetails,
  validateB2RuntimeConfiguration,
  verifyUploadSession,
} from '@/lib/b2';
import {
  DEFAULT_MAX_VIDEO_UPLOAD_BYTES,
  isAllowedVideoExtension,
  VIDEO_CONTENT_TYPES,
} from '@/lib/upload-config';
import { safeFilename } from '@/lib/utils';

declare global {
  // A lightweight abuse guard for this unauthenticated local-first app. A
  // persistent/auth-backed limiter can replace it when user accounts exist.
  // eslint-disable-next-line no-var
  var brayoUploadTokenWindows: Map<string, { count: number; resetsAt: number }> | undefined;
}

const tokenWindows = global.brayoUploadTokenWindows || new Map<string, { count: number; resetsAt: number }>();
global.brayoUploadTokenWindows = tokenWindows;

class UploadRequestError extends Error {
  constructor(
    message: string,
    readonly code = 'INVALID_UPLOAD_REQUEST',
    readonly status = 400,
    readonly retryable = false,
  ) {
    super(message);
  }
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
    const parsed = new URL(origin);
    const requestOrigin = `${expectedProtocol}://${expectedHost}`;
    const configuredOrigin = configuredAppOrigin(request.nextUrl.origin);
    return parsed.origin === requestOrigin && (!process.env.VERCEL || parsed.origin === configuredOrigin);
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

export async function GET() {
  const configured = b2Configured();
  if (!configured && !process.env.VERCEL) {
    const capabilities: UploadCapabilities = {
      provider: 'local',
      direct: false,
      multipart: false,
      localFallback: true,
    };
    return NextResponse.json(capabilities);
  }
  try {
    validateB2RuntimeConfiguration();
  } catch (error) {
    const detail = storageErrorDetails(error, 'Private object storage configuration is invalid.');
    return jsonError(detail.error, detail.code, detail.status, detail.retryable, detail.missingVariables);
  }
  const capabilities: UploadCapabilities = {
    provider: 'backblaze-b2',
    direct: true,
    multipart: true,
    localFallback: false,
  };
  return NextResponse.json(capabilities);
}

export async function POST(request: NextRequest) {
  try {
    validateB2RuntimeConfiguration();
  } catch (error) {
    const detail = storageErrorDetails(error, 'Private object storage configuration is invalid.');
    return jsonError(detail.error, detail.code, detail.status, detail.retryable, detail.missingVariables);
  }
  if (!isSameOrigin(request)) {
    return jsonError('Upload authorization must come from this app.', 'UPLOAD_ORIGIN_REJECTED', 403);
  }
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = body.action;

    if (action === 'initiate') {
      if (!withinTokenRate(request)) {
        throw new UploadRequestError('Too many upload attempts. Try again later.', 'UPLOAD_RATE_LIMITED', 429, true);
      }
      const filename = safeFilename(String(body.filename || '')).slice(-140);
      const extension = path.extname(filename).toLowerCase();
      const requestedType = String(body.contentType || 'application/octet-stream').toLowerCase();
      const contentType = VIDEO_CONTENT_TYPES.includes(requestedType as (typeof VIDEO_CONTENT_TYPES)[number])
        ? requestedType
        : 'application/octet-stream';
      const size = Number(body.size);
      if (!isAllowedVideoExtension(extension)) {
        throw new UploadRequestError('Use an MP4, MOV, MKV, WebM or M4V video.', 'VIDEO_TYPE_NOT_ALLOWED', 415);
      }
      if (!Number.isSafeInteger(size) || size <= 0 || size > maximumUploadBytes()) {
        throw new UploadRequestError(
          `Video size must be between 1 byte and ${maximumUploadBytes()} bytes.`,
          'VIDEO_SIZE_NOT_ALLOWED',
          413,
        );
      }
      const created = await createB2MultipartUpload({ filename, extension, contentType, size });
      const partSize = multipartPartSize(size);
      const session: MultipartUploadSession = {
        projectId: created.claims.projectId,
        key: created.claims.key,
        sessionToken: created.sessionToken,
        partSize,
        partCount: Math.ceil(size / partSize),
      };
      return NextResponse.json({ session });
    }

    const sessionToken = String(body.sessionToken || '');
    const claims = verifyUploadSession(sessionToken);

    if (action === 'sign-parts') {
      const partNumbers = Array.isArray(body.partNumbers) ? body.partNumbers.map(Number) : [];
      const parts = await signB2UploadParts(claims, partNumbers);
      return NextResponse.json({ parts });
    }

    if (action === 'complete') {
      const suppliedParts = Array.isArray(body.parts) ? body.parts : [];
      const parts: CompletedPart[] = suppliedParts.map((part) => {
        const candidate = part as Record<string, unknown>;
        return { PartNumber: Number(candidate.partNumber), ETag: String(candidate.etag || '') };
      });
      const stored = await completeB2MultipartUpload(claims, parts);
      const upload: CompletedVideoUpload = {
        provider: 'backblaze-b2',
        projectId: claims.projectId,
        key: claims.key,
        bucket: b2BucketName(),
        contentType: stored.ContentType || claims.contentType,
        size: stored.ContentLength || claims.size,
        etag: stored.ETag || '',
        versionId: stored.VersionId,
        sessionToken,
      };
      return NextResponse.json({ upload });
    }

    if (action === 'abort') {
      await abortB2MultipartUpload(claims);
      return NextResponse.json({ aborted: true });
    }

    throw new UploadRequestError('Unknown multipart upload action.');
  } catch (error) {
    if (error instanceof UploadRequestError) {
      return jsonError(error.message, error.code, error.status, error.retryable);
    }
    if (error instanceof SyntaxError) {
      return jsonError('Invalid upload request body.', 'INVALID_JSON', 400);
    }
    if (error instanceof Error && /upload session|multipart|Invalid project/i.test(error.message)) {
      return jsonError(error.message, 'INVALID_UPLOAD_SESSION', 400);
    }
    const detail = storageErrorDetails(error, 'Object storage could not complete the request.');
    return jsonError(detail.error, detail.code, detail.status, detail.retryable, detail.missingVariables);
  }
}
