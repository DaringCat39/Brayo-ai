import { spawn } from 'node:child_process';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import type { Clip, TranscriptSegment, VideoMetadata } from '@/types';
import { clamp } from '@/lib/utils';

const packagedFfmpegPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const packagedFfprobePath = path.join(
  process.cwd(),
  'node_modules',
  'ffprobe-static',
  'bin',
  process.platform,
  process.arch === 'x64' ? 'x64' : process.arch,
  process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
);
const ffmpegPath = packagedFfmpegPath || ffmpegStatic || 'ffmpeg';
const ffprobePath = packagedFfprobePath || ffprobeStatic.path || 'ffprobe';

interface ProcessResult {
  stdout: string;
  stderr: string;
}

function runProcess(
  command: string,
  args: string[],
  onStderr?: (chunk: string) => void,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => (stdout += data.toString()));
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      onStderr?.(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(command)} exited with code ${code}: ${stderr.slice(-1600)}`));
    });
  });
}

export async function ffmpegReady() {
  try {
    await access(ffmpegPath);
    await access(ffprobePath);
    return true;
  } catch {
    return false;
  }
}

export async function probeVideo(inputPath: string, filename: string, size: number): Promise<VideoMetadata> {
  const { stdout } = await runProcess(ffprobePath, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ]);
  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type: string;
      codec_name?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      r_frame_rate?: string;
    }>;
  };
  const video = data.streams?.find((stream) => stream.codec_type === 'video');
  const audio = data.streams?.find((stream) => stream.codec_type === 'audio');
  if (!video) throw new Error('No video stream was found in this file.');
  const rate = video.avg_frame_rate || video.r_frame_rate || '30/1';
  const [numerator, denominator] = rate.split('/').map(Number);
  const fps = denominator ? numerator / denominator : Number(rate) || 30;
  return {
    filename,
    storedPath: inputPath,
    size,
    duration: Number(data.format?.duration || 0),
    width: video.width || 0,
    height: video.height || 0,
    fps: Number(fps.toFixed(2)),
    codec: video.codec_name || 'unknown',
    audioCodec: audio?.codec_name,
  };
}

export async function probeAudio(inputPath: string) {
  const { stdout } = await runProcess(ffprobePath, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ]);
  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type: string }>;
  };
  if (!data.streams?.some((stream) => stream.codec_type === 'audio')) throw new Error('No playable audio stream was found in this file.');
  return Number(data.format?.duration || 0);
}

export async function createThumbnail(inputPath: string, at: number, outputPath: string) {
  await runProcess(ffmpegPath, [
    '-y',
    '-ss',
    String(Math.max(0, at)),
    '-i',
    inputPath,
    '-frames:v',
    '1',
    '-vf',
    'scale=720:-2',
    '-q:v',
    '3',
    outputPath,
  ]);
}

export async function extractAudio(inputPath: string, outputPath: string) {
  await runProcess(ffmpegPath, [
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'pcm_s16le',
    outputPath,
  ]);
}

export async function detectSilence(inputPath: string) {
  try {
    const { stderr } = await runProcess(ffmpegPath, [
      '-i',
      inputPath,
      '-af',
      'silencedetect=noise=-32dB:d=0.65',
      '-f',
      'null',
      '-',
    ]);
    const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map((match) => Number(match[1]));
    const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((match) => Number(match[1]));
    return starts.map((start, index) => ({ start, end: ends[index] ?? start + 0.65 }));
  } catch {
    return [];
  }
}

function assTime(seconds: number) {
  const totalCentis = Math.round(Math.max(0, seconds) * 100);
  const hours = Math.floor(totalCentis / 360000);
  const minutes = Math.floor((totalCentis % 360000) / 6000);
  const secs = Math.floor((totalCentis % 6000) / 100);
  const centis = totalCentis % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

function assText(text: string) {
  return text.replace(/[{}]/g, '').replace(/\n/g, ' ').trim();
}

function captionEvents(clip: Clip, transcript: TranscriptSegment[]) {
  const source = clip.captionSegments?.length ? clip.captionSegments : transcript;
  const relevant = source.filter((segment) => segment.end > clip.start && segment.start < clip.end);
  const hasTimedWords = relevant.some((segment) => segment.words?.length);
  if (clip.captions.highlight && hasTimedWords) {
    const groupSize = 5;
    return relevant.flatMap((segment) => {
      const timedWords = (segment.words || []).filter((word) => word.end > clip.start && word.start < clip.end);
      if (!timedWords.length) {
        return [{
          start: clamp(segment.start - clip.start, 0, clip.duration),
          end: clamp(segment.end - clip.start, 0, clip.duration),
          text: segment.text,
          formatted: false,
        }];
      }
      return Array.from({ length: Math.ceil(timedWords.length / groupSize) }, (_, index) => {
        const words = timedWords.slice(index * groupSize, index * groupSize + groupSize);
        const isFirstChunk = index === 0;
        const isLastChunk = (index + 1) * groupSize >= timedWords.length;
        return {
          // Keep the phrase-level cue boundary so the whole phrase appears as soon
          // as speech begins; karaoke timing then follows each individual word.
          start: clamp((isFirstChunk ? segment.start : words[0].start) - clip.start, 0, clip.duration),
          end: clamp((isLastChunk ? segment.end : words.at(-1)!.end) - clip.start, 0, clip.duration),
          text: words.map((word) => `{\\kf${Math.max(1, Math.round((word.end - word.start) * 100))}}${word.word.trim()}`).join(' '),
          formatted: true,
        };
      });
    });
  }
  if (relevant.length) {
    return relevant.map((segment) => ({
      start: clamp(segment.start - clip.start, 0, clip.duration),
      end: clamp(segment.end - clip.start, 0, clip.duration),
      text: segment.text,
    }));
  }
  if (!clip.transcript.trim()) return [];
  const words = clip.transcript.trim().split(/\s+/);
  const groupSize = 5;
  const groups = Array.from({ length: Math.ceil(words.length / groupSize) }, (_, index) =>
    words.slice(index * groupSize, index * groupSize + groupSize).join(' '),
  );
  return groups.map((text, index) => ({
    start: (index / groups.length) * clip.duration,
    end: ((index + 1) / groups.length) * clip.duration,
    text,
  }));
}

async function writeCaptionFile(clip: Clip, transcript: TranscriptSegment[], outputPath: string) {
  const fontSize = clip.captions.fontSize;
  const marginV = clip.captions.position === 'top' ? 1450 : clip.captions.position === 'middle' ? 840 : 190;
  const alignment = clip.captions.position === 'top' ? 8 : clip.captions.position === 'middle' ? 5 : 2;
  const primary = clip.captions.preset === 'minimal' ? '&H00FFFFFF' : '&H00F5FFFF';
  const outline = clip.captions.preset === 'minimal' ? 1 : 5;
  const events = captionEvents(clip, transcript);
  const lines = events.map((event) => {
    const text = clip.captions.uppercase ? event.text.toUpperCase() : event.text;
    const renderedText = 'formatted' in event && event.formatted ? text.replace(/\n/g, ' ') : assText(text);
    return `Dialogue: 0,${assTime(event.start)},${assTime(event.end)},Default,,0,0,0,,${renderedText}`;
  });
  if (clip.hookOverlay && clip.hook) {
    lines.unshift(`Dialogue: 1,0:00:00.00,0:00:03.50,Hook,,0,0,0,,${assText(clip.hook.toUpperCase())}`);
  }
  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},${primary},&H0000E9FF,&H00101010,&H70000000,-1,0,0,0,100,100,0,0,1,${outline},2,${alignment},70,70,${marginV},1
Style: Hook,Arial,58,&H00FFFFFF,&H0000E9FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,8,80,80,130,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.join('\n')}
`;
  await writeFile(outputPath, ass, 'utf8');
  return lines.length > 0;
}

