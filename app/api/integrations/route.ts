import { NextResponse } from 'next/server';
import { publicIntegrationStatuses } from '@/lib/integrations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ integrations: publicIntegrationStatuses() });
}
