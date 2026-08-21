'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderOpen, Home, LayoutTemplate, Plus, Sparkles } from 'lucide-react';
import { Sidebar } from '@/components/sidebar';
import { Logo } from '@/components/logo';

const mobileNav = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/create', label: 'Create', icon: Plus },
  { href: '/templates', label: 'Templates', icon: LayoutTemplate },
  { href: '/trends', label: 'Trends', icon: Sparkles },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const editor = /^\/projects\/[^/]+/.test(pathname);
  return (
    <div className="min-h-screen">
      <Sidebar />
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/[0.06] bg-[#09090b]/80 px-4 backdrop-blur-xl lg:hidden">
        <Logo />
        <Link href="/create" className="button-primary !px-3 !py-2"><Plus className="h-4 w-4" /> Create</Link>
      </header>
      <main className={`pb-24 lg:ml-[248px] lg:pb-0 ${editor ? '' : 'min-h-screen'}`}>{children}</main>
      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-2xl border border-white/10 bg-[#121216]/95 p-1.5 shadow-2xl backdrop-blur-2xl lg:hidden">
        {mobileNav.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] ${active ? 'bg-white/[0.07] text-lime' : 'text-white/40'}`}>
              <Icon className="h-4 w-4" /> {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