function videoFilter(clip: Clip) {
  const targets: Record<Clip['aspectRatio'], { width: number; height: number }> = {
    '9:16': { width: 1080, height: 1920 },
    '16:9': { width: 1920, height: 1080 },
    '1:1': { width: 1080, height: 1080 },
    '4:5': { width: 1080, height: 1350 },
  };
  const styleFilters: Record<Clip['style'], string> = {
    clean: 'eq=contrast=1.02:saturation=1.02',
    viral: 'eq=contrast=1.08:saturation=1.12',
    cinematic: 'eq=contrast=1.06:saturation=.9:brightness=-.015',
    meme: 'eq=contrast=1.12:saturation=1.2',
    podcast: 'eq=contrast=1.04:saturation=1.05',
    gaming: 'eq=contrast=1.1:saturation=1.18',
  };
  const { width, height } = targets[clip.aspectRatio];
  const focusExpression = (axis: 'x' | 'y') => {
    const points = (clip.focusTrack || [])
      .filter((point) => Number.isFinite(point.time) && Number.isFinite(point[axis]))
      .slice(0, 60)
      .map((point) => ({ time: Math.max(0, point.time - clip.start), value: clamp(point[axis], 0.05, 0.95) }));
    if (!points.length || clip.framing === 'centre') return '0.5';
    let expression = points.at(-1)!.value.toFixed(4);
    for (let index = points.length - 2; index >= 0; index -= 1) {
      const current = points[index];
      const next = points[index + 1];
      const span = Math.max(0.01, next.time - current.time);
      const interpolated = `${current.value.toFixed(4)}+(${(next.value - current.value).toFixed(4)})*(t-${current.time.toFixed(3)})/${span.toFixed(3)}`;
      expression = `if(lt(t\,${next.time.toFixed(3)})\,${interpolated}\,${expression})`;
    }
    return expression;
  };
  const framing = clip.framing === 'original'
    ? `setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x08080a`
    : `setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}:x='max(0\,min(iw-ow\,(${focusExpression('x')})*iw-ow/2))':y='max(0\,min(ih-oh\,(${focusExpression('y')})*ih-oh/2))'`;
  return `${framing},${styleFilters[clip.style]}`;
}

