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

## Vercel production processing with Backblaze B2

Production uses the Node.js runtime, direct private Backblaze B2 multipart uploads, and Vercel Workflow. The browser uploads four parts concurrently with individual retries, then sends only the verified object key and metadata to Brayo. Durable steps prepare the source, transcribe overlapping chunks, analyse scenes, select clips, generate previews, and render selected clips. Project metadata, audio chunks, transcript checkpoints, scene results, thumbnails, music, and renders persist in the private B2 bucket, while FFmpeg scratch files use `/tmp` only.

Set `B2_ENDPOINT`, `B2_REGION`, `B2_BUCKET_NAME`, `B2_APPLICATION_KEY_ID`, and `B2_APPLICATION_KEY` in Vercel. Keep the bucket private. With `APP_URL` set to the production HTTPS origin, apply the required browser-upload CORS policy once:

```bash
npm run storage:cors
```

`PutBucketCors` needs an unrestricted one-time Backblaze application key with `writeBuckets`; run this command locally with that temporary key and never add it to Vercel. Then use a bucket-restricted runtime key with `listAllBucketNames`, `listFiles`, `readFiles`, `writeFiles`, and `deleteFiles` in Vercel. The applied rule permits `GET`, `HEAD`, and `PUT` only from `APP_URL`, `http://localhost:3000`, and `http://localhost:3111`, allows request headers needed by presigned and ranged requests, and exposes `ETag` so multipart completion can be verified. You can instead pass one or more production origins explicitly: `npm run storage:cors -- https://brayo.example.com`.

Brayo retains one project. After a new upload is verified and its metadata is saved, all previous project sources, clips, intermediates, metadata versions, delete markers, and unfinished multipart uploads are permanently removed from B2. The current project prefix is always excluded from that cleanup.

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
