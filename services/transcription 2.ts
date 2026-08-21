import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { TranscriptSegment } from '@/types';

async function commandAvailable(command: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, ['--help'], { stdio: 'ignore' });
    child.once('error', () => resolve(false));
    child.once('close', () => resolve(true));
  });
}

async function localWhisper(audioPath: string, outputDir: string): Promise<TranscriptSegment[] | null> {
  const command = process.env.WHISPER_COMMAND?.trim() || 'whisper';
  if (!(await commandAvailable(command))) return null;
  const model = process.env.WHISPER_MODEL || 'base';
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [
      audioPath,
      '--model',
      model,
      '--output_format',
      'json',
      '--output_dir',
      outputDir,
      '--word_timestamps',
      'True',
    ]);
    let error = '';
    child.stderr.on('data', (data) => (error += data.toString()));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(error.slice(-1200)))));
  });
  const jsonPath = path.join(outputDir, `${path.basename(audioPath, path.extname(audioPath))}.json`);
  const result = JSON.parse(await readFile(jsonPath, 'utf8')) as {
    segments?: Array<{ start: number; end: number; text: string; words?: TranscriptSegment['words'] }>;
  };
  return (result.segments || []).map((segment) => ({
    start: segment.start,
    end: segment.end,
    text: segment.text.trim(),
    words: segment.words,
  }));
}

async function openAiTranscription(audioPath: string): Promise<TranscriptSegment[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const audio = await readFile(audioPath);
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/mpeg' }), path.basename(audioPath));
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!response.ok) throw new Error(`Transcription request failed (${response.status}).`);
  const result = (await response.json()) as {
    segments?: Array<{ start: number; end: number; text: string }>;
    text?: string;
  };
  if (result.segments?.length) return result.segments.map((segment) => ({ ...segment, text: segment.text.trim() }));
  return result.text ? [{ start: 0, end: 0, text: result.text }] : [];
}

export async function transcribeAudio(audioPath: string, outputDir: string) {
  try {
    const local = await localWhisper(audioPath, outputDir);
    if (local) return { segments: local, mode: 'local-whisper' as const };
  } catch (error) {
    console.warn('Local Whisper failed, trying configured API.', error);
  }
  try {
    const remote = await openAiTranscription(audioPath);
    if (remote) return { segments: remote, mode: 'openai' as const };
  } catch (error) {
    console.warn('Remote transcription failed; signal-only analysis will be used.', error);
  }
  return { segments: [], mode: 'signal-only' as const };
}
