import { NextRequest, NextResponse } from 'next/server';
import { storageErrorDetails } from '@/lib/b2';
import { getProject } from '@/lib/persistence';
import { signedObjectReadUrl } from '@/services/storage';

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const project = await getProject(id);
    const storageKey = project?.video?.storageKey;
    if (!project?.video || project.video.storageProvider !== 'backblaze-b2' || !storageKey) {
      return NextResponse.json(
        { error: 'Stored video not found.', code: 'SOURCE_NOT_FOUND', retryable: false },
        { status: 404 },
      );
    }
    const presignedUrl = await signedObjectReadUrl(storageKey);
    return NextResponse.redirect(presignedUrl, 307);
  } catch (error) {
    const detail = storageErrorDetails(error, 'Could not open the stored video.');
    return NextResponse.json(
      { error: detail.error, code: detail.code, retryable: detail.retryable },
      { status: detail.status },
    );
  }
}
