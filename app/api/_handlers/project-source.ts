import { issueSignedToken, presignUrl } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db';

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = getProject(id);
  const storageKey = project?.video?.storageKey;
  if (!project?.video || project.video.storageProvider !== 'vercel-blob' || !storageKey) {
    return NextResponse.json({ error: 'Stored video not found.' }, { status: 404 });
  }

  try {
    const validUntil = Date.now() + 60 * 60 * 1000;
    const signedToken = await issueSignedToken({
      pathname: storageKey,
      operations: ['get'],
      validUntil,
    });
    const { presignedUrl } = await presignUrl(signedToken, {
      access: 'private',
      operation: 'get',
      pathname: storageKey,
      validUntil,
    });
    return NextResponse.redirect(presignedUrl, 307);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not open the stored video.' },
      { status: 502 },
    );
  }
}
