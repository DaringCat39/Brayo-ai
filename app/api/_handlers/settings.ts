import { NextResponse } from 'next/server';
import { DATA_DIR } from '@/lib/paths';
import { ffmpegReady } from '@/services/ffmpeg';
import { publicIntegrationStatuses } from '@/lib/integrations';

export async function GET() {
  return NextResponse.json({
    settings: {
      aiConfigured: Boolean(process.env.OPENAI_API_KEY),
      aiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      aiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      whisperConfigured: Boolean(process.env.WHISPER_COMMAND),
      builtInWhisperModel: process.env.LOCAL_WHISPER_MODEL || 'Xenova/whisper-tiny.en',
      ffmpegReady: await ffmpegReady(),
      storagePath: DATA_DIR,
      integrations: publicIntegrationStatuses(),
    },
  });
}
