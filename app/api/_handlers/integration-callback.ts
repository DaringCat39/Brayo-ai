import { NextRequest, NextResponse } from 'next/server';
import { getIntegrationAccount, saveIntegrationAccount } from '@/lib/db';
import { integrationConfig } from '@/lib/integrations';
import type { PublishingProvider } from '@/types';

function isProvider(value: string): value is PublishingProvider {
  return value === 'youtube' || value === 'tiktok';
}

function settingsRedirect(request: NextRequest, query: string) {
  return NextResponse.redirect(new URL(`/settings?${query}`, request.url));
}

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: value } = await context.params;
  if (!isProvider(value)) return NextResponse.json({ error: 'Unknown publishing provider.' }, { status: 404 });
  const error = request.nextUrl.searchParams.get('error');
  if (error) return settingsRedirect(request, `integration_error=${encodeURIComponent(error)}`);

  const state = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get(`viralcut_${value}_oauth`)?.value;
  const code = request.nextUrl.searchParams.get('code');
  if (!code || !state || !expectedState || state !== expectedState) {
    return settingsRedirect(request, 'integration_error=invalid_oauth_state');
  }

  try {
    const config = integrationConfig(value);
    const callback = new URL(`/api/integrations/${value}/callback`, process.env.APP_URL || request.nextUrl.origin).toString();
    const form = new URLSearchParams();
    if (value === 'youtube') {
      form.set('client_id', config.clientId);
      form.set('client_secret', config.clientSecret);
    } else {
      form.set('client_key', config.clientId);
      form.set('client_secret', config.clientSecret);
    }
    form.set('code', code);
    form.set('grant_type', 'authorization_code');
    form.set('redirect_uri', callback);
    const tokenResponse = await fetch(value === 'youtube' ? 'https://oauth2.googleapis.com/token' : 'https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const token = await tokenResponse.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      open_id?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenResponse.ok || !token.access_token) throw new Error(token.error_description || token.error || 'Token exchange failed.');

    // Request upload/publish permission only; no profile, email, contacts or
    // password access is needed for ViralCut to publish finished videos.
    const label = value === 'youtube' ? 'YouTube channel' : 'TikTok account';

    saveIntegrationAccount({
      provider: value,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || getIntegrationAccount(value)?.refreshToken,
      expiresAt: Date.now() + (token.expires_in || 3600) * 1000,
      label,
      accountId: token.open_id,
      scope: token.scope,
      autoPublish: getIntegrationAccount(value)?.autoPublish ?? true,
    });
    const response = settingsRedirect(request, `connected=${value}`);
    response.cookies.delete(`viralcut_${value}_oauth`);
    return response;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Connection failed.';
    return settingsRedirect(request, `integration_error=${encodeURIComponent(message)}`);
  }
}
