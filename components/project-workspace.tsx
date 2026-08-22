'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Captions,
  Check,
  ChevronDown,
  CircleAlert,
  Download,
  ExternalLink,
  Film,
  Gauge,
  Layers3,
  LayoutGrid,
  ListFilter,
  LoaderCircle,
  Maximize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  Settings2,
  Sparkles,
  Split,
  Subtitles,
  TextCursorInput,
  Trash2,
  Volume2,
  WandSparkles,
  Youtube,
  Radio,
  Zap,
} from 'lucide-react';
import type { AspectRatio, AutoPublishSettings, Clip, ClipCategory, EditStyle, FramingMode, IntegrationStatus, Project, PublishingProvider } from '@/types';
import { formatBytes, formatDuration } from '@/lib/utils';
import { StatusPill } from '@/components/status-pill';
import { effectiveClipDuration, MIN_CLIP_SECONDS, requiredClipDuration } from '@/lib/clip-duration';

const categories: Array<'All' | ClipCategory> = ['All', 'Funny', 'Emotional', 'Informative', 'Controversial', 'Story', 'Quote', 'High energy'];

function ScoreRing({ score, size = 'large' }: { score: number; size?: 'small' | 'large' }) {
  const radius = size === 'large' ? 25 : 17;
  const circumference = 2 * Math.PI * radius;
  const box = size === 'large' ? 62 : 44;
  return (
    <div className="relative shrink-0" style={{ width: box, height: box }}>
      <svg viewBox={`0 0 ${box} ${box}`} className="-rotate-90">
        <circle cx={box / 2} cy={box / 2} r={radius} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={size === 'large' ? 5 : 4} />
        <circle cx={box / 2} cy={box / 2} r={radius} fill="none" stroke={score >= 80 ? '#d7ff5f' : score >= 65 ? '#8f7cff' : '#a3a3a3'} strokeWidth={size === 'large' ? 5 : 4} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score / 100)} />
      </svg>
      <span className={`absolute inset-0 grid place-items-center font-semibold ${size === 'large' ? 'text-base' : 'text-[11px]'}`}>{score}</span>
    </div>
  );
}

