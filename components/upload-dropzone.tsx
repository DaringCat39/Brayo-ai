'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, Captions, Clock3, FileVideo, LockKeyhole, UploadCloud, X } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import type {
  CaptionSettings,
  CompletedVideoUpload,
  MultipartUploadSession,
  PresignedUploadPart,
  Project,
  UploadCapabilities,
} from '@/types';
import { DEFAULT_CLIP_SECONDS } from '@/lib/clip-duration';

const accepted = '.mp4,.mov,.mkv,.webm,.m4v,video/mp4,video/quicktime,video/webm,video/x-matroska';
const durationOptions: Array<{ value: Project['preferredDuration']; label: string; detail: string }> = [
  { value: 75, label: '75 sec', detail: 'Quick story' },
  { value: 90, label: '90 sec', detail: 'Recommended' },
  { value: 120, label: '2 min', detail: 'More context' },
  { value: 180, label: '3 min', detail: 'Deep cut' },
];
const captionOptions: Array<{ value: CaptionSettings['preset']; label: string }> = [
  { value: 'bold', label: 'Bold viral' },
  { value: 'hormozi', label: 'Impact' },
  { value: 'karaoke', label: 'Karaoke' },
  { value: 'clean', label: 'Clean' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'documentary', label: 'Documentary' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'minimal', label: 'Minimal' },
];

interface ActiveMultipartUpload {
  fingerprint: string;
  session: MultipartUploadSession;
  completedParts: Map<number, string>;
  completedUpload?: CompletedVideoUpload;
}

type PartFailureCategory =
  | 'network-or-cors'
  | 'timeout'
  | 'cancelled'
  | 'authorization'
  | 'client-request'
  | 'storage-service'
  | 'missing-etag';

class MultipartPartError extends Error {
  constructor(
    message: string,
    readonly partNumber: number,
    readonly status: number,
    readonly category: PartFailureCategory,
    readonly responseText: string,
    readonly requestId: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'MultipartPartError';
  }
}

const MULTIPART_CONCURRENCY = 4;
const PART_AUTHORIZATION_BATCH_SIZE = MULTIPART_CONCURRENCY * 2;
const MAX_PART_ATTEMPTS = 5;
const PART_REQUEST_TIMEOUT_MS = 15 * 60 * 1000;

function uploadFingerprint(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
}

function responseErrorMessage(text: string, status: number, fallback: string) {
  const trimmed = text.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: string | { message?: string }; message?: string };
      if (typeof parsed.error === 'string') return parsed.error;
      if (parsed.error?.message) return parsed.error.message;
      if (parsed.message) return parsed.message;
    } catch {
      const xmlMessage = trimmed.match(/<Message>([\s\S]*?)<\/Message>/i)?.[1];
      const xmlCode = trimmed.match(/<Code>([\s\S]*?)<\/Code>/i)?.[1];
      if (xmlMessage) return `${xmlCode ? `${xmlCode}: ` : ''}${xmlMessage}`;
      if (!trimmed.startsWith('<')) return trimmed.slice(0, 300);
    }
  }
  return `${fallback} (HTTP ${status || 'network error'}).`;
}

function safeStorageResponse(text: string) {
  return text
    .slice(0, 1_000)
    .replace(/(X-Amz-(?:Credential|Signature|Security-Token)=)[^&\s<]+/gi, '$1[redacted]');
}

function partError(
  partNumber: number,
  status: number,
  category: PartFailureCategory,
  responseText: string,
  retryable: boolean,
  requestId = '',
) {
  const safeResponse = safeStorageResponse(responseText);
  const effectiveRequestId = requestId || safeResponse.match(/<RequestId>([^<]+)<\/RequestId>/i)?.[1] || '';
  const fallback = category === 'network-or-cors'
    ? 'The browser could not reach or read Backblaze B2. Check the bucket CORS origin and your connection'
    : category === 'timeout'
      ? 'The video part upload timed out'
      : category === 'cancelled'
        ? 'The video part upload was cancelled'
        : category === 'missing-etag'
          ? 'Backblaze B2 uploaded the part but its ETag is not exposed by bucket CORS'
          : 'Backblaze B2 rejected the video part';
  const detail = responseErrorMessage(safeResponse, status, fallback);
  return new MultipartPartError(
    `Part ${partNumber}: ${detail}${effectiveRequestId ? ` Backblaze request ID: ${effectiveRequestId}.` : ''}`,
    partNumber,
    status,
    category,
    safeResponse,
    effectiveRequestId,
    retryable,
  );
}

