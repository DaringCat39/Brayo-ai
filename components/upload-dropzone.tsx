'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload as uploadBlob } from '@vercel/blob/client';
import { ArrowUp, Captions, Clock3, FileVideo, LockKeyhole, UploadCloud, X } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import type { CaptionSettings, CompletedVideoUpload, Project, UploadCapabilities } from '@/types';
import { DEFAULT_CLIP_SECONDS } from '@/lib/clip-duration';
import { BLOB_VIDEO_PREFIX } from '@/lib/upload-config';

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

export function UploadDropzone({ compact = false }: { compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [uploadStage, setUploadStage] = useState('Ready to upload');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [duration, setDuration] = useState<Project['preferredDuration']>(DEFAULT_CLIP_SECONDS);
  const [captionPreset, setCaptionPreset] = useState<CaptionSettings['preset']>('bold');
  const [capabilities, setCapabilities] = useState<UploadCapabilities | null>(null);
  const uploadStartedAt = useRef(0);

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
    setError('');
    setFile(next);
  }

  function reportProgress(loaded: number, total: number, percentage?: number) {
    const elapsedSeconds = Math.max(0.05, (performance.now() - uploadStartedAt.current) / 1000);
    setProgress(Math.max(0, Math.min(100, Math.round(percentage ?? (loaded / Math.max(1, total)) * 100))));
    setUploadSpeed(loaded / elapsedSeconds);
  }

  async function getCapabilities() {
    if (capabilities) return capabilities;
    const response = await fetch('/api/uploads', { cache: 'no-store' });
    if (!response.ok) throw new Error('The upload service is unavailable. Please try again.');
    const next = await response.json() as UploadCapabilities;
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
          else reject(new Error(body.error || 'Upload failed.'));
        } catch {
          reject(new Error('The server returned an unexpected response.'));
        }
      };
      request.send(video);
    });
  }

  async function registerDirectUpload(video: File) {
    const blobFilename = video.name
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .slice(-140);
    const blob = await uploadBlob(`${BLOB_VIDEO_PREFIX}${blobFilename}`, video, {
      access: 'private',
      handleUploadUrl: '/api/uploads/token',
      contentType: video.type || 'application/octet-stream',
      multipart: true,
      onUploadProgress: ({ loaded, total, percentage }) => reportProgress(loaded, total, percentage),
    });

    setProgress(100);
    setUploadSpeed(0);
    setUploadStage('Finalising project');
    const upload: CompletedVideoUpload = {
      provider: 'vercel-blob',
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
      size: video.size,
      etag: blob.etag,
    };
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: video.name, preferredDuration: duration, captionPreset, upload }),
    });
    const body = await response.json() as { project?: Project; error?: string };
    if (!response.ok || !body.project) throw new Error(body.error || 'The uploaded video could not be registered.');
    return body.project;
  }

  async function upload() {
    if (!file || uploading) return;
    setUploading(true);
    setError('');
    setProgress(0);
    setUploadSpeed(0);
    uploadStartedAt.current = performance.now();
    try {
      const storage = await getCapabilities();
      if (!storage.direct && !storage.localFallback) {
        throw new Error('Video storage is not connected. Add a private Vercel Blob store to this deployment.');
      }
      setUploadStage(storage.direct ? 'Uploading directly to storage' : 'Uploading to local server');
      const project = storage.direct ? await registerDirectUpload(file) : await registerLocalUpload(file);
      setProgress(100);
      setUploadStage('Preparing analysis');
      router.push(`/projects/${project.id}`);
    } catch (uploadError) {
      setUploading(false);
      setUploadSpeed(0);
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    }
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
                <button onClick={() => setFile(null)} className="grid h-8 w-8 place-items-center rounded-lg text-white/35 transition hover:bg-white/[0.06] hover:text-white" aria-label="Remove video">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {uploading && (
              <div className="mt-3">
                <div className="mb-1.5 flex justify-between gap-3 text-[10px] font-medium uppercase tracking-wider text-white/38">
                  <span className="truncate">{uploadStage}</span>
                  <span className="shrink-0">{progress}%{uploadSpeed > 0 ? ` · ${formatBytes(uploadSpeed)}/s` : ''}</span>
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
            Generate {duration >= 120 ? `${duration / 60} min` : `${duration} sec`} clips <ArrowUp className="h-4 w-4 rotate-45" />
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
