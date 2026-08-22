import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { integrationConfig } from '@/lib/integrations';
import { configuredAppOrigin } from '@/lib/b2';
import type { PublishingProvider } from '@/types';

function isProvider(value: string): value is PublishingProvider {
  return value === 'youtube' || value === 'tiktok';
}

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: value } = await context.params;
  if (!isProvider(value)) return NextResponse.json({ error: 'Unknown publishing provider.' }, { status: 404 });
  const config = integrationConfig(value);
  if (!config.clientId || !config.clientSecret) {
    return NextResponse.redirect(new URL(`/settings?integration_error=${value}_not_configured`, request.url));
  }

  const state = randomBytes(24).toString('hex');
  const callback = new URL(`/api/integrations/${value}/callback`, configuredAppOrigin(request.nextUrl.origin)).toString();
  const destination = value === 'youtube'
    ? new URL('https://accounts.google.com/o/oauth2/v2/auth')
    : new URL('https://www.tiktok.com/v2/auth/authorize/');

  if (value === 'youtube') {
    destination.searchParams.set('client_id', config.clientId);
    destination.searchParams.set('redirect_uri', callback);
    destination.searchParams.set('response_type', 'code');
    destination.searchParams.set('scope', 'https://www.googleapis.com/auth/youtube.upload');
    destination.searchParams.set('access_type', 'offline');
    destination.searchParams.set('prompt', 'consent');
    destination.searchParams.set('state', state);
  } else {
    destination.searchParams.set('client_key', config.clientId);
    destination.searchParams.set('redirect_uri', callback);
    destination.searchParams.set('response_type', 'code');
    destination.searchParams.set('scope', 'video.publish');
    destination.searchParams.set('state', state);
  }

  const response = NextResponse.redirect(destination);
  response.cookies.set(`viralcut_${value}_oauth`, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: callback.startsWith('https://'),
    maxAge: 600,
    path: '/',
  });
  return response;
}
