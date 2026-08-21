import { Captions, Check, Clapperboard, Upload } from 'lucide-react';

const steps = [
  { number: '01', label: 'Upload your video', detail: 'Any supported local file', icon: Upload, accent: 'text-white/60' },
  { number: '02', label: 'Select your style', detail: '75–180 sec · 8 subtitle looks', icon: Captions, accent: 'text-[#b8afff]' },
  { number: '03', label: 'Generate and export', detail: '5–15 ranked, ready-to-post clips', icon: Clapperboard, accent: 'text-lime' },
];

export function WorkflowDemo() {
  return (
    <div className="glass-panel noise relative overflow-hidden rounded-3xl p-5 sm:p-7">
      <div className="absolute -right-20 -top-24 h-52 w-52 rounded-full bg-violet/15 blur-3xl" />
      <div className="relative flex items-center justify-between">
        <div><p className="eyebrow">Three-step workflow</p><p className="mt-1.5 text-sm text-white/55">Upload, choose a look, then let the clip machine run.</p></div>
        <span className="hidden items-center gap-1.5 rounded-full border border-lime/15 bg-lime/[0.06] px-3 py-1.5 text-[10px] font-semibold text-lime sm:flex"><Check className="h-3 w-3" /> LOCAL PIPELINE</span>
      </div>
      <div className="relative mt-7 grid gap-2 md:grid-cols-3">
        {steps.map(({ number, label, detail, icon: Icon, accent }, index) => (
          <div key={label} className="relative flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-black/20 p-3.5 md:min-h-[118px] md:p-4">
            <span className={`grid h-9 w-9 place-items-center rounded-xl bg-white/[0.055] ${accent}`}><Icon className="h-4 w-4" /></span>
            <div><p className="text-[9px] font-semibold uppercase tracking-[.14em] text-white/23">Step {number}</p><p className="mt-1 text-xs font-medium text-white/75">{label}</p><p className="mt-1 text-[10px] text-white/30">{detail}</p></div>
            {index < steps.length - 1 && <span className="absolute -right-2 top-1/2 z-10 hidden h-px w-3 bg-white/15 md:block" />}
          </div>
        ))}
      </div>
    </div>
  );
}
