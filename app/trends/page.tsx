import { Activity, Braces, Check, KeyRound, Radio, Sparkles, TimerReset, Zap } from 'lucide-react';
import { PageHeader } from '@/components/page-header';

const heuristics = [
  { icon: Zap, title: 'Hook in 1.5 seconds', detail: 'Prefer a strong claim, question or tension immediately.' },
  { icon: TimerReset, title: 'Remove dead air', detail: 'Use detected pauses as natural editorial cut points.' },
  { icon: Activity, title: 'Sustain visual rhythm', detail: 'Recommend a visual change about every 3.2 seconds.' },
  { icon: Sparkles, title: 'End on the payoff', detail: 'Keep the reveal or conclusion; avoid arbitrary cutoffs.' },
];

export default function TrendsPage() {
  return (
    <div className="mx-auto max-w-[1300px] px-4 py-9 sm:px-7 lg:px-10 lg:py-12">
      <PageHeader eyebrow="Modular intelligence" title="Trend Intelligence" description="Rank clips using transparent local heuristics today, with clean provider interfaces for legitimate public trend APIs later." />
      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="glass-panel rounded-3xl p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><p className="eyebrow">Local fallback engine</p><h2 className="mt-2 text-lg font-medium">Editing signals in use</h2></div><span className="inline-flex items-center gap-1.5 rounded-full border border-lime/15 bg-lime/[0.06] px-2.5 py-1 text-[10px] font-semibold text-lime"><Check className="h-3 w-3" /> ACTIVE</span></div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">{heuristics.map(({ icon: Icon, title, detail }) => <div key={title} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-violet/[0.09] text-[#b8afff]"><Icon className="h-4 w-4" /></span><p className="mt-4 text-xs font-medium text-white/75">{title}</p><p className="mt-1.5 text-[11px] leading-5 text-white/30">{detail}</p></div>)}</div>
          <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/20 p-4"><div className="flex items-center gap-2 text-[11px] font-medium text-white/65"><Braces className="h-4 w-4 text-lime" /> Configurable by design</div><p className="mt-2 text-[10px] leading-5 text-white/30">The scoring service combines hook, retention, emotional intensity, shareability, novelty, clarity and visual-interest estimates. Every card exposes the result as estimated potential—never a promise of virality.</p></div>
        </section>
        <aside className="space-y-4">
          <section className="glass-panel rounded-3xl p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-lime/[0.08] text-lime"><Radio className="h-4 w-4" /></span><div><p className="text-sm font-medium">Local heuristics</p><p className="text-[10px] text-lime/70">Connected</p></div></div><p className="mt-4 text-[11px] leading-5 text-white/32">Speech pacing, pauses, self-contained stories, curiosity language and payoff endings.</p></section>
          <section className="rounded-3xl border border-dashed border-white/10 p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.04] text-white/35"><KeyRound className="h-4 w-4" /></span><div><p className="text-sm font-medium text-white/65">YouTube public API</p><p className="text-[10px] text-white/25">Provider available</p></div></div><p className="mt-4 text-[11px] leading-5 text-white/30">Ready for a user-supplied key to ingest permitted titles, keywords, duration and public engagement metadata. No brittle scraping.</p></section>
          <section className="rounded-3xl border border-dashed border-white/10 p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.04] text-white/35"><Braces className="h-4 w-4" /></span><div><p className="text-sm font-medium text-white/65">Custom licensed feed</p><p className="text-[10px] text-white/25">Adapter ready</p></div></div><p className="mt-4 text-[11px] leading-5 text-white/30">A clean interface for first-party research or properly licensed trend providers.</p></section>
        </aside>
      </div>
    </div>
  );
}
