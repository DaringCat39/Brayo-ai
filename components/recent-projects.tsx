'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Film } from 'lucide-react';
import type { Project } from '@/types';
import { ProjectCard } from '@/components/project-card';

export function RecentProjects({ limit = 3, showEmpty = true }: { limit?: number; showEmpty?: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch('/api/projects', { cache: 'no-store' });
        const body = (await response.json()) as { projects?: Project[]; error?: string };
        if (!response.ok || !Array.isArray(body.projects)) throw new Error(body.error || 'Projects could not be loaded.');
        if (active) setProjects(body.projects);
      } catch (error) {
        console.error('[Brayo.ai] Recent-project request failed:', error);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    const timer = setInterval(load, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const visible = projects.slice(0, limit);
  if (loading) return <div className="grid gap-4 md:grid-cols-3">{Array.from({ length: Math.min(3, limit) }, (_, index) => <div key={index} className="aspect-[1.25] animate-pulse rounded-2xl bg-white/[0.035]" />)}</div>;
  if (!visible.length && !showEmpty) return null;
  if (!visible.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
        <Film className="mx-auto h-7 w-7 text-white/20" />
        <p className="mt-3 text-sm text-white/50">Your first project will appear here.</p>
        <Link href="/create" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-lime">Create a clip <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
    );
  }
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((project) => <ProjectCard key={project.id} project={project} />)}</div>;
}
