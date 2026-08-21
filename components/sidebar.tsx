'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clapperboard, FolderOpen, Gauge, LayoutTemplate, Plus, RadioTower, Settings, Sparkles, WandSparkles } from 'lucide-react';
import { Logo } from '@/components/logo';

const navSections = [
  {
    label: 'Workspace',
    items: [
      { href: '/', label: 'Overview', icon: Gauge },
      { href: '/projects', label: 'My projects', icon: FolderOpen },
    ],
  },
  {
    label: 'Create',
    items: [
      { href: '/create', label: 'AI clip generator', icon: Clapperboard },
      { href: '/settings', label: 'Social publishing', icon: RadioTower },
    ],
  },
  {
    label: 'Discover',
    items: [
      { href: '/templates', label: 'Styles & templates', icon: LayoutTemplate },
      { href: '/trends', label: 'Trend intelligence', icon: Sparkles },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-white/[0.065] bg-[#0b0b0f]/92 px-3.5 py-5 backdrop-blur-2xl lg:flex">
      <div className="flex items-center justify-between px-2"><Logo /><span className="rounded-full border border-violet/20 bg-violet/[0.08] px-2 py-1 text-[8px] font-bold uppercase tracking-[.14em] text-[#c8c0ff]">Creator</span></div>
      <Link href="/create" className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#9e8cff] to-[#c4b8ff] px-4 py-2.5 text-[12px] font-semibold text-[#121016] shadow-[0_10px_30px_rgba(143,124,255,.16)] transition hover:-translate-y-0.5 hover:brightness-110">
        <Plus className="h-4 w-4" /> Create new
      </Link>
      <nav className="mt-6 space-y-6">
        {navSections.map((section) => <section key={section.label}>
          <p className="mb-2 px-3 text-[8px] font-semibold uppercase tracking-[.2em] text-white/22">{section.label}</p>
          <div className="space-y-0.5">{section.items.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={`${section.label}-${label}`}
                href={href}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] transition ${
                  active ? 'bg-white/[0.08] font-medium text-white shadow-sm' : 'text-white/42 hover:bg-white/[0.04] hover:text-white/75'
                }`}
              >
                <span className={`grid h-7 w-7 place-items-center rounded-lg transition ${active ? 'bg-violet/15 text-[#c8c0ff]' : 'bg-white/[0.035] text-white/38 group-hover:text-white/65'}`}><Icon className="h-3.5 w-3.5" /></span>
                {label}
              </Link>
            );
          })}</div>
        </section>)}
      </nav>
      <div className="mt-auto">
        <div className="mb-3 overflow-hidden rounded-2xl border border-violet/15 bg-gradient-to-br from-violet/[0.12] via-white/[0.025] to-lime/[0.04] p-3.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-white/85">
            <WandSparkles className="h-3.5 w-3.5 text-[#bcb2ff]" /> Smart creator mode
          </div>
          <p className="mt-2 text-[10px] leading-4 text-white/38">61–180 sec clips · live captions · action-centred framing.</p>
        </div>
        <Link href="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-white/45 hover:bg-white/[0.035] hover:text-white/75">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.035]"><Settings className="h-3.5 w-3.5" /></span> Settings
        </Link>
      </div>
    </aside>
  );
}
