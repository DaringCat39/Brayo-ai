# ViralCut AI

A local-first short-form video editor built with Next.js, TypeScript, Tailwind CSS, SQLite, FFmpeg, built-in local Whisper and optional OpenAI-compatible analysis.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Uploaded sources, thumbnails, transcripts, project metadata and exports are stored under `.data/`, which is ignored by Git.

## What works without an AI key

- Streamed MP4, MOV, MKV, WebM and M4V uploads
- FFprobe metadata extraction
- Local thumbnail and speech-audio extraction
- Built-in local Whisper transcription with word timestamps and phrase-synchronised captions
- Silence detection and heuristic clip ranking
- Guided upload → duration/style → generation workflow with 75, 90, 120 and 180-second targets
- A 61-second minimum for generated clips and exports whenever the source is long enough
- Persistent SQLite projects and background job progress
- Score/category filtering and batch export queues
- 9:16, 16:9, 1:1 and 4:5 FFmpeg rendering
- Real timeline trim/split/remove operations
- Caption and opening-hook burn-in
- User-uploaded background music with volume, fades and automatic speech ducking
- H.264/AAC MP4 output, loudness normalization and local downloads

## Local transcription and optional semantic analysis

Copy `.env.example` to `.env.local` and configure only the providers you want.

ViralCut downloads its built-in local Whisper model once on the first analysed video, caches it under `.data/models/`, and performs later transcription on this device. You can choose a different compatible model with:

```bash
LOCAL_WHISPER_MODEL=Xenova/whisper-tiny.en
```

You can alternatively prioritize an existing Whisper CLI:

```bash
WHISPER_COMMAND=/path/to/whisper
WHISPER_MODEL=base
```

For an OpenAI-compatible endpoint, set:

```bash
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
```

The OpenAI-compatible provider remains optional. Caption cue text can be corrected in the editor without changing its original speech timing.

For the fastest Vercel transcription path, explicitly opt in to sending bounded five-minute audio chunks to the configured provider:

```bash
BRAYO_TRANSCRIPTION_PROVIDER=openai
BRAYO_TRANSCRIPTION_CONCURRENCY=4
```

Without that opt-in, local Whisper remains first and long videos are still split across concurrent, retryable workers.

## Vercel production processing

Production uses the Node.js runtime, direct private Blob uploads, and Vercel Workflow. The upload request returns a project ID immediately; durable steps then prepare the source, transcribe overlapping chunks, analyse scenes, select clips, generate previews, and render selected clips. Project metadata, audio chunks, transcript checkpoints, scene results, thumbnails, and renders are persisted in private Blob storage, while FFmpeg scratch files use `/tmp` only.

Enable Fluid Compute for the Vercel project. Hobby steps are designed to stay below the 300-second maximum: a 40-minute source is planned as nine overlapping audio chunks of at most five minutes each, processed with bounded concurrency. The build creates the consolidated public API Function plus Workflow's three private handlers, for four dynamic Functions in total.

## Privacy

Footage remains on this device by default. If an external AI provider is configured, extracted speech audio and timestamped transcript content may be sent to that configured endpoint for transcription or semantic analysis.

Only use footage and music you own or have permission to edit. Add properly licensed tracks to `public/music/` and effects to `public/sfx/`.

## Verification

```bash
npm run typecheck
npm run build
npm audit --omit=dev
```
