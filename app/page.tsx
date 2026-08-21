import Link from 'next/link';
import { ArrowRight, Captions, ChevronRight, Clapperboard, Crosshair, RadioTower, ShieldCheck, Sparkles, WandSparkles, Zap } from 'lucide-react';
import { UploadDropzone } from '@/components/upload-dropzone';
import { RecentProjects } from '@/components/recent-projects';
import { ChannelConnections } from '@/components/channel-connections';

const creationTools = [
  {
    title: 'AI Clip Generator',
    description: 'Find the strongest moments in any long video.',
    href: '/create',
    icon: Clapperboard,
    className: 'from-[#b9a9ff] via-[#9b87fb] to-[#7459e7] text-[#171120]',
    tag: 'Popular',
  },
  {
    title: 'Smart Reframe',
    description: 'Keep faces and movement centred in every format.',
    href: '/create',
    icon: Crosshair,
    className: 'from-[#9ee7ff] via-[#6fc9f2] to-[#529cd7] text-[#07151d]',
  },
  {
    title: 'Live Captions',
    description: 'Word-perfect subtitles that appear with speech.',
    href: '/templates',
    icon: Captions,
    className: 'from-[#ffd59b] via-[#ffb77f] to-[#ef7e72] text-[#26130e]',
  },
  {
    title: 'Auto Publish',
    description: 'Export once and send to TikTok or YouTube.',
    href: '/settings',
    icon: RadioTower,
    className: 'from-[#bff47c] via-[#9ed961] to-[#64b96b] text-[#0b180b]',
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-7 lg:px-9 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-[#aa9eff]"><Sparkles className="h-3.5 w-3.5" /> Creator workspace</div>
          <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.045em] text-white sm:text-[38px]">What will you create today?</h1>
          <p className="mt-1.5 text-[12px] text-white/35">One workspace for clipping, captions, reframing and publishing.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2 text-[10px] text-white/45">Clips are <strong className="font-semibold text-white/75">61+ sec</strong></span>
          <Link href="/create" className="button-primary !rounded-xl !px-4 !py-2 text-xs">New video <Zap className="h-3.5 w-3.5" /></Link>
        </div>
      </header>

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[13px] font-semibold text-white/80">Quick create</h2><Link href="/create" className="flex items-center gap-1 text-[10px] text-white/30 transition hover:text-white/65">See workflow <ChevronRight className="h-3 w-3" /></Link></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {creationTools.map(({ title, description, href, icon: Icon, className, tag }) => (
            <Link key={title} href={href} className={`group relative min-h-[176px] overflow-hidden rounded-[22px] bg-gradient-to-br p-5 shadow-xl shadow-black/15 transition duration-300 hover:-translate-y-1 hover:shadow-2xl ${className}`}>
              <div className="absolute -right-9 -top-10 h-32 w-32 rounded-full border border-current opacity-10" />
              <div className="absolute -right-2 top-7 h-20 w-20 rounded-full border border-current opacity-10" />
              <div className="relative flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/30 shadow-sm backdrop-blur"><Icon className="h-5 w-5" /></span>{tag && <span className="rounded-full bg-black/15 px-2 py-1 text-[8px] font-bold uppercase tracking-wider">{tag}</span>}</div>
              <div className="relative mt-7"><h3 className="text-[15px] font-bold tracking-[-0.02em]">{title}</h3><p className="mt-1.5 max-w-[230px] text-[10px] font-medium leading-4 opacity-65">{description}</p></div>
              <ArrowRight className="absolute bottom-5 right-5 h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]">
        <div className="dashboard-panel p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-4"><div><p className="text-[13px] font-semibold">Start with a long video</p><p className="mt-1 text-[10px] text-white/32">AI creates 1–3 minute clips, times every spoken word, and follows the action.</p></div><span className="hidden items-center gap-1.5 rounded-full border border-lime/10 bg-lime/[0.04] px-2.5 py-1 text-[8px] font-semibold uppercase tracking-wider text-lime/70 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-lime" /> Local AI ready</span></div>
          <UploadDropzone compact />
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 px-1 text-[9px] text-white/27"><span className="flex items-center gap-1.5"><Captions className="h-3 w-3 text-[#ffbe8b]" /> Speech-synced captions</span><span className="flex items-center gap-1.5"><Crosshair className="h-3 w-3 text-[#81d7ff]" /> Action-centred frame</span><span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-lime/70" /> Footage stays local</span></div>
        </div>
        <div className="dashboard-panel p-5">
          <div className="flex items-start justify-between"><div><p className="text-[13px] font-semibold">Production flow</p><p className="mt-1 text-[10px] text-white/30">From source to social, automatically.</p></div><WandSparkles className="h-4 w-4 text-[#aa9eff]" /></div>
          <div className="mt-5 space-y-2.5">
            {[['01', 'Analyse speech & moments', 'AI finds complete stories'], ['02', 'Reframe & caption', 'Action and words stay in sync'], ['03', 'Export & auto-publish', 'YouTube and TikTok ready']].map(([number, title, detail]) => <div key={number} className="flex items-center gap-3 rounded-xl border border-white/[0.055] bg-black/15 p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet/10 text-[9px] font-bold text-[#bdb3ff]">{number}</span><div><p className="text-[10px] font-medium text-white/70">{title}</p><p className="mt-0.5 text-[9px] text-white/25">{detail}</p></div></div>)}
          </div>
        </div>
      </section>

      <section className="mt-9">
        <div className="mb-5 flex items-end justify-between">
          <div><p className="eyebrow">Library</p><h2 className="mt-1.5 text-lg font-semibold tracking-[-0.03em]">Recent projects</h2></div>
          <Link href="/projects" className="flex items-center gap-1.5 text-xs font-medium text-white/40 transition hover:text-lime">View all <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        <RecentProjects limit={3} />
      </section>

      <section className="mt-9 pb-8">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Connected channels</p><h2 className="mt-1.5 text-lg font-semibold tracking-[-0.03em]">Publish without leaving ViralCut</h2></div><p className="max-w-lg text-[10px] leading-4 text-white/30">Connect securely once. Finished exports can publish automatically to the channels you enable.</p></div>
        <ChannelConnections compact />
      </section>
    </div>
  );
}
