import type { Metadata } from 'next';
import '@/app/globals.css';
import { AppShell } from '@/components/app-shell';

export const metadata: Metadata = {
  title: 'Brayo.ai — AI Video Editor',
  description: 'Turn long videos into polished short-form clips, locally.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