function ProcessingView({ project, reload }: { project: Project; reload: () => void }) {
  const failed = project.status === 'failed';
  async function retry() {
    await fetch(`/api/projects/${project.id}/analyse`, { method: 'POST' });
    reload();
  }
  const stages = [
    { label: 'Upload complete', startsAt: 0 },
    { label: 'Preparing video', startsAt: 5 },
    { label: 'Transcribing', startsAt: 27 },
    { label: 'Analysing scenes', startsAt: 62 },
    { label: 'Selecting clips', startsAt: 68 },
    { label: 'Clip previews', startsAt: 82 },
    { label: 'Complete', startsAt: 100 },
  ];
  const activeStage = Math.max(0, stages.findLastIndex((stage) => project.job.progress >= stage.startsAt));
  return (
    <div className="mx-auto flex min-h-[calc(100vh-1px)] max-w-5xl items-center px-4 py-10 sm:px-8">
      <div className="w-full">
        <div className="mx-auto max-w-2xl text-center">
          <span className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl border ${failed ? 'border-red-400/20 bg-red-400/[0.06] text-red-300' : 'border-violet/20 bg-violet/[0.08] text-[#b8afff]'}`}>
            {failed ? <CircleAlert className="h-7 w-7" /> : <WandSparkles className="h-7 w-7" />}
          </span>
          <p className="eyebrow mt-6">{failed ? 'Processing stopped' : 'Durable processing'}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{failed ? 'This video needs attention.' : project.job.stage}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/40">{project.job.detail}</p>
        </div>
        <div className="glass-panel mt-9 overflow-hidden rounded-3xl p-5 sm:p-7">
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-xl bg-white/[0.04]">
              {project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Film className="h-6 w-6 text-white/20" /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-medium">{project.name}</p><span className="text-sm font-semibold text-lime">{project.job.progress}%</span></div>
              <p className="mt-1 text-xs text-white/30">{project.video?.filename} {project.video?.size ? `· ${formatBytes(project.video.size)}` : ''}</p>
              <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-violet to-lime transition-all duration-700 processing-shimmer" style={{ width: `${project.job.progress}%` }} />
              </div>
            </div>
          </div>
          <div className="mt-7 grid gap-2 sm:grid-cols-7">
            {stages.map((stage, index) => (
              <div key={stage.label} className={`rounded-xl border px-3 py-3 text-center text-[10px] font-medium ${index < activeStage ? 'border-lime/10 bg-lime/[0.04] text-lime/70' : index === activeStage && !failed ? 'border-violet/20 bg-violet/[0.07] text-[#b8afff]' : 'border-white/[0.06] text-white/25'}`}>
                <span className="mb-2 block text-xs">{index < activeStage ? <Check className="mx-auto h-3.5 w-3.5" /> : index + 1}</span>{stage.label}
              </div>
            ))}
          </div>
          {failed && <button onClick={retry} className="button-primary mx-auto mt-6"><RotateCcw className="h-4 w-4" /> Retry analysis</button>}
        </div>
        {!failed && <p className="mt-5 text-center text-[11px] text-white/25">You can leave this page. The durable job keeps its completed stages and resumes safely after retries.</p>}
      </div>
    </div>
  );
}

function RankingView({ project, onEdit, reload }: { project: Project; onEdit: (id: string) => void; reload: () => void }) {
  const [sort, setSort] = useState<'viral' | 'hook' | 'duration' | 'chronological'>('viral');
  const [category, setCategory] = useState<'All' | ClipCategory>('All');
  const [selected, setSelected] = useState<string[]>([]);
  const [batching, setBatching] = useState(false);
  const clips = useMemo(() => {
    const filtered = project.clips.filter((clip) => category === 'All' || clip.category === category);
    return [...filtered].sort((a, b) => sort === 'viral' ? b.scores.viral - a.scores.viral : sort === 'hook' ? b.scores.hook - a.scores.hook : sort === 'duration' ? a.duration - b.duration : a.start - b.start);
  }, [project.clips, category, sort]);
  async function renderBatch() {
    if (!selected.length) return;
    setBatching(true);
    await fetch(`/api/projects/${project.id}/render-batch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clipIds: selected }) });
    setTimeout(reload, 250);
    setBatching(false);
  }
  return (
    <div className="px-4 py-7 sm:px-7 lg:px-9 lg:py-8">
      <div className="mx-auto max-w-[1450px]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/projects" className="mb-4 inline-flex items-center gap-1.5 text-xs text-white/35 transition hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Projects</Link>
            <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-[-0.045em]">{project.name}</h1><StatusPill status={project.status} /></div>
            <p className="mt-2 text-sm text-white/38">{project.clips.length} {project.clips.length === 1 ? 'moment' : 'moments'} · {project.preferredDuration || 90}s target · speech-synchronised captions. Scores are predictions, not guarantees.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.length > 0 && <button onClick={renderBatch} disabled={batching} className="button-primary">{batching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export selected ({selected.length})</button>}
            <button onClick={() => onEdit(project.clips[0]?.id)} className="button-secondary"><Scissors className="h-4 w-4" /> Open editor</button>
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-1 overflow-x-auto">
            {categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-[11px] transition ${category === item ? 'bg-white/[0.1] font-medium text-white' : 'text-white/35 hover:text-white/65'}`}>{item}</button>)}
          </div>
          <label className="relative shrink-0">
            <ListFilter className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="field min-w-[180px] appearance-none pl-9 pr-8">
              <option value="viral">Viral score</option><option value="hook">Hook score</option><option value="duration">Duration</option><option value="chronological">Chronological</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          </label>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clips.map((clip, index) => {
            const checked = selected.includes(clip.id);
            return (
              <article key={clip.id} className={`group overflow-hidden rounded-2xl border bg-[#111114] transition duration-300 hover:-translate-y-0.5 hover:shadow-2xl ${checked ? 'border-lime/35' : 'border-white/[0.075] hover:border-white/[0.16]'}`}>
                <div className="relative aspect-video overflow-hidden bg-black">
                  {clip.thumbnailUrl && <img src={clip.thumbnailUrl} alt="" className="h-full w-full object-cover opacity-80 transition duration-500 group-hover:scale-[1.025]" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />
                  <button onClick={() => setSelected((current) => checked ? current.filter((id) => id !== clip.id) : [...current, clip.id])} className={`absolute left-3 top-3 grid h-7 w-7 place-items-center rounded-lg border backdrop-blur-md ${checked ? 'border-lime bg-lime text-black' : 'border-white/20 bg-black/35 text-transparent hover:text-white/60'}`} aria-label="Select clip"><Check className="h-3.5 w-3.5" /></button>
                  <div className="absolute right-3 top-3"><ScoreRing score={clip.scores.viral} /></div>
                  <div className="absolute bottom-3 left-3 flex items-center gap-2"><span className="rounded-md bg-black/60 px-2 py-1 text-[10px] text-white/70">{formatDuration(clip.start)} – {formatDuration(clip.end)}</span><span className="rounded-md bg-white/10 px-2 py-1 text-[10px] text-white/55 backdrop-blur">{formatDuration(clip.duration)}</span></div>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2"><span className="text-[10px] font-semibold text-lime">#{String(index + 1).padStart(2, '0')}</span><span className="rounded-md bg-violet/[0.09] px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#b8afff]">{clip.category}</span></div>
                  <h3 className="mt-3 line-clamp-2 text-sm font-medium leading-5 text-white/90">{clip.title}</h3>
                  <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-white/35">{clip.reason}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3">
                    {[['Hook', clip.scores.hook], ['Retention', clip.scores.retention], ['Emotion', clip.scores.emotion]].map(([label, value]) => <div key={String(label)}><p className="text-[9px] uppercase tracking-wider text-white/25">{label}</p><p className="mt-1 text-xs font-semibold text-white/65">{Math.round(Number(value))}</p></div>)}
                  </div>
                  <button onClick={() => onEdit(clip.id)} className="button-secondary mt-4 w-full !py-2"><Scissors className="h-3.5 w-3.5" /> Edit clip</button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CaptionOverlay({ cue, clip, playhead }: { cue: Project['transcript'][number]; clip: Clip; playhead: number }) {
  const presetClasses: Record<Clip['captions']['preset'], string> = {
    minimal: 'font-medium tracking-normal text-white drop-shadow-[0_2px_4px_rgba(0,0,0,.95)]',
    bold: 'font-black tracking-[-.025em] text-white drop-shadow-[0_3px_3px_rgba(0,0,0,1)]',
    hormozi: 'font-black uppercase tracking-[-.035em] text-white drop-shadow-[0_3px_3px_rgba(0,0,0,1)]',
    karaoke: 'rounded-xl bg-black/65 px-3 py-2 font-black text-white shadow-xl backdrop-blur-sm',
    clean: 'rounded-lg bg-black/45 px-3 py-1.5 font-semibold text-white backdrop-blur-sm',
    gaming: 'font-black uppercase italic text-white drop-shadow-[3px_3px_0_#6d5dfc]',
    documentary: 'border-l-2 border-lime bg-black/70 px-3 py-2 text-left font-semibold text-white',
    cinematic: 'font-medium uppercase tracking-[.08em] text-white drop-shadow-[0_2px_5px_rgba(0,0,0,1)]',
  };
  const positionClass = clip.captions.position === 'top'
    ? 'top-[18%]'
    : clip.captions.position === 'middle'
      ? 'top-1/2 -translate-y-1/2'
      : 'bottom-[12%]';
  const wordsMatchText = cue.words?.length && cleanCaptionText(cue.words.map((word) => word.word).join(' ')).toLowerCase() === cleanCaptionText(cue.text).toLowerCase();
  return (
    <div
      key={`${cue.start}-${cue.text}`}
      className={`caption-pop pointer-events-none absolute inset-x-[7%] z-10 text-center leading-[1.05] ${positionClass} ${presetClasses[clip.captions.preset]}`}
      style={{ fontSize: `clamp(14px, ${Math.max(1.4, clip.captions.fontSize / 25)}vw, 34px)` }}
      aria-live="polite"
    >
      {clip.captions.highlight && wordsMatchText
        ? cue.words!.map((word, index) => {
            const active = playhead >= word.start && playhead <= word.end + 0.06;
            const rendered = clip.captions.uppercase ? word.word.toUpperCase() : word.word;
            return <span key={`${word.start}-${index}`} className={active ? 'text-lime' : 'text-white'}>{rendered}{' '}</span>;
          })
        : clip.captions.uppercase ? cue.text.toUpperCase() : cue.text}
    </div>
  );
}

function cleanCaptionText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function focusAt(points: Clip['focusTrack'], time: number) {
  if (!points?.length) return { x: 0.5, y: 0.5 };
  const nextIndex = points.findIndex((point) => point.time >= time);
  if (nextIndex <= 0) return points[Math.max(0, nextIndex)];
  if (nextIndex === -1) return points.at(-1)!;
  const previous = points[nextIndex - 1];
  const next = points[nextIndex];
  const progress = Math.min(1, Math.max(0, (time - previous.time) / Math.max(0.01, next.time - previous.time)));
  return { x: previous.x + (next.x - previous.x) * progress, y: previous.y + (next.y - previous.y) * progress };
}

function EditorView({ project, clipId, onDiscover, onChange, reload }: { project: Project; clipId: string; onDiscover: () => void; onChange: (id: string) => void; reload: () => void | Promise<void> }) {
  const clip = project.clips.find((item) => item.id === clipId) || project.clips[0];
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const musicPlayPending = useRef(false);
  const [draft, setDraft] = useState<Clip>(clip);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(clip.start);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [panel, setPanel] = useState<'edit' | 'captions' | 'publish'>('edit');
  const captionCues = draft.captionSegments?.length
    ? draft.captionSegments
    : project.transcript.filter((segment) => segment.end > draft.start && segment.start < draft.end);
  const selectedMusicTrack = project.musicTracks?.find((track) => track.id === draft.music?.trackId);
  const activeFocus = draft.framing === 'centre' || draft.framing === 'original'
    ? { x: 0.5, y: 0.5 }
    : focusAt(draft.focusTrack, playhead);
  const syncMusic = useCallback((videoTime: number, shouldPlay: boolean, hardSync = false) => {
    const audio = musicRef.current;
    if (!audio || !draft.music?.enabled || !selectedMusicTrack) {
      audio?.pause();
      return;
    }
    const relativeTime = Math.max(0, videoTime - draft.start);
    const desiredTime = Number.isFinite(audio.duration) && audio.duration > 0 ? relativeTime % audio.duration : relativeTime;
    const rawDrift = audio.currentTime - desiredTime;
    const drift = Number.isFinite(audio.duration) && audio.duration > 0 && Math.abs(rawDrift) > audio.duration / 2
      ? rawDrift - Math.sign(rawDrift) * audio.duration
      : rawDrift;
    // Repeatedly assigning currentTime makes decoded audio stutter. Hard-seek
    // only on explicit user seeks/starts or a large clock discontinuity, then
    // use an inaudible playback-rate correction for ordinary clock drift.
    if (Number.isFinite(desiredTime) && (hardSync || Math.abs(drift) > 0.85)) {
      try { audio.currentTime = desiredTime; } catch { /* Audio metadata may still be loading. */ }
      audio.playbackRate = 1;
    } else if (shouldPlay) {
      audio.playbackRate = drift > 0.12 ? 0.985 : drift < -0.12 ? 1.015 : 1;
    }
    const speaking = captionCues.some((cue) => videoTime >= cue.start && videoTime < cue.end);
    const duckingMultiplier = draft.music.ducking && speaking ? 0.42 : 1;
    audio.volume = Math.min(1, Math.max(0, draft.music.volume * duckingMultiplier));
    if (shouldPlay && audio.paused && !musicPlayPending.current) {
      musicPlayPending.current = true;
      void audio.play().catch(() => undefined).finally(() => { musicPlayPending.current = false; });
    }
    if (!shouldPlay) {
      audio.playbackRate = 1;
      if (!audio.paused) audio.pause();
    }
  }, [captionCues, draft.music, draft.start, selectedMusicTrack]);
  useEffect(() => {
    setDraft(clip);
    setPlayhead(clip.start);
    if (clip.status !== 'rendering') setRendering(false);
    if (videoRef.current) videoRef.current.currentTime = clip.start;
    musicRef.current?.pause();
  }, [clip]);
  useEffect(() => {
    if (!playing) {
      musicRef.current?.pause();
      return;
    }
    let frame = 0;
    const syncToVideo = () => {
      const video = videoRef.current;
      if (!video || video.paused) return;
      setPlayhead(video.currentTime);
      syncMusic(video.currentTime, true);
      if (video.currentTime >= draft.end) {
        video.pause();
        musicRef.current?.pause();
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(syncToVideo);
    };
    frame = requestAnimationFrame(syncToVideo);
    return () => {
      cancelAnimationFrame(frame);
      musicRef.current?.pause();
    };
  }, [playing, draft.end, syncMusic]);
  const updateDraft = <K extends keyof Clip>(key: K, value: Clip[K]) => setDraft((current) => ({ ...current, [key]: value }));
  async function save(nextDraft = draft) {
    setSaving(true);
    const response = await fetch(`/api/projects/${project.id}/clips/${clip.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nextDraft) });
    setSaving(false);
    if (response.ok) await Promise.resolve(reload());
  }
  const activeCaption = captionCues.reduce<(typeof captionCues)[number] | undefined>((active, segment) => (
    playhead >= segment.start && playhead < segment.end && (!active || segment.start >= active.start) ? segment : active
  ), undefined);
  const seek = (time: number) => {
    setPlayhead(time);
    if (videoRef.current) videoRef.current.currentTime = time;
    syncMusic(time, playing, true);
  };
  async function exportClip() {
    await save();
    setRendering(true);
    await fetch(`/api/projects/${project.id}/clips/${clip.id}/render`, { method: 'POST' });
    setTimeout(reload, 250);
  }
  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.currentTime < draft.start || video.currentTime >= draft.end) video.currentTime = draft.start;
    if (video.paused) {
      syncMusic(video.currentTime, true, true);
      void video.play().then(() => {
        setPlaying(true);
        syncMusic(video.currentTime, true, true);
      }).catch(() => musicRef.current?.pause());
    } else {
      video.pause();
      musicRef.current?.pause();
      setPlaying(false);
    }
  }
  function addSplit() {
    const point = Number(clampTime(playhead, draft.start + 0.5, draft.end - 0.5).toFixed(2));
    if (draft.splitPoints.some((item) => Math.abs(item - point) < 0.2)) return;
    const next = { ...draft, splitPoints: [...draft.splitPoints, point].sort((a, b) => a - b) };
    setDraft(next); save(next);
  }
  const aspectClass: Record<AspectRatio, string> = { '9:16': 'aspect-[9/16] max-h-[57vh]', '16:9': 'aspect-video w-full', '1:1': 'aspect-square max-h-[57vh]', '4:5': 'aspect-[4/5] max-h-[57vh]' };
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b]">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.07] px-4 lg:px-5">
        <div className="flex min-w-0 items-center gap-3"><button onClick={onDiscover} className="grid h-9 w-9 place-items-center rounded-xl text-white/40 transition hover:bg-white/[0.06] hover:text-white"><ArrowLeft className="h-4 w-4" /></button><div className="min-w-0"><p className="truncate text-sm font-medium">{project.name}</p><p className="mt-0.5 text-[10px] text-white/30">Editing · {formatDuration(draft.duration)}</p></div></div>
        <div className="flex items-center gap-2"><span className="hidden text-[10px] text-white/25 sm:block">{saving ? 'Saving…' : 'All changes saved'}</span>{draft.status === 'complete' && draft.outputUrl ? <a href={draft.outputUrl} className="button-secondary !py-2"><Download className="h-4 w-4" /> Download</a> : <button onClick={exportClip} disabled={rendering || draft.status === 'rendering'} className="button-primary !py-2">{draft.status === 'rendering' || rendering ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} {draft.status === 'rendering' ? `${draft.renderProgress}%` : 'Export MP4'}</button>}</div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[220px_minmax(420px,1fr)_300px]">
        <aside className="hidden min-h-0 border-r border-white/[0.07] bg-[#0d0d10] lg:flex lg:flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3"><span className="eyebrow">Clip library</span><span className="text-[10px] text-white/25">{project.clips.length}</span></div>
          <div className="space-y-2 overflow-y-auto p-2.5">
            {project.clips.map((item) => <button key={item.id} onClick={() => onChange(item.id)} className={`flex w-full gap-2.5 rounded-xl border p-2 text-left transition ${item.id === clip.id ? 'border-lime/20 bg-lime/[0.055]' : 'border-transparent hover:bg-white/[0.035]'}`}><div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-white/[0.04]">{item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />}<span className="absolute bottom-1 right-1 rounded bg-black/65 px-1 text-[8px]">{formatDuration(item.duration)}</span></div><div className="min-w-0"><p className="line-clamp-2 text-[11px] font-medium leading-4 text-white/70">{item.title}</p><p className="mt-1 text-[9px] font-semibold text-lime">{item.scores.viral} score</p></div></button>)}
          </div>
        </aside>

        <main className="flex min-w-0 flex-col bg-[radial-gradient(circle_at_center,rgba(143,124,255,.065),transparent_55%)]">
          <div className="flex min-h-[440px] flex-1 items-center justify-center p-5 lg:p-7">
            <div className={`relative overflow-hidden rounded-xl bg-black shadow-2xl shadow-black/60 ring-1 ring-white/10 ${aspectClass[draft.aspectRatio]}`}>
              <video ref={videoRef} src={project.sourceUrl} playsInline preload="auto" style={{ objectPosition: `${activeFocus.x * 100}% ${activeFocus.y * 100}%` }} className={`h-full w-full ${draft.framing === 'original' || draft.aspectRatio === '16:9' ? 'object-contain' : 'object-cover'}`} onLoadedMetadata={(event) => { event.currentTarget.currentTime = draft.start; syncMusic(draft.start, false, true); }} onPlaying={(event) => syncMusic(event.currentTarget.currentTime, true, true)} onWaiting={() => musicRef.current?.pause()} onTimeUpdate={(event) => { const time = event.currentTarget.currentTime; setPlayhead(time); if (time >= draft.end) { event.currentTarget.pause(); musicRef.current?.pause(); setPlaying(false); } }} onPause={() => { musicRef.current?.pause(); setPlaying(false); }} />
              <audio ref={musicRef} src={selectedMusicTrack?.url} preload="auto" loop data-testid="music-preview" onCanPlay={() => syncMusic(playhead, playing, true)} />
              {draft.hookOverlay && draft.hook && <div className="pointer-events-none absolute inset-x-[8%] top-[7%] text-center text-sm font-black uppercase leading-tight tracking-[-.02em] text-white drop-shadow-[0_3px_4px_rgba(0,0,0,.9)] sm:text-xl">{draft.hook}</div>}
              {draft.captions.enabled && activeCaption && <CaptionOverlay cue={activeCaption} clip={draft} playhead={playhead} />}
              {draft.framing !== 'original' && <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-lime/15 bg-black/55 px-2 py-1 text-[8px] font-semibold uppercase tracking-[.12em] text-lime/80 backdrop-blur"><span className="h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_7px_#d7ff5f]" /> {draft.focusTrack?.length && draft.framing !== 'centre' ? 'Action lock' : 'Centre frame'}</span>}
              <button onClick={togglePlay} aria-label={playing ? 'Pause preview' : 'Play preview'} className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur transition hover:scale-105 hover:bg-black/60">{playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-1 h-5 w-5 fill-current" />}</button>
              <div className="absolute bottom-3 right-3 flex gap-2"><span className="rounded-md bg-black/55 px-2 py-1 text-[9px] text-white/65 backdrop-blur">{draft.aspectRatio}</span><Maximize2 className="h-4 w-4 text-white/55" /></div>
            </div>
          </div>
          <Timeline project={project} draft={draft} playhead={playhead} setPlayhead={seek} updateDraft={updateDraft} save={save} addSplit={addSplit} />
        </main>

        <aside className="border-l border-white/[0.07] bg-[#0d0d10]">
          <div className="grid grid-cols-3 border-b border-white/[0.07] p-1.5">
            {([['edit', Settings2, 'Edit'], ['captions', Captions, 'Captions'], ['publish', Sparkles, 'Publish']] as const).map(([value, Icon, label]) => <button key={value} onClick={() => setPanel(value)} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[10px] font-medium ${panel === value ? 'bg-white/[0.08] text-white' : 'text-white/30'}`}><Icon className="h-3.5 w-3.5" /> {label}</button>)}
          </div>
          <div className="max-h-[calc(100vh-108px)] overflow-y-auto p-4">
            {panel === 'edit' && <EditPanel project={project} draft={draft} update={updateDraft} save={save} reload={reload} />}
            {panel === 'captions' && <CaptionPanel draft={draft} update={updateDraft} save={save} onSeek={seek} />}
            {panel === 'publish' && <PublishPanel projectId={project.id} draft={draft} update={updateDraft} save={save} reload={reload} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function clampTime(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

function Timeline({ project, draft, playhead, setPlayhead, updateDraft, save, addSplit }: { project: Project; draft: Clip; playhead: number; setPlayhead: (time: number) => void; updateDraft: <K extends keyof Clip>(key: K, value: Clip[K]) => void; save: (clip?: Clip) => void; addSplit: () => void }) {
  const duration = project.video?.duration || 1;
  const left = (draft.start / duration) * 100;
  const width = ((draft.end - draft.start) / duration) * 100;
  const boundaries = [draft.start, ...draft.splitPoints.filter((point) => point > draft.start && point < draft.end), draft.end].sort((a, b) => a - b);
  const segmentIndex = Math.max(0, boundaries.findIndex((point, index) => index < boundaries.length - 1 && playhead >= point && playhead < boundaries[index + 1]));
  const activeRange = { start: boundaries[segmentIndex], end: boundaries[segmentIndex + 1] };
  const activeRemoved = draft.excludedRanges.some((range) => Math.abs(range.start - activeRange.start) < 0.05 && Math.abs(range.end - activeRange.end) < 0.05);
  const minimumDuration = requiredClipDuration(duration);
  const activeRangeDuration = Math.max(0, activeRange.end - activeRange.start);
  const canToggleSegment = boundaries.length > 2 && (activeRemoved || effectiveClipDuration(draft) - activeRangeDuration >= minimumDuration);
  function toggleSegment() {
    if (!canToggleSegment) return;
    const excludedRanges = activeRemoved
      ? draft.excludedRanges.filter((range) => Math.abs(range.start - activeRange.start) >= 0.05 || Math.abs(range.end - activeRange.end) >= 0.05)
      : [...draft.excludedRanges, activeRange];
    const next = { ...draft, excludedRanges };
    updateDraft('excludedRanges', excludedRanges);
    save(next);
  }
  return (
    <div className="h-[238px] shrink-0 border-t border-white/[0.07] bg-[#0c0c0f]">
      <div className="flex h-11 items-center justify-between border-b border-white/[0.06] px-4">
        <div className="flex items-center gap-1"><button onClick={addSplit} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] text-white/45 transition hover:bg-white/[0.06] hover:text-white"><Split className="h-3.5 w-3.5" /> Split at playhead</button><button onClick={toggleSegment} disabled={!canToggleSegment} title={!canToggleSegment && !activeRemoved ? `Exports must remain at least ${MIN_CLIP_SECONDS} seconds` : undefined} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] transition disabled:opacity-25 ${activeRemoved ? 'bg-lime/[0.07] text-lime' : 'text-white/40 hover:bg-red-400/[0.06] hover:text-red-300'}`}><Trash2 className="h-3.5 w-3.5" /> {activeRemoved ? 'Restore segment' : 'Remove segment'}</button><span className="mx-1 h-4 w-px bg-white/[0.07]" /><span className="text-[10px] tabular-nums text-white/30">{formatDuration(playhead)} / {formatDuration(duration)}</span></div>
        <div className="flex items-center gap-2 text-[10px] text-white/25"><span>Minimum {formatDuration(minimumDuration)}</span><span>·</span><span>{draft.splitPoints.length + 1} segments</span><Layers3 className="h-3.5 w-3.5" /></div>
      </div>
      <div className="relative overflow-x-auto px-4 py-3">
        <div className="min-w-[620px] space-y-2">
          <div className="relative ml-24 h-4 border-b border-white/[0.06] text-[8px] text-white/20">{Array.from({ length: 9 }, (_, index) => <span key={index} className="absolute bottom-1" style={{ left: `${index * 12.5}%` }}>{formatDuration((duration * index) / 8)}</span>)}</div>
          {[
            { label: 'Video', icon: Film, color: 'from-violet/50 to-violet/20', h: 'h-10' },
            { label: 'Captions', icon: Subtitles, color: 'from-lime/35 to-lime/10', h: 'h-7' },
            { label: 'Music', icon: Volume2, color: 'from-sky-400/30 to-sky-400/10', h: 'h-7' },
            { label: 'Text', icon: TextCursorInput, color: 'from-amber-300/30 to-amber-300/10', h: 'h-7' },
          ].map(({ label, icon: Icon, color, h }) => <div key={label} className="flex items-center gap-3"><div className="flex w-[84px] shrink-0 items-center gap-2 text-[9px] text-white/30"><Icon className="h-3 w-3" />{label}</div><div className={`relative flex-1 overflow-hidden rounded-md bg-white/[0.025] ${h}`}><div className={`absolute inset-y-0 rounded-md border border-white/10 bg-gradient-to-r ${color}`} style={{ left: `${left}%`, width: `${width}%` }}>{draft.splitPoints.map((point) => <span key={point} className="absolute inset-y-0 w-px bg-white/40" style={{ left: `${((point - draft.start) / (draft.end - draft.start)) * 100}%` }} />)}{label === 'Video' && draft.excludedRanges.map((range) => <span key={`${range.start}-${range.end}`} className="absolute inset-y-0 border-x border-red-300/20 bg-black/75" style={{ left: `${((range.start - draft.start) / (draft.end - draft.start)) * 100}%`, width: `${((range.end - range.start) / (draft.end - draft.start)) * 100}%` }} />)}</div>{label === 'Video' && <button className="absolute inset-y-0 z-10 w-px bg-lime shadow-[0_0_5px_#d7ff5f]" style={{ left: `${(playhead / duration) * 100}%` }} aria-label="Playhead" />}</div></div>)}
          <div className="ml-24 grid grid-cols-2 gap-4 pt-1">
            <label className="text-[9px] text-white/30">In · {formatDuration(draft.start)}<input type="range" min={0} max={Math.max(0, draft.end - minimumDuration)} step=".1" value={draft.start} onChange={(event) => updateDraft('start', Number(event.target.value))} onPointerUp={() => save()} className="mt-1 block w-full" /></label>
            <label className="text-[9px] text-white/30">Out · {formatDuration(draft.end)}<input type="range" min={Math.min(duration, draft.start + minimumDuration)} max={duration} step=".1" value={draft.end} onChange={(event) => updateDraft('end', Number(event.target.value))} onPointerUp={() => save()} className="mt-1 block w-full" /></label>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) { return <p className="mb-3 text-[10px] font-semibold uppercase tracking-[.14em] text-white/32">{children}</p>; }
function ChoiceGrid<T extends string>({ values, value, onChange }: { values: T[]; value: T; onChange: (value: T) => void }) { return <div className="grid grid-cols-2 gap-2">{values.map((item) => <button key={item} onClick={() => onChange(item)} className={`rounded-lg border px-2 py-2 text-[10px] capitalize transition ${value === item ? 'border-lime/25 bg-lime/[0.07] text-lime' : 'border-white/[0.07] bg-white/[0.025] text-white/35 hover:text-white/65'}`}>{item}</button>)}</div>; }

function EditPanel({ project, draft, update, save, reload }: { project: Project; draft: Clip; update: <K extends keyof Clip>(key: K, value: Clip[K]) => void; save: (clip?: Clip) => Promise<void>; reload: () => void | Promise<void> }) {
  const musicInput = useRef<HTMLInputElement>(null);
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [musicError, setMusicError] = useState('');
  const [trackingFrame, setTrackingFrame] = useState(false);
  const [frameError, setFrameError] = useState('');
  const music = draft.music || { enabled: false, volume: 0.16, fadeIn: 1, fadeOut: 1.5, ducking: true };
  async function updateMusic(nextValues: Partial<Clip['music']>) {
    const nextMusic = { ...music, ...nextValues };
    const next = { ...draft, music: nextMusic };
    update('music', nextMusic);
    await save(next);
  }
  async function uploadMusic(file?: File) {
    if (!file) return;
    setUploadingMusic(true);
    setMusicError('');
    try {
      const response = await fetch(`/api/projects/${project.id}/music`, { method: 'POST', headers: { 'x-file-name': encodeURIComponent(file.name), 'content-type': file.type || 'application/octet-stream' }, body: file });
      const body = await response.json() as { track?: { id: string }; error?: string };
      if (!response.ok || !body.track) throw new Error(body.error || 'The music track could not be uploaded.');
      await updateMusic({ enabled: true, trackId: body.track.id });
      await Promise.resolve(reload());
    } catch (error) {
      setMusicError(error instanceof Error ? error.message : 'The music track could not be uploaded.');
    } finally {
      setUploadingMusic(false);
      if (musicInput.current) musicInput.current.value = '';
    }
  }
  async function chooseFraming(value: FramingMode) {
    setFrameError('');
    const next = { ...draft, framing: value };
    update('framing', value);
    await save(next);
    if (value === 'original' || value === 'centre') return;
    setTrackingFrame(true);
    const response = await fetch(`/api/projects/${project.id}/clips/${draft.id}/focus`, { method: 'POST' });
    const body = await response.json() as { error?: string };
    if (!response.ok) setFrameError(body.error || 'Could not analyse the action path.');
    await Promise.resolve(reload());
    setTrackingFrame(false);
  }
  return <div className="space-y-6">
    <div><SectionTitle>Clip title</SectionTitle><input className="field" value={draft.title} onChange={(event) => update('title', event.target.value)} onBlur={() => save()} /></div>
    <div><SectionTitle>Format</SectionTitle><ChoiceGrid values={['9:16', '16:9', '1:1', '4:5'] as AspectRatio[]} value={draft.aspectRatio} onChange={(value) => { const next = { ...draft, aspectRatio: value }; update('aspectRatio', value); save(next); }} /></div>
    <div><SectionTitle>Framing</SectionTitle><ChoiceGrid values={['auto', 'face', 'centre', 'split', 'original'] as FramingMode[]} value={draft.framing} onChange={(value) => void chooseFraming(value)} />{trackingFrame && <p className="mt-2 flex items-center gap-1.5 text-[10px] text-lime/70"><LoaderCircle className="h-3 w-3 animate-spin" /> Analysing movement and locking the action to centre…</p>}{!trackingFrame && draft.focusTrack?.length && draft.framing !== 'centre' && draft.framing !== 'original' && <p className="mt-2 flex items-center gap-1.5 text-[10px] text-lime/65"><Check className="h-3 w-3" /> Action tracked across {draft.focusTrack.length} points</p>}{frameError && <p className="mt-2 text-[10px] leading-4 text-red-300">{frameError}</p>}</div>
    <div><SectionTitle>Edit style</SectionTitle><ChoiceGrid values={['clean', 'viral', 'cinematic', 'meme', 'podcast', 'gaming'] as EditStyle[]} value={draft.style} onChange={(value) => { const next = { ...draft, style: value }; update('style', value); save(next); }} /></div>
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="flex items-center justify-between"><span className="text-[11px] text-white/60">Background music</span><button onClick={() => musicInput.current?.click()} disabled={uploadingMusic} className="flex items-center gap-1 text-[10px] font-medium text-lime disabled:opacity-40">{uploadingMusic ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Upload track</button></div>
      <input ref={musicInput} type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,audio/flac,.mp3,.wav,.m4a,.aac,.ogg,.flac" className="hidden" onChange={(event) => uploadMusic(event.target.files?.[0])} />
      <select value={music.trackId || ''} onChange={(event) => void updateMusic({ trackId: event.target.value || undefined, enabled: Boolean(event.target.value) })} className="field mt-3">
        <option value="">No music</option>{(project.musicTracks || []).map((track) => <option key={track.id} value={track.id}>{track.name}{track.duration ? ` · ${formatDuration(track.duration)}` : ''}</option>)}
      </select>
      {musicError && <p className="mt-2 text-[10px] leading-4 text-red-300">{musicError}</p>}
      {music.trackId && <>
        <p className="mt-2 flex items-center gap-1.5 text-[10px] leading-4 text-lime/70"><Volume2 className="h-3 w-3" /> Plays with the main preview and is mixed into the exported MP4.</p>
        <label className="mt-3 block text-[9px] uppercase tracking-wider text-white/30">Volume · {Math.round(music.volume * 100)}%<input type="range" min={0} max={0.6} step={0.01} value={music.volume} onChange={(event) => update('music', { ...music, volume: Number(event.target.value) })} onPointerUp={() => save()} className="mt-1.5 w-full" /></label>
        <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[9px] text-white/30">Fade in<input type="number" min={0} max={10} step={0.5} value={music.fadeIn} onChange={(event) => void updateMusic({ fadeIn: Number(event.target.value) })} className="field mt-1 !py-2" /></label><label className="text-[9px] text-white/30">Fade out<input type="number" min={0} max={10} step={0.5} value={music.fadeOut} onChange={(event) => void updateMusic({ fadeOut: Number(event.target.value) })} className="field mt-1 !py-2" /></label></div>
        <label className="mt-3 flex items-center gap-2 text-[10px] text-white/45"><input type="checkbox" checked={music.ducking} onChange={(event) => void updateMusic({ ducking: event.target.checked })} /> Auto-duck under speech</label>
      </>}
    </div>
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><div className="flex items-center justify-between"><span className="text-[11px] text-white/60">Opening hook overlay</span><button onClick={() => { const next = { ...draft, hookOverlay: !draft.hookOverlay }; update('hookOverlay', !draft.hookOverlay); save(next); }} className={`relative h-5 w-9 rounded-full transition ${draft.hookOverlay ? 'bg-lime' : 'bg-white/10'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-black transition ${draft.hookOverlay ? 'left-[18px]' : 'left-0.5'}`} /></button></div><textarea value={draft.hook} onChange={(event) => update('hook', event.target.value)} onBlur={() => save()} rows={3} className="field mt-3 resize-none" /></div>
  </div>;
}

function CaptionPanel({ draft, update, save, onSeek }: { draft: Clip; update: <K extends keyof Clip>(key: K, value: Clip[K]) => void; save: (clip?: Clip) => void; onSeek: (time: number) => void }) {
  const updateCaption = (key: keyof Clip['captions'], value: Clip['captions'][keyof Clip['captions']]) => { const captions = { ...draft.captions, [key]: value }; const next = { ...draft, captions }; update('captions', captions); save(next); };
  const cues = draft.captionSegments || [];
  function updateCue(index: number, text: string, persist = false) {
    const captionSegments = cues.map((cue, cueIndex) => cueIndex === index ? { ...cue, text, words: undefined } : cue);
    const transcript = captionSegments.map((cue) => cue.text).join(' ');
    const next = { ...draft, captionSegments, transcript };
    update('captionSegments', captionSegments);
    update('transcript', transcript);
    if (persist) save(next);
  }
  return <div className="space-y-6">
    <div className="rounded-xl border border-lime/15 bg-lime/[0.045] p-3"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-[11px] font-medium text-lime"><span className="h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_8px_#d7ff5f]" /> Speech-synchronised</span><span className="text-[9px] text-white/30">{cues.length} phrases</span></div><p className="mt-2 text-[10px] leading-4 text-white/35">Each phrase appears at its spoken start time and disappears when that phrase ends.</p></div>
    <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><span className="text-[11px] text-white/60">Show and export captions</span><button onClick={() => updateCaption('enabled', !draft.captions.enabled)} className={`relative h-5 w-9 rounded-full transition ${draft.captions.enabled ? 'bg-lime' : 'bg-white/10'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-black transition ${draft.captions.enabled ? 'left-[18px]' : 'left-0.5'}`} /></button></div>
    <div><SectionTitle>Preset</SectionTitle><ChoiceGrid values={['minimal', 'bold', 'hormozi', 'karaoke', 'clean', 'gaming', 'documentary', 'cinematic']} value={draft.captions.preset} onChange={(value) => updateCaption('preset', value)} /></div>
    <div><SectionTitle>Position</SectionTitle><ChoiceGrid values={['top', 'middle', 'bottom']} value={draft.captions.position} onChange={(value) => updateCaption('position', value)} /></div>
    <div><SectionTitle>Font size · {draft.captions.fontSize}</SectionTitle><input type="range" min={28} max={84} value={draft.captions.fontSize} onChange={(event) => { const captions = { ...draft.captions, fontSize: Number(event.target.value) }; update('captions', captions); }} onPointerUp={() => save()} className="w-full" /></div>
    <label className="flex items-center gap-2 text-[11px] text-white/50"><input type="checkbox" checked={draft.captions.uppercase} onChange={(event) => updateCaption('uppercase', event.target.checked)} /> Uppercase captions</label>
    <div><SectionTitle>Timed phrases</SectionTitle>{cues.length ? <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1">{cues.map((cue, index) => <div key={`${cue.start}-${index}`} className="rounded-xl border border-white/[0.07] bg-black/20 p-2.5"><button onClick={() => onSeek(cue.start)} className="mb-2 flex items-center gap-1.5 text-[9px] font-medium tabular-nums text-lime/70 hover:text-lime"><Play className="h-2.5 w-2.5 fill-current" /> {formatDuration(cue.start)} – {formatDuration(cue.end)}</button><textarea value={cue.text} onChange={(event) => updateCue(index, event.target.value)} onBlur={(event) => updateCue(index, event.target.value, true)} rows={2} className="field resize-none !px-2.5 !py-2 text-[11px] leading-4" /></div>)}</div> : <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-[10px] leading-5 text-white/30">No timestamped speech was detected in this clip. Re-analyse after checking the audio track.</div>}<p className="mt-2 text-[10px] leading-4 text-white/25">Correcting words keeps the original speech timing.</p></div>
  </div>;
}

function PublishPanel({ projectId, draft, update, save, reload }: { projectId: string; draft: Clip; update: <K extends keyof Clip>(key: K, value: Clip[K]) => void; save: (clip?: Clip) => Promise<void>; reload: () => void | Promise<void> }) {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [publishing, setPublishing] = useState<PublishingProvider | null>(null);
  const [publishError, setPublishError] = useState('');
  useEffect(() => {
    fetch('/api/integrations', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body: { integrations?: IntegrationStatus[] }) => setIntegrations(body.integrations || []));
  }, []);
  const settings: AutoPublishSettings = draft.autoPublish || {
    youtube: integrations.some((item) => item.provider === 'youtube' && item.connected && item.autoPublish),
    tiktok: integrations.some((item) => item.provider === 'tiktok' && item.connected && item.autoPublish),
    youtubePrivacy: 'private',
    tiktokPrivacy: 'SELF_ONLY',
  };
  async function updatePublishing(nextValues: Partial<AutoPublishSettings>) {
    const autoPublish = { ...settings, ...nextValues };
    const next = { ...draft, autoPublish };
    update('autoPublish', autoPublish);
    await save(next);
  }
  async function publishNow(provider: PublishingProvider) {
    setPublishing(provider);
    setPublishError('');
    const response = await fetch(`/api/projects/${projectId}/clips/${draft.id}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    const body = await response.json() as { publication?: { error?: string }; error?: string };
    if (!response.ok) setPublishError(body.publication?.error || body.error || 'Publishing failed.');
    await Promise.resolve(reload());
    setPublishing(null);
  }
  const isConnected = (provider: PublishingProvider) => integrations.some((item) => item.provider === provider && item.connected);
  return <div className="space-y-6">
    <div><SectionTitle>Viral potential</SectionTitle><div className="flex items-center gap-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><ScoreRing score={draft.scores.viral} size="small" /><div><p className="text-xs font-medium">Estimated score</p><p className="mt-1 text-[10px] text-white/30">Prediction only—never a guarantee.</p></div></div></div>
    <div><SectionTitle>TikTok / Reels caption</SectionTitle><textarea value={draft.socialCaption} onChange={(event) => update('socialCaption', event.target.value)} onBlur={() => save()} rows={4} className="field resize-none" /></div>
    <div><SectionTitle>YouTube Shorts title</SectionTitle><input value={draft.youtubeTitle} onChange={(event) => update('youtubeTitle', event.target.value)} onBlur={() => save()} className="field" /></div>
    <div><SectionTitle>Suggested hashtags</SectionTitle><div className="flex flex-wrap gap-1.5">{draft.hashtags.map((tag) => <span key={tag} className="rounded-lg border border-violet/15 bg-violet/[0.07] px-2 py-1 text-[10px] text-[#b8afff]">{tag}</span>)}</div></div>
    <div>
      <SectionTitle>Publish automatically after export</SectionTitle>
      <div className="space-y-2">
        {([
          ['youtube', Youtube, 'YouTube Shorts'],
          ['tiktok', Radio, 'TikTok'],
        ] as const).map(([provider, Icon, label]) => {
          const connected = isConnected(provider);
          const enabled = settings[provider];
          const result = draft.publications?.[provider];
          return <div key={provider} className={`rounded-xl border p-3 ${enabled ? 'border-lime/20 bg-lime/[0.045]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[11px] text-white/65"><Icon className="h-4 w-4" /> {label}</span>
              {connected ? <button onClick={() => void updatePublishing({ [provider]: !enabled })} className={`relative h-5 w-9 rounded-full transition ${enabled ? 'bg-lime' : 'bg-white/10'}`} aria-label={`Auto-publish to ${label}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-black transition ${enabled ? 'left-[18px]' : 'left-0.5'}`} /></button> : <Link href="/settings#publishing-connections" className="flex items-center gap-1 text-[9px] font-semibold text-lime">Connect <ExternalLink className="h-2.5 w-2.5" /></Link>}
            </div>
            {provider === 'youtube' && enabled && <select value={settings.youtubePrivacy} onChange={(event) => void updatePublishing({ youtubePrivacy: event.target.value as AutoPublishSettings['youtubePrivacy'] })} className="field mt-3 !py-2 text-[10px]"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select>}
            {provider === 'tiktok' && enabled && <select value={settings.tiktokPrivacy} onChange={(event) => void updatePublishing({ tiktokPrivacy: event.target.value as AutoPublishSettings['tiktokPrivacy'] })} className="field mt-3 !py-2 text-[10px]"><option value="SELF_ONLY">Only me</option><option value="MUTUAL_FOLLOW_FRIENDS">Friends</option><option value="FOLLOWER_OF_CREATOR">Followers</option><option value="PUBLIC_TO_EVERYONE">Everyone</option></select>}
            {result && <p className={`mt-2 text-[9px] ${result.status === 'published' ? 'text-lime/70' : result.status === 'failed' ? 'text-red-300' : 'text-white/35'}`}>{result.status === 'published' ? 'Published successfully' : result.status === 'failed' ? result.error : 'Publishing…'}</p>}
            {connected && draft.outputPath && (!result || result.status === 'failed') && <button onClick={() => void publishNow(provider)} disabled={publishing === provider} className="mt-2 flex items-center gap-1 text-[9px] font-semibold text-white/45 hover:text-white disabled:opacity-40">{publishing === provider ? <LoaderCircle className="h-2.5 w-2.5 animate-spin" /> : <Zap className="h-2.5 w-2.5" />} Publish this export now</button>}
          </div>;
        })}
      </div>
      {(settings.youtube || settings.tiktok) && <p className="mt-2 rounded-lg border border-lime/10 bg-lime/[0.035] p-2 text-[9px] leading-4 text-lime/65">When you press Export MP4, ViralCut finishes the render first, then uploads it to each selected connected account.</p>}
      {publishError && <p className="mt-2 text-[10px] leading-4 text-red-300">{publishError}</p>}
    </div>
  </div>;
}

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'discover' | 'edit'>('discover');
  const [clipId, setClipId] = useState('');
  const reload = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}`, { cache: 'no-store' });
    const body = (await response.json()) as { project?: Project; error?: string };
    if (!response.ok || !body.project) { setError(body.error || 'Could not load project.'); return; }
    setProject(body.project);
    if (!clipId && body.project.clips[0]) setClipId(body.project.clips[0].id);
  }, [projectId, clipId]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (!project || !['queued', 'uploaded', 'analysing', 'rendering'].includes(project.status) && !project.clips.some((clip) => clip.status === 'rendering')) return;
    const timer = setInterval(reload, 1250);
    return () => clearInterval(timer);
  }, [project, reload]);
  if (error) return <div className="grid min-h-screen place-items-center p-8 text-sm text-red-300">{error}</div>;
  if (!project) return <div className="grid min-h-screen place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-lime" /></div>;
  if (['uploaded', 'queued', 'analysing', 'failed'].includes(project.status) && !project.clips.length) return <ProcessingView project={project} reload={reload} />;
  if (mode === 'edit' && project.clips.length) return <EditorView project={project} clipId={clipId || project.clips[0].id} onDiscover={() => setMode('discover')} onChange={(id) => setClipId(id)} reload={reload} />;
  return <RankingView project={project} onEdit={(id) => { setClipId(id); setMode('edit'); }} reload={reload} />;
}
