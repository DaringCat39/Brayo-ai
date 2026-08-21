import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { WaveFile } from 'wavefile';
import { DATA_DIR } from '@/lib/paths';
import type { TranscriptSegment } from '@/types';

type TimedWord = { word: string; start: number; end: number };
type LocalWhisperOutput = {
  text?: string;
  chunks?: Array<{ text: string; timestamp: [number | null, number | null] }>;
};
type LocalTranscriber = (
  audio: Float32Array,
  options: { return_timestamps: 'word'; chunk_length_s: number; stride_length_s: number },
) => Promise<LocalWhisperOutput>;

declare global {
  // eslint-disable-next-line no-var
  var viralcutLocalTranscriber: Promise<LocalTranscriber> | undefined;
}

async function commandAvailable(command: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, ['--help'], { stdio: 'ignore' });
    child.once('error', () => resolve(false));
    child.once('close', () => resolve(true));
  });
}

function cleanText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function groupWordsIntoPhrases(words: TimedWord[]): TranscriptSegment[] {
  const usable = words
    .filter((word) => cleanText(word.word) && Number.isFinite(word.start) && Number.isFinite(word.end))
    .map((word) => ({ ...word, word: cleanText(word.word), end: Math.max(word.start + 0.04, word.end) }));
  const phrases: TranscriptSegment[] = [];
  let current: TimedWord[] = [];

  function flush() {
    if (!current.length) return;
    phrases.push({
      start: Math.max(0, current[0].start),
      end: current.at(-1)!.end + 0.1,
      text: cleanText(current.map((word) => word.word).join(' ')),
      words: current,
    });
    current = [];
  }

  usable.forEach((word, index) => {
    current.push(word);
    const next = usable[index + 1];
    const phraseDuration = word.end - current[0].start;
    const punctuationBreak = /[.!?…,:;]$/.test(word.word);
    const pauseBreak = next ? next.start - word.end > 0.38 : true;
    if (current.length >= 5 || phraseDuration >= 2.15 || punctuationBreak || pauseBreak) flush();
  });
  flush();
  for (let index = 0; index < phrases.length - 1; index += 1) {
    // A new phrase takes over on the first spoken word. Keeping cues
    // non-overlapping prevents two subtitle phrases appearing together.
    phrases[index].end = Math.max(phrases[index].start + 0.04, Math.min(phrases[index].end, phrases[index + 1].start));
  }
  return phrases;
}

function segmentsToPhrases(segments: TranscriptSegment[]) {
  const realWords = segments.flatMap((segment) => segment.words || []);
  if (realWords.length) return groupWordsIntoPhrases(realWords);

  const estimatedWords: TimedWord[] = [];
  for (const segment of segments) {
    const words = cleanText(segment.text).split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const duration = Math.max(0.3, segment.end - segment.start);
    words.forEach((word, index) => {
      const start = segment.start + (index / words.length) * duration;
      const end = segment.start + ((index + 1) / words.length) * duration;
      estimatedWords.push({ word, start, end });
    });
  }
  return groupWordsIntoPhrases(estimatedWords);
}

async function commandLineWhisper(audioPath: string, outputDir: string): Promise<TranscriptSegment[] | null> {
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
  return segmentsToPhrases((result.segments || []).map((segment) => ({
    start: segment.start,
    end: segment.end,
    text: cleanText(segment.text),
    words: segment.words,
  })));
}

async function getBuiltInTranscriber() {
  if (!global.viralcutLocalTranscriber) {
    global.viralcutLocalTranscriber = (async () => {
      const transformers = await import('@huggingface/transformers');
      transformers.env.cacheDir = path.join(DATA_DIR, 'models');
      const model = process.env.LOCAL_WHISPER_MODEL || 'Xenova/whisper-tiny.en';
      const transcriber = await transformers.pipeline('automatic-speech-recognition', model, {
        dtype: 'q8',
        device: 'cpu',
      });
      return transcriber as unknown as LocalTranscriber;
    })();
  }
  return global.viralcutLocalTranscriber;
}

async function builtInWhisper(audioPath: string): Promise<TranscriptSegment[]> {
  const buffer = await readFile(audioPath);
  const wav = new WaveFile(buffer);
  wav.toBitDepth('32f');
  wav.toSampleRate(16000);
  const audio = Float32Array.from(wav.getSamples(true));
  const transcriber = await getBuiltInTranscriber();
  const result = await transcriber(audio, {
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  const chunks = result.chunks || [];
  const words: TimedWord[] = chunks.map((chunk, index) => {
    const start = Number(chunk.timestamp?.[0] ?? 0);
    const nextStart = Number(chunks[index + 1]?.timestamp?.[0] ?? start + 0.45);
    const end = Number(chunk.timestamp?.[1] ?? nextStart);
    return { word: chunk.text, start, end };
  });
  return groupWordsIntoPhrases(words);
}

async function openAiTranscription(audioPath: string): Promise<TranscriptSegment[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const audio = await readFile(audioPath);
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/wav' }), path.basename(audioPath));
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');
  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!response.ok) throw new Error(`Transcription request failed (${response.status}).`);
  const result = (await response.json()) as {
    words?: Array<{ word: string; start: number; end: number }>;
    segments?: Array<{ start: number; end: number; text: string }>;
    text?: string;
  };
  if (result.words?.length) return groupWordsIntoPhrases(result.words);
  if (result.segments?.length) return segmentsToPhrases(result.segments.map((segment) => ({ ...segment, text: cleanText(segment.text) })));
  return result.text ? [{ start: 0, end: 3, text: cleanText(result.text) }] : [];
}

export async function transcribeAudio(audioPath: string, outputDir: string) {
  try {
    const local = await commandLineWhisper(audioPath, outputDir);
    if (local?.length) return { segments: local, mode: 'local-whisper' as const };
  } catch (error) {
    console.warn('Command-line Whisper failed, trying built-in local Whisper.', error);
  }
  try {
    const builtIn = await builtInWhisper(audioPath);
    if (builtIn.length) return { segments: builtIn, mode: 'built-in-whisper' as const };
  } catch (error) {
    global.viralcutLocalTranscriber = undefined;
    console.warn('Built-in local Whisper failed, trying the configured API.', error);
  }
  try {
    const remote = await openAiTranscription(audioPath);
    if (remote?.length) return { segments: remote, mode: 'openai' as const };
  } catch (error) {
    console.warn('Remote transcription failed; signal-only analysis will be used.', error);
  }
  return { segments: [], mode: 'signal-only' as const };
}
