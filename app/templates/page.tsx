import Link from 'next/link';
import { ArrowUpRight, Captions, Clapperboard, Gamepad2, Mic2, Popcorn, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/page-header';

const templates = [
  { name: 'Bold Viral', category: 'High retention', ratio: '9:16', icon: Sparkles, gradient: 'from-[#8f7cff]/35 via-[#30295c]/40 to-[#16151f]', description: 'Fast hooks, bold word emphasis and purposeful punch-ins.' },
  { name: 'Podcast Focus', category: 'Conversation', ratio: '9:16', icon: Mic2, gradient: 'from-sky-400/25 via-[#152632] to-[#111317]', description: 'Speaker-first composition with clean, confident captions.' },
  { name: 'Cinematic Story', category: 'Narrative', ratio: '4:5', icon: Clapperboard, gradient: 'from-amber-300/20 via-[#332818] to-[#11100e]', description: 'Measured pacing, gentle grading and elegant transitions.' },
  { name: 'Gaming Energy', category: 'Gameplay', ratio: '9:16', icon: Gamepad2, gradient: 'from-fuchsia-400/25 via-[#321a36] to-[#151016]', description: 'Responsive punch-ins, energetic colour and reaction captions.' },
  { name: 'Clean Minimal', category: 'Professional', ratio: '1:1', icon: Captions, gradient: 'from-white/15 via-[#27272c] to-[#111114]', description: 'Understated typography with broadcast-ready polish.' },
  { name: 'Meme Cut', category: 'Comedy', ratio: '9:16', icon: Popcorn, gradient: 'from-lime/25 via-[#27321a] to-[#11140d]', description: 'Aggressive emphasis, reaction text and playful timing.' },
];

export default function TemplatesPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-9 sm:px-7 lg:px-10 lg:py-12">
      <PageHeader eyebrow="Edit systems" title="Templates" description="Purpose-built styling recipes that control framing, caption design, pacing and finish." />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map(({ name, category, ratio, icon: Icon, gradient, description }) => <article key={name} className="group overflow-hidden rounded-3xl border border-white/[0.075] bg-white/[0.025] transition hover:-translate-y-1 hover:border-white/[0.15]"><div className={`relative aspect-[16/9] overflow-hidden bg-gradient-to-br ${gradient}`}><div className="absolute inset-0 grid place-items-center"><div className={`relative ${ratio === '1:1' ? 'aspect-square h-[72%]' : ratio === '4:5' ? 'aspect-[4/5] h-[76%]' : 'aspect-[9/16] h-[78%]'} overflow-hidden rounded-lg border border-white/15 bg-black/35 shadow-2xl`}><span className="absolute inset-x-[10%] bottom-[17%] rounded bg-white/90 px-2 py-1 text-center text-[7px] font-black text-black">MAKE EVERY SECOND COUNT</span><Icon className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-white/25" /></div></div><span className="absolute right-3 top-3 rounded-full bg-black/35 px-2.5 py-1 text-[9px] text-white/50 backdrop-blur">{ratio}</span></div><div className="p-5"><p className="text-[9px] font-semibold uppercase tracking-[.14em] text-lime/70">{category}</p><div className="mt-2 flex items-center justify-between"><h2 className="font-medium">{name}</h2><ArrowUpRight className="h-4 w-4 text-white/20 transition group-hover:text-lime" /></div><p className="mt-2 text-[11px] leading-5 text-white/32">{description}</p><Link href="/create" className="button-secondary mt-4 w-full !py-2">Use template</Link></div></article>)}
      </div>
    </div>
  );
}
