import { NextRequest, NextResponse } from 'next/server';
import { deleteIntegrationAccount, getIntegrationAccount, saveIntegrationAccount } from '@/lib/persistence';
import { integrationConfig } from '@/lib/integrations';
import type { PublishingProvider } from '@/types';

function isProvider(value: string): value is PublishingProvider {
  return value === 'youtube' || value === 'tiktok';
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: value } = await context.params;
  if (!isProvider(value)) return NextResponse.json({ error: 'Unknown publishing provider.' }, { status: 404 });
  const account = await getIntegrationAccount(value);
  if (!account) return NextResponse.json({ error: 'Connect this account first.' }, { status: 409 });
  const body = await request.json() as { autoPublish?: boolean };
  const updated = await saveIntegrationAccount({ ...account, autoPublish: Boolean(body.autoPublish) });
  return NextResponse.json({ connected: true, autoPublish: updated.autoPublish });
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: value } = await context.params;
  if (!isProvider(value)) return NextResponse.json({ error: 'Unknown publishing provider.' }, { status: 404 });
  const account = await getIntegrationAccount(value);
  if (value === 'tiktok' && account) {
    const config = integrationConfig('tiktok');
    await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: config.clientId, client_secret: config.clientSecret, token: account.accessToken }),
    }).catch(() => undefined);
  }
  await deleteIntegrationAccount(value);
  return NextResponse.json({ disconnected: true });
}
