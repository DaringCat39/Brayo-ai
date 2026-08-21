import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/persistence';
import { signedBlobReadUrl } from '@/services/storage';

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = await getProject(id);
  const storageKey = project?.video?.storageKey;
  if (!project?.video || project.video.storageProvider !== 'vercel-blob' || !storageKey) {
    return NextResponse.json({ error: 'Stored video not found.' }, { status: 404 });
  }

  try {
    const presignedUrl = await signedBlobReadUrl(storageKey);
    return NextResponse.redirect(presignedUrl, 307);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not open the stored video.' },
      { status: 502 },
    );
  }
}