function logPartFailure(error: MultipartPartError, attempt: number) {
  // Never log the presigned URL: its query string is a temporary credential.
  console.error('[Brayo.ai multipart upload part failed]', {
    partNumber: error.partNumber,
    attempt,
    maximumAttempts: MAX_PART_ATTEMPTS,
    status: error.status || 0,
    classification: error.category,
    requestId: error.requestId || '(not exposed)',
    responseText: error.responseText || '(response unavailable to browser)',
  });
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) throw new Error(responseErrorMessage(text, response.status, 'Storage request failed'));
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(responseErrorMessage(text, response.status, 'The storage service returned an unreadable response'));
  }
}

function uploadPart(part: PresignedUploadPart, data: Blob, onProgress: (loaded: number) => void) {
  return new Promise<string>((resolve, reject) => {
    if (part.method !== 'PUT') {
      reject(partError(part.partNumber, 0, 'client-request', '', false));
      return;
    }
    if (part.expiresAt <= Date.now()) {
      reject(partError(part.partNumber, 403, 'authorization', 'The presigned part URL expired.', true));
      return;
    }
    const request = new XMLHttpRequest();
    request.open('PUT', part.url);
    request.timeout = PART_REQUEST_TIMEOUT_MS;
    request.withCredentials = false;
    request.upload.onprogress = (event) => onProgress(event.loaded);
    const requestId = () => request.getResponseHeader('x-amz-request-id') || request.getResponseHeader('x-amz-id-2') || '';
    request.onerror = () => reject(partError(part.partNumber, request.status, 'network-or-cors', request.responseText || '', true, requestId()));
    request.ontimeout = () => reject(partError(part.partNumber, request.status, 'timeout', request.responseText || '', true, requestId()));
    request.onabort = () => reject(partError(part.partNumber, request.status, 'cancelled', request.responseText || '', false, requestId()));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        const etag = request.getResponseHeader('ETag');
        if (etag) resolve(etag);
        else reject(partError(part.partNumber, request.status, 'missing-etag', request.responseText || '', false, requestId()));
        return;
      }
      const category: PartFailureCategory = request.status === 401 || request.status === 403
        ? 'authorization'
        : request.status >= 500
          ? 'storage-service'
          : 'client-request';
      const retryable = category === 'authorization'
        || category === 'storage-service'
        || request.status === 408
        || request.status === 409
        || request.status === 425
        || request.status === 429;
      reject(partError(part.partNumber, request.status, category, request.responseText || '', retryable, requestId()));
    };
    // Do not add Content-Type, Authorization, checksum, or custom headers here.
    // UploadPart is query-presigned and the Blob slices below deliberately have
    // an empty MIME type, keeping the sent request identical to the signature.
    request.send(data);
  });
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function partRetryDelay(attempt: number) {
  return Math.min(8_000, 750 * (2 ** Math.max(0, attempt - 1)));
}

async function authorizeUploadParts(sessionToken: string, partNumbers: number[]) {
  let authorization: { parts: PresignedUploadPart[] } | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      authorization = await requestJson<{ parts: PresignedUploadPart[] }>('/api/uploads/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'sign-parts', sessionToken, partNumbers }),
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await wait(partRetryDelay(attempt));
    }
  }
  if (!authorization) throw lastError instanceof Error ? lastError : new Error('Could not authorize video parts.');
  const requested = new Set(partNumbers);
  if (
    authorization.parts.length !== requested.size
    || authorization.parts.some((part) => (
      !requested.has(part.partNumber)
      || part.method !== 'PUT'
      || !Number.isSafeInteger(part.expiresAt)
      || !part.url
    ))
  ) {
    throw new Error('Backblaze B2 returned invalid multipart upload authorization.');
  }
  return new Map(authorization.parts.map((part) => [part.partNumber, part]));
}

