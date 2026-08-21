import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { ProjectsBrowser } from '@/components/projects-browser';

export default function ProjectsPage() {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-9 sm:px-7 lg:px-10 lg:py-12">
      <PageHeader eyebrow="Workspace" title="Projects" description="Every source, suggested clip and export remains organised in your local library." action={<Link href="/create" className="button-primary"><Plus className="h-4 w-4" /> New project</Link>} />
      <ProjectsBrowser />
    </div>
  );
}
