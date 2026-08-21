'use client';

import { useEffect, useState } from 'react';
import { Check, CircleAlert, Cpu, Database, KeyRound, LoaderCircle, LockKeyhole, TerminalSquare } from 'lucide-react';
import type { PublicSettings } from '@/types';
import { ChannelConnections } from '@/components/channel-connections';

function State({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${ok ? 'border-lime/15 bg-lime/[0.06] text-lime' : 'border-white/[0.08] bg-white/[0.03] text-white/35'}`}>{ok ? <Check className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}{children}</span>;
}

export function SettingsView() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  useEffect(() => { fetch('/api/settings').then((response) => response.json()).then((body) => setSettings(body.settings)); }, []);
  if (!settings) return <div className="grid h-64 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-lime" /></div>;
  return (
    <div className="mt-8 grid gap-5 lg:grid-cols-2">
      <section id="publishing-connections" className="glass-panel rounded-3xl p-5 sm:p-6 lg:col-span-2">
        <div className="mb-5"><p className="eyebrow">Publishing connections</p><h2 className="mt-2 text-lg font-medium">Connect YouTube and TikTok</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-white/35">Once connected, enable auto-publish from a clip’s Publish tab. Exports are uploaded only to the channels you explicitly switch on.</p></div>
        <ChannelConnections />
      </section>
      <section className="glass-panel rounded-3xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><span className="grid h-10 w-10 place-items-center rounded-xl bg-lime/[0.08] text-lime"><Cpu className="h-4 w-4" /></span><h2 className="mt-4 text-base font-medium">Local processing</h2></div><State ok={settings.ffmpegReady}>{settings.ffmpegReady ? 'Ready' : 'Unavailable'}</State></div>
        <p className="mt-3 text-xs leading-5 text-white/35">FFmpeg and FFprobe are bundled with the project. Upload analysis, thumbnails, reframing, caption burn-in and H.264 export run on this Mac.</p>
        <div className="mt-5 rounded-xl border border-white/[0.07] bg-black/20 p-3"><p className="text-[9px] font-semibold uppercase tracking-wider text-white/25">Local storage</p><p className="mt-1.5 break-all font-mono text-[10px] text-white/45">{settings.storagePath}</p></div>
      </section>

      <section className="glass-panel rounded-3xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet/[0.09] text-[#b8afff]"><KeyRound className="h-4 w-4" /></span><h2 className="mt-4 text-base font-medium">Semantic AI</h2></div><State ok={settings.aiConfigured}>{settings.aiConfigured ? 'Connected' : 'Optional'}</State></div>
        <p className="mt-3 text-xs leading-5 text-white/35">An OpenAI-compatible key adds semantic transcript analysis, stronger titles and contextual candidate selection. The app works without it using local heuristics.</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-white/[0.07] bg-black/20 p-3"><p className="text-[9px] font-semibold uppercase tracking-wider text-white/25">Provider</p><p className="mt-1.5 truncate text-[10px] text-white/45">{settings.aiBaseUrl}</p></div><div className="rounded-xl border border-white/[0.07] bg-black/20 p-3"><p className="text-[9px] font-semibold uppercase tracking-wider text-white/25">Model</p><p className="mt-1.5 text-[10px] text-white/45">{settings.aiModel}</p></div></div>
      </section>

      <section className="glass-panel rounded-3xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-400/[0.08] text-sky-300"><TerminalSquare className="h-4 w-4" /></span><h2 className="mt-4 text-base font-medium">Speech to text</h2></div><State ok>Built in</State></div>
        <p className="mt-3 text-xs leading-5 text-white/35">A local Whisper model creates word timestamps and phrase-level caption cues automatically. The model downloads once on first use and is cached on this device; video audio is not uploaded.</p>
        <div className="mt-5 rounded-xl border border-white/[0.07] bg-black/20 p-3"><p className="text-[9px] font-semibold uppercase tracking-wider text-white/25">Local model</p><p className="mt-1.5 font-mono text-[10px] text-white/45">{settings.builtInWhisperModel}</p>{settings.whisperConfigured && <p className="mt-2 text-[9px] text-lime/70">Custom Whisper CLI configured as first priority</p>}</div>
      </section>

      <section className="glass-panel rounded-3xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-300/[0.08] text-amber-200"><LockKeyhole className="h-4 w-4" /></span><h2 className="mt-4 text-base font-medium">Privacy boundary</h2></div><State ok>Local-first</State></div>
        <p className="mt-3 text-xs leading-5 text-white/35">Uploaded footage remains local unless you explicitly set an external AI key. With an external provider, extracted speech audio and timestamped transcript may be sent to the configured endpoint.</p>
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-lime/10 bg-lime/[0.04] p-3"><Database className="h-4 w-4 shrink-0 text-lime" /><p className="text-[10px] leading-4 text-white/45">Project metadata is persisted in local SQLite. Source media and exports stay as ordinary local files.</p></div>
      </section>

      <section className="rounded-3xl border border-dashed border-white/10 p-5 sm:p-6 lg:col-span-2">
        <p className="eyebrow">Private deployment configuration</p><p className="mt-2 text-sm leading-6 text-white/65">Platform connection credentials are configured once on the ViralCut server by the app owner. Creators only press <strong className="font-medium text-white/80">Continue with Google</strong> or <strong className="font-medium text-white/80">Continue with TikTok</strong>, sign in on that platform’s own page, and approve publishing. ViralCut never asks for or stores their account password.</p>
      </section>
    </div>
  );
}
