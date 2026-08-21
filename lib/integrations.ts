import { getIntegrationAccount, saveIntegrationAccount, type StoredIntegrationAccount } from '@/lib/persistence';
import type { IntegrationStatus, PublishingProvider } from '@/types';

export function integrationConfig(provider: PublishingProvider) {
  if (provider === 'youtube') {
    return {
      clientId: process.env.YOUTUBE_CLIENT_ID || '',
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
    };
  }
  return {
    clientId: process.env.TIKTOK_CLIENT_KEY || '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
  };
}

export async function integrationStatus(provider: PublishingProvider): Promise<IntegrationStatus> {
  const config = integrationConfig(provider);
  const account = await getIntegrationAccount(provider);
  return {
    provider,
    configured: Boolean(config.clientId && config.clientSecret),
    connected: Boolean(account),
    autoPublish: Boolean(account && account.autoPublish !== false),
    label: account?.label,
  };
}

export async function publicIntegrationStatuses() {
  return Promise.all([integrationStatus('youtube'), integrationStatus('tiktok')]);
}

async function parseError(response: Response) {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  return String(body.error_description || body.error || body.message || `Request failed (${response.status})`);
}

async function refreshAccount(account: StoredIntegrationAccount): Promise<StoredIntegrationAccount> {
  if (!account.refreshToken) throw new Error(`Reconnect ${account.provider} to continue publishing.`);
  const config = integrationConfig(account.provider);
  const body = new URLSearchParams();
  if (account.provider === 'youtube') {
    body.set('client_id', config.clientId);
    body.set('client_secret', config.clientSecret);
    body.set('refresh_token', account.refreshToken);
    body.set('grant_type', 'refresh_token');
  } else {
    body.set('client_key', config.clientId);
    body.set('client_secret', config.clientSecret);
    body.set('refresh_token', account.refreshToken);
    body.set('grant_type', 'refresh_token');
  }
  const response = await fetch(account.provider === 'youtube' ? 'https://oauth2.googleapis.com/token' : 'https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(await parseError(response));
  const token = await response.json() as { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
  return await saveIntegrationAccount({
    ...account,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || account.refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
    scope: token.scope || account.scope,
  });
}

export async function validAccessToken(provider: PublishingProvider) {
  const account = await getIntegrationAccount(provider);
  if (!account) throw new Error(`${provider === 'youtube' ? 'YouTube' : 'TikTok'} is not connected.`);
  const current = account.expiresAt > Date.now() + 300_000 ? account : await refreshAccount(account);
  return current.accessToken;
}
