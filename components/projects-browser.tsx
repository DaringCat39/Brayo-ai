'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Project } from '@/types';
import { ProjectCard } from '@/components/project-card';

export function ProjectsBrowser() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'complete'>('all');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    async function load() {
      const response = await fetch('/api/projects', { cache: 'no-store' });
      const body = (await response.json()) as { projects: Project[] };
      if (mounted) { setProjects(body.projects); setLoading(false); }
    }
    load();
    const timer = setInterval(load, 4000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);
  const filtered = useMemo(() => projects.filter((project) => {
    const queryMatch = project.name.toLowerCase().includes(query.toLowerCase());
    const stateMatch = filter === 'all' || (filter === 'complete' ? ['ready', 'complete'].includes(project.status) : ['queued', 'uploaded', 'analysing', 'rendering'].includes(project.status));
    return queryMatch && stateMatch;
  }), [projects, query, filter]);
  return (
    <div>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-xl border border-white/[0.07] bg-white/[0.025] p-1">
          {(['all', 'active', 'complete'] as const).map((item) => (
            <button key={item} onClick={() => setFilter(item)} className={`rounded-lg px-3 py-2 text-xs capitalize transition ${filter === item ? 'bg-white/[0.09] text-white' : 'text-white/35 hover:text-white/65'}`}>{item}</button>
          ))}
        </div>
        <label className="relative block sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" className="field pl-9" />
        </label>
      </div>
      {loading ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="aspect-[1.25] animate-pulse rounded-2xl bg-white/[0.035]" />)}</div>
      ) : filtered.length ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((project) => <ProjectCard key={project.id} project={project} />)}</div>
      ) : (
        <div className="mt-6 rounded-3xl border border-dashed border-white/10 py-20 text-center text-sm text-white/35">No matching projects yet.</div>
      )}
    </div>
  );
}
