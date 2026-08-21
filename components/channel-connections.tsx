'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, LoaderCircle, Radio, ShieldCheck, Unplug, Youtube, Zap } from 'lucide-react';
import type { IntegrationStatus, PublishingProvider } from '@/types';

const providerDetails = {
  youtube: {
    name: 'YouTube',
    description: 'Send finished Shorts straight to your channel.',
    icon: Youtube,
    accent: 'border-red-400/15 bg-red-400/[0.055] text-red-300',
  },
  tiktok: {
    name: 'TikTok',
    description: 'Direct-post exported clips with your chosen privacy.',
    icon: Radio,
    accent: 'border-cyan-300/15 bg-cyan-300/[0.055] text-cyan-200',
  },
} as const;

export function ChannelConnections({ compact = false }: { compact?: boolean }) {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<PublishingProvider | null>(null);
  const [updating, setUpdating] = useState<PublishingProvider | null>(null);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    const response = await fetch('/api/integrations', { cache: 'no-store' });
    const body = await response.json() as { integrations?: IntegrationStatus[] };
    setIntegrations(body.integrations || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const url = new URL(window.location.href);
    const connected = url.searchParams.get('connected');
    const error = url.searchParams.get('integration_error');
    if (connected === 'youtube' || connected === 'tiktok') setNotice(`${connected === 'youtube' ? 'YouTube' : 'TikTok'} connected. Auto-publish is on.`);
    if (error) setNotice(error.endsWith('_not_configured') ? 'Secure account sign-in has not been activated for this installation yet. No username or password was requested or stored.' : decodeURIComponent(error).replaceAll('_', ' '));
    if (connected || error) {
      url.searchParams.delete('connected');
      url.searchParams.delete('integration_error');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [load]);

  async function disconnect(provider: PublishingProvider) {
    setDisconnecting(provider);
    await fetch(`/api/integrations/${provider}`, { method: 'DELETE' });
    await load();
    setDisconnecting(null);
  }

  async function setAutoPublish(provider: PublishingProvider, enabled: boolean) {
    setUpdating(provider);
    await fetch(`/api/integrations/${provider}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ autoPublish: enabled }),
    });
    await load();
    setUpdating(null);
  }

  if (loading) return <div className="grid h-36 place-items-center"><LoaderCircle className="h-5 w-5 animate-spin text-lime" /></div>;

  return (
    <div>
      {notice && <p className={`mb-3 rounded-xl border p-3 text-[11px] leading-5 ${notice.includes('connected') ? 'border-lime/15 bg-lime/[0.045] text-lime/75' : 'border-amber-300/15 bg-amber-300/[0.045] text-amber-100/70'}`}>{notice}</p>}
      <div className={`grid gap-3 ${compact ? 'md:grid-cols-2' : ''}`}>
      {(['youtube', 'tiktok'] as PublishingProvider[]).map((provider) => {
        const status = integrations.find((item) => item.provider === provider) || { provider, configured: false, connected: false, autoPublish: false };
        const details = providerDetails[provider];
        const Icon = details.icon;
        return (
          <div key={provider} className="group rounded-2xl border border-white/[0.075] bg-[#111114] p-4 transition hover:border-white/[0.14]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${details.accent}`}><Icon className="h-5 w-5" /></span>
                <div className="min-w-0"><p className="text-sm font-medium">{details.name}</p><p className="mt-1 truncate text-[10px] text-white/30">{status.connected ? status.label : details.description}</p></div>
              </div>
              {status.connected && <span className="inline-flex items-center gap-1 rounded-full border border-lime/15 bg-lime/[0.06] px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-lime"><Check className="h-2.5 w-2.5" /> Connected</span>}
            </div>
            {status.connected ? <>
              <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3">
                <span className="flex items-center gap-1.5 text-[10px] font-medium text-white/55"><Zap className="h-3 w-3 text-lime" /> Auto-publish every export</span>
                <button onClick={() => void setAutoPublish(provider, !status.autoPublish)} disabled={updating === provider} className={`relative h-5 w-9 rounded-full transition disabled:opacity-40 ${status.autoPublish ? 'bg-lime' : 'bg-white/10'}`} aria-label={`Auto-publish every export to ${details.name}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-black transition ${status.autoPublish ? 'left-[18px]' : 'left-0.5'}`} /></button>
              </div>
              <button onClick={() => void disconnect(provider)} disabled={disconnecting === provider} className="mt-3 flex items-center gap-1.5 text-[10px] font-medium text-white/30 transition hover:text-red-300 disabled:opacity-40">{disconnecting === provider ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />} Disconnect account</button>
            </> : <div className="mt-4 border-t border-white/[0.06] pt-3">
              <p className="flex items-start gap-1.5 text-[10px] leading-4 text-white/35"><ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-lime" /> Sign in on {provider === 'youtube' ? 'Google' : 'TikTok'} and approve video publishing only. ViralCut never sees your password.</p>
              <a href={`/api/integrations/${provider}/connect`} className="button-primary mt-3 w-full !py-2 text-[10px]">{provider === 'youtube' ? 'Continue with Google' : 'Continue with TikTok'} <ExternalLink className="h-3 w-3" /></a>
            </div>}
          </div>
        );
      })}
      </div>
    </div>
  );
}
