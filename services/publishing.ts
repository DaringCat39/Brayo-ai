import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { Clip, Project, PublicationResult, PublishingProvider, TikTokPrivacy } from '@/types';
import { validAccessToken } from '@/lib/integrations';

function publicationError(error: unknown): PublicationResult {
  return {
    status: 'failed',
    error: error instanceof Error ? error.message : 'Publishing failed.',
    updatedAt: new Date().toISOString(),
  };
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  const nested = body.error && typeof body.error === 'object' ? body.error as Record<string, unknown> : undefined;
  return String(nested?.message || nested?.code || body.error_description || body.message || `Publishing request failed (${response.status})`);
}

async function publishYouTube(project: Project, clip: Clip): Promise<PublicationResult> {
  if (!clip.outputPath) throw new Error('Export the clip before publishing it.');
  const accessToken = await validAccessToken('youtube');
  const fileStats = await stat(clip.outputPath);
  const description = [clip.socialCaption, clip.hashtags.join(' ')].filter(Boolean).join('\n\n');
  const session = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-length': String(fileStats.size),
      'x-upload-content-type': 'video/mp4',
    },
    body: JSON.stringify({
      snippet: {
        title: (clip.youtubeTitle || clip.title).slice(0, 100),
        description,
        tags: clip.hashtags.map((tag) => tag.replace(/^#/, '')).filter(Boolean),
        categoryId: '22',
      },
      status: { privacyStatus: clip.autoPublish?.youtubePrivacy || 'private', selfDeclaredMadeForKids: false },
    }),
  });
  if (!session.ok) throw new Error(await responseError(session));
  const uploadUrl = session.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube did not provide an upload session.');
  const uploaded = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'video/mp4', 'content-length': String(fileStats.size) },
    body: Readable.toWeb(createReadStream(clip.outputPath)) as ReadableStream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  if (!uploaded.ok) throw new Error(await responseError(uploaded));
  const video = await uploaded.json() as { id?: string };
  if (!video.id) throw new Error('YouTube accepted the upload without returning a video ID.');
  return { status: 'published', id: video.id, url: `https://youtu.be/${video.id}`, updatedAt: new Date().toISOString() };
}

function tiktokChunkPlan(size: number) {
  if (size <= 64 * 1024 * 1024) return { chunkSize: size, count: 1 };
  const chunkSize = 32 * 1024 * 1024;
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

async function publishTikTok(clip: Clip): Promise<PublicationResult> {
  if (!clip.outputPath) throw new Error('Export the clip before publishing it.');
  const accessToken = await validAccessToken('tiktok');
  const creatorResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json; charset=UTF-8' },
    body: '{}',
  });
  if (!creatorResponse.ok) throw new Error(await responseError(creatorResponse));
  const creator = await creatorResponse.json() as { data?: { privacy_level_options?: TikTokPrivacy[] }; error?: { code?: string; message?: string } };
  if (creator.error?.code && creator.error.code !== 'ok') throw new Error(creator.error.message || creator.error.code);
  const privacyOptions = creator.data?.privacy_level_options || [];
  const requestedPrivacy = clip.autoPublish?.tiktokPrivacy || 'SELF_ONLY';
  const privacy = privacyOptions.includes(requestedPrivacy)
    ? requestedPrivacy
    : privacyOptions.includes('SELF_ONLY') ? 'SELF_ONLY' : privacyOptions[0];
  if (!privacy) throw new Error('TikTok did not return an available privacy option for this account.');

  const fileStats = await stat(clip.outputPath);
  const { chunkSize, count } = tiktokChunkPlan(fileStats.size);
  const initialized = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      post_info: {
        title: [clip.socialCaption, clip.hashtags.join(' ')].filter(Boolean).join(' ').slice(0, 2200),
        privacy_level: privacy,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        brand_content_toggle: false,
        brand_organic_toggle: false,
        is_aigc: false,
      },
      source_info: { source: 'FILE_UPLOAD', video_size: fileStats.size, chunk_size: chunkSize, total_chunk_count: count },
    }),
  });
  if (!initialized.ok) throw new Error(await responseError(initialized));
  const initBody = await initialized.json() as { data?: { publish_id?: string; upload_url?: string }; error?: { code?: string; message?: string } };
  if (initBody.error?.code && initBody.error.code !== 'ok') throw new Error(initBody.error.message || initBody.error.code);
  const uploadUrl = initBody.data?.upload_url;
  const publishId = initBody.data?.publish_id;
  if (!uploadUrl || !publishId) throw new Error('TikTok did not provide an upload destination.');

  const handle = await open(clip.outputPath, 'r');
  try {
    let start = 0;
    for (let index = 0; index < count; index += 1) {
      const remaining = fileStats.size - start;
      const currentSize = index === count - 1 ? remaining : Math.min(chunkSize, remaining);
      const data = Buffer.allocUnsafe(currentSize);
      await handle.read(data, 0, currentSize, start);
      const end = start + currentSize - 1;
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(currentSize),
          'content-range': `bytes ${start}-${end}/${fileStats.size}`,
        },
        body: data,
      });
      if (!response.ok) throw new Error(await responseError(response));
      start = end + 1;
    }
  } finally {
    await handle.close();
  }
  // TikTok processes Direct Post uploads asynchronously. Poll briefly so the
  // UI only says "Published" after TikTok confirms PUBLISH_COMPLETE.
  for (let attempt = 0; attempt < 15; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
    const statusResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ publish_id: publishId }),
    });
    if (!statusResponse.ok) throw new Error(await responseError(statusResponse));
    const statusBody = await statusResponse.json() as {
      data?: { status?: string; fail_reason?: string; publicaly_available_post_id?: Array<string | number> };
      error?: { code?: string; message?: string };
    };
    if (statusBody.error?.code && statusBody.error.code !== 'ok') throw new Error(statusBody.error.message || statusBody.error.code);
    if (statusBody.data?.status === 'FAILED') throw new Error(statusBody.data.fail_reason || 'TikTok could not publish this video.');
    if (statusBody.data?.status === 'PUBLISH_COMPLETE') {
      const postId = statusBody.data.publicaly_available_post_id?.[0];
      return { status: 'published', id: String(postId || publishId), updatedAt: new Date().toISOString() };
    }
  }
  return { status: 'publishing', id: publishId, updatedAt: new Date().toISOString() };
}

export async function publishClip(project: Project, clip: Clip, provider: PublishingProvider): Promise<PublicationResult> {
  try {
    return provider === 'youtube' ? await publishYouTube(project, clip) : await publishTikTok(clip);
  } catch (error) {
    return publicationError(error);
  }
}
