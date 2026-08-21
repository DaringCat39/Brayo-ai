import { Check, Clock3, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ProjectStatus } from '@/types';

export function StatusPill({ status }: { status: ProjectStatus }) {
  const processing = ['uploaded', 'queued', 'analysing', 'rendering'].includes(status);
  const complete = ['ready', 'complete'].includes(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
      status === 'failed'
        ? 'border-red-400/15 bg-red-400/[0.07] text-red-300'
        : complete
          ? 'border-lime/15 bg-lime/[0.07] text-lime'
          : 'border-violet/20 bg-violet/[0.08] text-[#bbb1ff]'
    }`}>
      {status === 'failed' ? <TriangleAlert className="h-3 w-3" /> : complete ? <Check className="h-3 w-3" /> : processing ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Clock3 className="h-3 w-3" />}
      {status}
    </span>
  );
}
