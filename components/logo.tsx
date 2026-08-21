import Link from 'next/link';
import { Play } from 'lucide-react';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5" aria-label="ViralCut home">
      <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-lime text-black shadow-[0_0_30px_rgba(215,255,95,.14)]">
        <Play className="ml-0.5 h-4 w-4 fill-current" />
      </span>
      {!compact && (
        <span className="text-[17px] font-bold tracking-[-0.035em]">
          Viral<span className="text-lime">Cut</span>
        </span>
      )}
    </Link>
  );
}
