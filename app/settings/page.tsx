import { PageHeader } from '@/components/page-header';
import { SettingsView } from '@/components/settings-view';

export default function SettingsPage() {
  return <div className="mx-auto max-w-6xl px-4 py-9 sm:px-7 lg:px-10 lg:py-12"><PageHeader eyebrow="Preferences" title="Settings" description="Inspect local processing, privacy boundaries and optional AI connections." /><SettingsView /></div>;
}
