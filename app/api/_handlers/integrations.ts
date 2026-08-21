import { NextResponse } from 'next/server';
import { publicIntegrationStatuses } from '@/lib/integrations';

export async function GET() {
  return NextResponse.json({ integrations: publicIntegrationStatuses() });
}
