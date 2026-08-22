import { Captions, Check, LockKeyhole, Scissors, ScanSearch, Sparkles, UploadCloud, WandSparkles } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { UploadDropzone } from '@/components/upload-dropzone';

const features = [
  { icon: ScanSearch, title: 'Full-context analysis', detail: 'Reviews the complete recording—not just the first few minutes.' },
  { icon: Scissors, title: 'Editorial cut points', detail: 'Uses speech, pauses and pacing to avoid awkward endings.' },
  { icon: WandSparkles, title: 'Ready-to-post styling', detail: 'Vertical reframing, captions, hooks, colour and loudness.' },
];

const steps = [
  { number: '01', icon: UploadCloud, title: 'Upload source', detail: 'Choose footage you own' },
  { number: '02', icon: Captions, title: 'Set the format', detail: 'Pick length and subtitles' },
  { number: '03', icon: Sparkles, title: 'Generate clips', detail: 'AI finds and edits moments' },
];

export default function CreatePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-9 sm:px-7 lg:px-10 lg:py-12">
      <PageHeader eyebrow="Auto clip workflow" title="Create a complete clip batch in three steps." description="Upload once, choose your format and let Brayo.ai find, caption and prepare every strong moment—using the same fast guided workflow as leading creator tools, with your private local pipeline." />
      <div className="mt-7 grid gap-2 sm:grid-cols-3">
        {steps.map(({ number, icon: Icon, title, detail }, index) => (
          <div key={title} className="relative flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${index === 0 ? 'bg-lime text-black' : 'bg-white/[0.055] text-white/45'}`}><Icon className="h-4 w-4" /></span>
            <div><p className="text-[9px] font-semibold uppercase tracking-[.15em] text-white/25">Step {number}</p><p className="mt-0.5 text-xs font-medium text-white/75">{title}</p><p className="mt-0.5 text-[9px] text-white/28">{detail}</p></div>
            {index === 0 && <Check className="ml-auto h-3.5 w-3.5 text-lime" />}
          </div>
        ))}
      </div>
      <div className="mt-9 grid gap-6 lg:grid-cols-[1fr_320px]">
        <UploadDropzone />
        <aside className="glass-panel rounded-3xl p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-lime"><LockKeyhole className="h-4 w-4" /> Your private clip machine</div>
          <p className="mt-2 text-xs leading-5 text-white/35">Your source and renders are written only to this project’s local data folder. External AI is used only if you configure a key.</p>
          <div className="mt-5 space-y-4 border-t border-white/[0.07] pt-5">
            {features.map(({ icon: Icon, title, detail }) => (
              <div key={title} className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-white/55"><Icon className="h-4 w-4" /></span>
                <div><p className="text-xs font-medium text-white/75">{title}</p><p className="mt-1 text-[11px] leading-4 text-white/30">{detail}</p></div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-violet/15 bg-violet/[0.055] p-3.5"><p className="text-[10px] font-semibold text-[#c8c0ff]">Designed for volume</p><p className="mt-1.5 text-[10px] leading-4 text-white/32">Generate 5–15 clips, review the ranked moments, then edit or batch export without rebuilding the project.</p></div>
        </aside>
      </div>
    </div>
  );
}