export async function analyseActionFocus(inputPath: string, start: number, end: number) {
  const width = 160;
  const height = 90;
  const fps = 2;
  const duration = clamp(end - start, 1, 180);
  const frameSize = width * height;
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-ss', String(Math.max(0, start)), '-t', String(duration),
      '-i', inputPath, '-vf', `fps=${fps},scale=${width}:${height}:flags=fast_bilinear,format=gray`,
      '-an', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1',
    ], { windowsHide: true });
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-1600); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Action tracking failed: ${stderr || `FFmpeg exited with code ${code}`}`)));
  });
  const frames = Buffer.concat(chunks);
  const count = Math.floor(frames.length / frameSize);
  if (count < 2) return [{ time: start, x: 0.5, y: 0.5 }];
  let smoothX = 0.5;
  let smoothY = 0.5;
  const dense: Array<{ time: number; x: number; y: number }> = [];
  for (let frame = 1; frame < count; frame += 1) {
    const previousOffset = (frame - 1) * frameSize;
    const currentOffset = frame * frameSize;
    let total = 0;
    let weightedX = 0;
    let weightedY = 0;
    for (let y = 2; y < height - 2; y += 2) {
      for (let x = 2; x < width - 2; x += 2) {
        const index = y * width + x;
        const difference = Math.abs(frames[currentOffset + index] - frames[previousOffset + index]);
        if (difference < 12) continue;
        const centrePrior = 1 - Math.min(0.35, Math.abs(x / width - 0.5) * 0.25);
        const weight = (difference - 11) ** 1.6 * centrePrior;
        total += weight;
        weightedX += (x / width) * weight;
        weightedY += (y / height) * weight;
      }
    }
    const rawX = total > 180 ? weightedX / total : smoothX;
    const rawY = total > 180 ? weightedY / total : smoothY;
    smoothX = clamp(smoothX * 0.82 + rawX * 0.18, 0.08, 0.92);
    smoothY = clamp(smoothY * 0.86 + rawY * 0.14, 0.08, 0.92);
    dense.push({ time: start + frame / fps, x: smoothX, y: smoothY });
  }
  const sampleEvery = Math.max(1, Math.round(fps * 2));
  const sampled = dense.filter((_, index) => index % sampleEvery === 0 || index === dense.length - 1);
  return sampled.map((point) => ({ time: Number(point.time.toFixed(2)), x: Number(point.x.toFixed(4)), y: Number(point.y.toFixed(4)) }));
}

export async function renderClip(
  sourcePath: string,
  clip: Clip,
  transcript: TranscriptSegment[],
  musicPath: string | undefined,
  outputPath: string,
  onProgress: (progress: number) => void,
) {
  const normalizedAudio = 'aformat=channel_layouts=stereo,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo';
  const subtitlePath = outputPath.replace(/\.mp4$/i, '.ass');
  const hasCaptions = clip.captions.enabled && (await writeCaptionFile(clip, transcript, subtitlePath));
  const escapedSubtitlePath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  const filters = [videoFilter(clip)];
  if (hasCaptions) filters.push(`ass='${escapedSubtitlePath}'`);
  const excluded = clip.excludedRanges
    .map((range) => ({ start: clamp(range.start - clip.start, 0, clip.duration), end: clamp(range.end - clip.start, 0, clip.duration) }))
    .filter((range) => range.end - range.start > 0.05)
    .sort((a, b) => a.start - b.start);
  const kept: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const range of excluded) {
    if (range.start > cursor) kept.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < clip.duration) kept.push({ start: cursor, end: clip.duration });
  const useCuts = excluded.length > 0 && kept.length > 0;
  const outputDuration = useCuts ? kept.reduce((total, range) => total + range.end - range.start, 0) : clip.duration;
  const useMusic = Boolean(musicPath && clip.music?.enabled);
  const args = [
    '-y',
    '-ss',
    String(clip.start),
    '-i',
    sourcePath,
  ];
  if (useMusic && musicPath) args.push('-stream_loop', '-1', '-i', musicPath);
  args.push(
    '-t',
    String(outputDuration),
  );
  if (useCuts || useMusic) {
    const complex: string[] = [];
    let voiceLabel = 'voice';
    let videoLabel = 'sourcev';
    if (useCuts) {
    const trims = kept.flatMap((range, index) => [
      `[0:v]trim=start=${range.start}:end=${range.end},setpts=PTS-STARTPTS[v${index}]`,
      `[0:a]atrim=start=${range.start}:end=${range.end},asetpts=PTS-STARTPTS[a${index}]`,
    ]);
    const inputs = kept.map((_, index) => `[v${index}][a${index}]`).join('');
      complex.push(...trims, `${inputs}concat=n=${kept.length}:v=1:a=1[vcut][acut]`);
      videoLabel = 'vcut';
      voiceLabel = 'acut';
    } else {
      complex.push('[0:v]setpts=PTS-STARTPTS[sourcev]', '[0:a]asetpts=PTS-STARTPTS[voice]');
    }
    complex.push(`[${videoLabel}]${filters.join(',')}[vout]`);
    if (useMusic) {
      const fadeIn = clamp(clip.music.fadeIn, 0, outputDuration / 2);
      const fadeOut = clamp(clip.music.fadeOut, 0, outputDuration / 2);
      const fadeStart = Math.max(0, outputDuration - fadeOut);
      const speechWindows = (clip.captionSegments?.length ? clip.captionSegments : transcript)
        .filter((segment) => segment.end > clip.start && segment.start < clip.end)
        .slice(0, 100)
        .map((segment) => ({
          start: clamp(segment.start - clip.start, 0, outputDuration),
          end: clamp(segment.end - clip.start, 0, outputDuration),
        }));
      const duckingFilters = !clip.music.ducking
        ? ''
        : speechWindows.length
          ? speechWindows.map((window) => `,volume=0.42:enable='between(t\\,${window.start}\\,${window.end})'`).join('')
          : ',volume=0.42';
      complex.push(`[1:a]atrim=start=0:end=${outputDuration},asetpts=PTS-STARTPTS,aformat=channel_layouts=stereo,volume=${clamp(clip.music.volume, 0, 1)}${duckingFilters},afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fadeStart}:d=${fadeOut},apad=whole_dur=${outputDuration}[musicbed]`);
      complex.push(`[${voiceLabel}]aformat=channel_layouts=stereo[stereovoice];[stereovoice][musicbed]amix=inputs=2:duration=first:normalize=0,${normalizedAudio}[aout]`);
    } else {
      complex.push(`[${voiceLabel}]${normalizedAudio}[aout]`);
    }
    args.push('-filter_complex', complex.join(';'), '-map', '[vout]', '-map', '[aout]');
  } else {
    args.push('-vf', filters.join(','), '-af', normalizedAudio);
  }
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-pix_fmt',
    'yuv420p',
    outputPath,
  );
  let buffer = '';
  await runProcess(ffmpegPath, args, (chunk) => {
    buffer = (buffer + chunk).slice(-2400);
    const matches = [...buffer.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
    const latest = matches.at(-1);
    if (!latest) return;
    const elapsed = Number(latest[1]) * 3600 + Number(latest[2]) * 60 + Number(latest[3]);
    onProgress(clamp(Math.round((elapsed / outputDuration) * 100), 1, 99));
  });
  onProgress(100);
}
