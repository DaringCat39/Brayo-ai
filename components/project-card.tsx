import Link from 'next/link';
import { ArrowUpRight, Clock3, Film, Play } from 'lucide-react';
import type { Project } from '@/types';
import { formatDuration } from '@/lib/utils';
import { StatusPill } from '@/components/status-pill';

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`} className="group overflow-hidden rounded-2xl border border-white/[0.075] bg-white/[0.025] transition duration-300 hover:-translate-y-1 hover:border-white/[0.15] hover:bg-white/[0.045] hover:shadow-2xl hover:shadow-black/30">
      <div className="relative aspect-[16/9] overflow-hidden bg-[#17171b]">
        {project.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.thumbnailUrl} alt="" className="h-full w-full object-cover opacity-75 transition duration-500 group-hover:scale-[1.035] group-hover:opacity-90" />
        ) : (
          <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_center,rgba(143,124,255,.16),transparent_60%)]"><Film className="h-8 w-8 text-white/20" /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute left-3 top-3"><StatusPill status={project.status} /></div>
        <span className="absolute bottom-3 left-3 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md transition group-hover:scale-105 group-hover:bg-lime group-hover:text-black">
          <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
        </span>
        {project.video?.duration ? <span className="absolute bottom-3 right-3 rounded-md bg-black/55 px-2 py-1 text-[10px] font-medium text-white/70">{formatDuration(project.video.duration)}</span> : null}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-white/90">{project.name}</h3>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/30"><Clock3 className="h-3 w-3" /> {new Date(project.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-white/20 transition group-hover:text-lime" />
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[11px] text-white/35">
          <span>{project.clips.length} {project.clips.length === 1 ? 'clip' : 'clips'}</span>
          <span>{project.job.progress}% {project.status === 'ready' || project.status === 'complete' ? 'analysed' : project.job.stage.toLowerCase()}</span>
        </div>
      </div>
    </Link>
  );
}