async function completeMultipartSession(
  sessionToken: string,
  parts: Array<{ partNumber: number; etag: string }>,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await requestJson<{ upload: CompletedVideoUpload }>('/api/uploads/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'complete', sessionToken, parts }),
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3) await wait(partRetryDelay(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not complete the multipart upload.');
}

async function abortMultipartSession(sessionToken: string) {
  try {
    await requestJson<{ aborted: boolean }>('/api/uploads/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'abort', sessionToken }),
      keepalive: true,
    });
  } catch (error) {
    console.error('[Brayo.ai multipart upload abort failed]', {
      message: error instanceof Error ? error.message : 'Unknown abort error',
    });
  }
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  const failures: unknown[] = [];
  async function runWorker() {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      try {
        await worker(item);
      } catch (error) {
        failures.push(error);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  if (failures.length) throw failures[0];
}

export function UploadDropzone({ compact = false }: { compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [remainingBytes, setRemainingBytes] = useState(0);
  const [uploadStage, setUploadStage] = useState('Ready to upload');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [duration, setDuration] = useState<Project['preferredDuration']>(DEFAULT_CLIP_SECONDS);
  const [captionPreset, setCaptionPreset] = useState<CaptionSettings['preset']>('bold');
  const [capabilities, setCapabilities] = useState<UploadCapabilities | null>(null);
  const uploadStartedAt = useRef(0);
  const speedBaseBytes = useRef(0);
  const activeUpload = useRef<ActiveMultipartUpload | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/uploads', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Upload service is unavailable.');
        return response.json() as Promise<UploadCapabilities>;
      })
      .then((next) => { if (active) setCapabilities(next); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  function pick(next: File | undefined) {
    if (!next) return;
    const extension = next.name.split('.').pop()?.toLowerCase();
    if (!extension || !['mp4', 'mov', 'mkv', 'webm', 'm4v'].includes(extension)) {
      setError('Choose an MP4, MOV, MKV or WebM video.');
      return;
    }
    const previous = activeUpload.current;
    if (previous && !previous.completedUpload) {
      void abortMultipartSession(previous.session.sessionToken);
    }
    activeUpload.current = null;
    setError('');
    setProgress(0);
    setRemainingBytes(next.size);
    setFile(next);
  }

  function reportProgress(loaded: number, total: number, percentage?: number) {
    const elapsedSeconds = Math.max(0.05, (performance.now() - uploadStartedAt.current) / 1000);
    const safeLoaded = Math.max(0, Math.min(total, loaded));
    setProgress(Math.max(0, Math.min(100, Math.round(percentage ?? (safeLoaded / Math.max(1, total)) * 100))));
    setUploadSpeed(Math.max(0, safeLoaded - speedBaseBytes.current) / elapsedSeconds);
    setRemainingBytes(Math.max(0, total - safeLoaded));
  }

  async function getCapabilities() {
    if (capabilities) return capabilities;
    const next = await requestJson<UploadCapabilities>('/api/uploads', { cache: 'no-store' });
    setCapabilities(next);
    return next;
  }

  function registerLocalUpload(video: File) {
    return new Promise<Project>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', '/api/projects');
      request.setRequestHeader('x-file-name', encodeURIComponent(video.name));
      request.setRequestHeader('content-type', video.type || 'application/octet-stream');
      request.setRequestHeader('x-clip-duration', String(duration));
      request.setRequestHeader('x-caption-preset', captionPreset);
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) reportProgress(event.loaded, event.total);
      };
      request.onerror = () => reject(new Error('Upload interrupted. Your existing projects are unaffected.'));
      request.onload = () => {
        try {
          const body = JSON.parse(request.responseText) as { project?: Project; error?: string };
          if (request.status >= 200 && request.status < 300 && body.project) resolve(body.project);
          else reject(new Error(body.error || responseErrorMessage(request.responseText, request.status, 'Upload failed')));
        } catch {
          reject(new Error(responseErrorMessage(request.responseText, request.status, 'The local upload failed')));
        }
      };
      request.send(video);
    });
  }

  async function registerDirectUpload(video: File) {
    const fingerprint = uploadFingerprint(video);
    let active = activeUpload.current;
    if (!active || active.fingerprint !== fingerprint) {
      const initiated = await requestJson<{ session: MultipartUploadSession }>('/api/uploads/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'initiate',
          filename: video.name,
          contentType: video.type || 'application/octet-stream',
          size: video.size,
        }),
      });
      active = {
        fingerprint,
        session: initiated.session,
        completedParts: new Map(),
      };
      activeUpload.current = active;
    }

    if (!active.completedUpload) {
      const session = active.session;
      const bytesForPart = (partNumber: number) => {
        const start = (partNumber - 1) * session.partSize;
        return Math.max(0, Math.min(session.partSize, video.size - start));
      };
      const completedBytes = () => [...active!.completedParts.keys()]
        .reduce((total, partNumber) => total + bytesForPart(partNumber), 0);
      speedBaseBytes.current = completedBytes();
      reportProgress(speedBaseBytes.current, video.size);
      const pending = Array.from({ length: session.partCount }, (_, index) => index + 1)
        .filter((partNumber) => !active!.completedParts.has(partNumber));
      const inFlight = new Map<number, number>();

      try {
        for (let offset = 0; offset < pending.length; offset += PART_AUTHORIZATION_BATCH_SIZE) {
          const batch = pending.slice(offset, offset + PART_AUTHORIZATION_BATCH_SIZE);
          setUploadStage(`Uploading parts ${offset + 1}–${Math.min(offset + batch.length, pending.length)} of ${pending.length}`);
          const initialAuthorizations = await authorizeUploadParts(session.sessionToken, batch);
          await mapWithConcurrency(batch, MULTIPART_CONCURRENCY, async (partNumber) => {
            const start = (partNumber - 1) * session.partSize;
            const end = Math.min(video.size, start + session.partSize);
            let authorization = initialAuthorizations.get(partNumber);
            if (!authorization) throw new Error(`Upload authorization for part ${partNumber} is missing.`);
            let lastError: unknown;

            for (let attempt = 1; attempt <= MAX_PART_ATTEMPTS; attempt += 1) {
              if (attempt > 1 || authorization.expiresAt - Date.now() < 30_000) {
                const refreshed = await authorizeUploadParts(session.sessionToken, [partNumber]);
                authorization = refreshed.get(partNumber);
                if (!authorization) throw new Error(`Refreshed upload authorization for part ${partNumber} is missing.`);
              }
              try {
                inFlight.set(partNumber, 0);
                const etag = await uploadPart(authorization, video.slice(start, end, ''), (loaded) => {
                  inFlight.set(partNumber, loaded);
                  const totalLoaded = completedBytes() + [...inFlight.values()].reduce((sum, value) => sum + value, 0);
                  reportProgress(totalLoaded, video.size);
                });
                active!.completedParts.set(partNumber, etag);
                inFlight.delete(partNumber);
                reportProgress(completedBytes() + [...inFlight.values()].reduce((sum, value) => sum + value, 0), video.size);
                return;
              } catch (uploadError) {
                lastError = uploadError;
                inFlight.delete(partNumber);
                const diagnosed = uploadError instanceof MultipartPartError ? uploadError : undefined;
                if (diagnosed) logPartFailure(diagnosed, attempt);
                if (attempt >= MAX_PART_ATTEMPTS || (diagnosed && !diagnosed.retryable)) break;
                setUploadStage(`Retrying part ${partNumber} of ${session.partCount}`);
                await wait(partRetryDelay(attempt));
              }
            }
            throw lastError instanceof Error
              ? lastError
              : new Error(`Video part ${partNumber} failed after ${MAX_PART_ATTEMPTS} attempts.`);
          });
        }

        setUploadStage('Verifying completed upload');
        const completed = await completeMultipartSession(
          session.sessionToken,
          [...active.completedParts.entries()].map(([partNumber, etag]) => ({ partNumber, etag })),
        );
        active.completedUpload = completed.upload;
      } catch (uploadError) {
        activeUpload.current = null;
        await abortMultipartSession(session.sessionToken);
        throw uploadError;
      }
    }

    setProgress(100);
    setUploadSpeed(0);
    setUploadStage('Finalising project');
    const registered = await requestJson<{ project: Project }>('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename: video.name,
        preferredDuration: duration,
        captionPreset,
        upload: active.completedUpload,
      }),
    });
    activeUpload.current = null;
    return registered.project;
  }

  async function upload() {
    if (!file || uploading) return;
    setUploading(true);
    setError('');
    const resumable = activeUpload.current?.fingerprint === uploadFingerprint(file) ? activeUpload.current : null;
    const resumedBytes = resumable
      ? [...resumable.completedParts.keys()].reduce((total, partNumber) => {
        const start = (partNumber - 1) * resumable.session.partSize;
        return total + Math.max(0, Math.min(resumable.session.partSize, file.size - start));
      }, 0)
      : 0;
    setProgress(Math.round((resumedBytes / Math.max(1, file.size)) * 100));
    setUploadSpeed(0);
    setRemainingBytes(Math.max(0, file.size - resumedBytes));
    speedBaseBytes.current = resumedBytes;
    uploadStartedAt.current = performance.now();
    try {
      const storage = await getCapabilities();
      if (!storage.direct && !storage.localFallback) {
        throw new Error('Direct Backblaze B2 upload is unavailable for this deployment.');
      }
      setUploadStage(storage.direct ? 'Uploading directly to storage' : 'Uploading to local server');
      const project = storage.direct ? await registerDirectUpload(file) : await registerLocalUpload(file);
      setProgress(100);
      setRemainingBytes(0);
      setUploadStage('Preparing analysis');
      router.push(`/projects/${project.id}`);
    } catch (uploadError) {
      setUploading(false);
      setUploadSpeed(0);
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    }
  }

  function removeVideo() {
    const active = activeUpload.current;
    if (active && !active.completedUpload) {
      void abortMultipartSession(active.session.sessionToken);
    }
    activeUpload.current = null;
    setFile(null);
    setProgress(0);
    setUploadSpeed(0);
    setRemainingBytes(0);
    setError('');
  }

  if (file) {
    return (
      <div className={`glass-panel overflow-hidden rounded-3xl ${compact ? 'p-4' : 'p-5 sm:p-6'}`}>
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet/20 to-lime/10 ring-1 ring-white/10">
            <FileVideo className="h-6 w-6 text-white/80" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{file.name}</p>
                <p className="mt-1 text-xs text-white/35">{formatBytes(file.size)} · Ready for secure upload</p>
              </div>
              {!uploading && (
                <button onClick={removeVideo} className="grid h-8 w-8 place-items-center rounded-lg text-white/35 transition hover:bg-white/[0.06] hover:text-white" aria-label="Remove video">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {uploading && (
              <div className="mt-3">
                <div className="mb-1.5 flex justify-between gap-3 text-[10px] font-medium uppercase tracking-wider text-white/38">
                  <span className="truncate">{uploadStage}</span>
                  <span className="shrink-0">{progress}%{uploadSpeed > 0 ? ` · ${formatBytes(uploadSpeed)}/s` : ''}{remainingBytes > 0 ? ` · ${formatBytes(remainingBytes)} left` : ''}</span>
                </div>
                <div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet to-lime transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
        {!compact && !uploading && (
          <div className="mt-5 grid gap-4 border-t border-white/[0.07] pt-5 md:grid-cols-2">
            <section>
              <div className="mb-3 flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-lime" /><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/45">Clip length</p></div>
              <div className="grid grid-cols-2 gap-2">
                {durationOptions.map((option) => (
                  <button key={option.value} type="button" onClick={() => setDuration(option.value)} aria-pressed={duration === option.value} className={`rounded-xl border px-3 py-2.5 text-left transition ${duration === option.value ? 'border-lime/30 bg-lime/[0.07]' : 'border-white/[0.07] bg-black/20 hover:border-white/[0.16]'}`}>
                    <span className={`block text-xs font-semibold ${duration === option.value ? 'text-lime' : 'text-white/70'}`}>{option.label}</span>
                    <span className="mt-0.5 block text-[9px] text-white/28">{option.detail}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[9px] leading-4 text-white/28">Every generated clip is longer than one minute when the source permits.</p>
            </section>
            <section>
              <div className="mb-3 flex items-center gap-2"><Captions className="h-3.5 w-3.5 text-[#b8afff]" /><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/45">Subtitle style</p></div>
              <div className="grid grid-cols-2 gap-2">
                {captionOptions.map((option) => (
                  <button key={option.value} type="button" onClick={() => setCaptionPreset(option.value)} aria-pressed={captionPreset === option.value} className={`relative overflow-hidden rounded-xl border px-3 py-2.5 text-left transition ${captionPreset === option.value ? 'border-violet/45 bg-violet/[0.09]' : 'border-white/[0.07] bg-black/20 hover:border-white/[0.16]'}`}>
                    <span className={`block truncate text-[10px] font-semibold ${option.value === 'gaming' ? 'italic' : ''} ${captionPreset === option.value ? 'text-[#c8c0ff]' : 'text-white/62'}`}>{option.label}</span>
                    <span className={`mt-1 block h-0.5 rounded-full ${captionPreset === option.value ? 'bg-gradient-to-r from-violet to-lime' : 'bg-white/10'}`} />
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
        {compact && !uploading && <div className="mt-4 flex gap-2 text-[9px] text-white/38"><span className="rounded-lg bg-white/[0.05] px-2 py-1">90 sec clips</span><span className="rounded-lg bg-white/[0.05] px-2 py-1">Bold live captions</span></div>}
        {!uploading && (
          <button onClick={upload} className="button-primary mt-5 w-full">
            {error && activeUpload.current ? 'Retry upload' : `Generate ${duration >= 120 ? `${duration / 60} min` : `${duration} sec`} clips`} <ArrowUp className="h-4 w-4 rotate-45" />
          </button>
        )}
        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files[0]); }}
      className={`group relative w-full overflow-hidden rounded-3xl border border-dashed text-left transition duration-300 ${
        dragging ? 'border-lime/55 bg-lime/[0.06]' : 'border-white/[0.13] bg-white/[0.025] hover:border-white/25 hover:bg-white/[0.04]'
      } ${compact ? 'px-5 py-8' : 'px-5 py-10 sm:px-10 sm:py-14'}`}
    >
      <input ref={inputRef} type="file" className="hidden" accept={accepted} onChange={(event) => pick(event.target.files?.[0])} />
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.055] shadow-xl transition duration-300 group-hover:-translate-y-1 group-hover:border-lime/20 group-hover:text-lime">
        <UploadCloud className="h-6 w-6" />
      </span>
      <span className="mt-5 block text-center text-base font-medium">Drop your long-form video here</span>
      <span className="mt-2 block text-center text-sm text-white/35">or click to browse · MP4, MOV, MKV, WebM</span>
      <span className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-white/25"><LockKeyhole className="h-3 w-3" /> Private direct upload · local development fallback</span>
      {dragging && <span className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-violet via-lime to-violet" />}
    </button>
  );
}
