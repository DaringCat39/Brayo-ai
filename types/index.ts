export type ProjectStatus =
  | 'uploaded'
  | 'queued'
  | 'analysing'
  | 'ready'
  | 'rendering'
  | 'complete'
  | 'failed';

export type ClipStatus = 'suggested' | 'queued' | 'rendering' | 'complete' | 'failed';
export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5';
export type FramingMode = 'auto' | 'face' | 'centre' | 'split' | 'original';
export type EditStyle = 'clean' | 'viral' | 'cinematic' | 'meme' | 'podcast' | 'gaming';
export type ClipCategory = 'Funny' | 'Emotional' | 'Informative' | 'Controversial' | 'Story' | 'Quote' | 'High energy';

export type UploadStorageProvider = 'local' | 'backblaze-b2';

export interface UploadCapabilities {
  provider: UploadStorageProvider;
  direct: boolean;
  multipart: boolean;
  localFallback: boolean;
}

export interface MultipartUploadSession {
  projectId: string;
  sessionToken: string;
  key: string;
  partSize: number;
  partCount: number;
}

export interface PresignedUploadPart {
  partNumber: number;
  url: string;
  method: 'PUT';
  expiresAt: number;
}

export interface CompletedVideoUpload {
  provider: Exclude<UploadStorageProvider, 'local'>;
  projectId: string;
  key: string;
  bucket: string;
  contentType: string;
  size: number;
  etag: string;
  versionId?: string;
  sessionToken: string;
}

export interface StoredMediaArtifact {
  provider: 'backblaze-b2';
  key: string;
  contentType: string;
  downloadFilename?: string;
  size: number;
  etag: string;
  versionId?: string;
}

export interface VideoMetadata {
  filename: string;
  storedPath: string;
  storageProvider?: UploadStorageProvider;
  storageKey?: string;
  storageVersionId?: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  audioCodec?: string;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: TranscriptWord[];
}

export interface ClipScores {
  viral: number;
  hook: number;
  retention: number;
  emotion: number;
  shareability: number;
  novelty: number;
  clarity: number;
  visual: number;
}

export interface CaptionSettings {
  preset: 'minimal' | 'bold' | 'hormozi' | 'karaoke' | 'clean' | 'gaming' | 'documentary' | 'cinematic';
  enabled: boolean;
  uppercase: boolean;
  fontSize: number;
  position: 'top' | 'middle' | 'bottom';
  highlight: boolean;
}

export interface MusicTrack {
  id: string;
  name: string;
  filename: string;
  storedPath: string;
  url: string;
  storage?: StoredMediaArtifact;
  duration?: number;
}

export interface MusicSettings {
  enabled: boolean;
  trackId?: string;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  ducking: boolean;
}

export type PublishingProvider = 'youtube' | 'tiktok';
export type YouTubePrivacy = 'public' | 'unlisted' | 'private';
export type TikTokPrivacy = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';

export interface AutoPublishSettings {
  youtube: boolean;
  tiktok: boolean;
  youtubePrivacy: YouTubePrivacy;
  tiktokPrivacy: TikTokPrivacy;
}

export interface PublicationResult {
  status: 'publishing' | 'published' | 'failed';
  id?: string;
  url?: string;
  error?: string;
  updatedAt: string;
}

export interface IntegrationStatus {
  provider: PublishingProvider;
  configured: boolean;
  connected: boolean;
  autoPublish: boolean;
  label?: string;
}

export interface Clip {
  id: string;
  title: string;
  hook: string;
  alternativeHook: string;
  socialCaption: string;
  youtubeTitle: string;
  hashtags: string[];
  reason: string;
  category: ClipCategory;
  start: number;
  end: number;
  duration: number;
  transcript: string;
  captionSegments?: TranscriptSegment[];
  scores: ClipScores;
  thumbnailUrl?: string;
  status: ClipStatus;
  renderProgress: number;
  outputUrl?: string;
  outputPath?: string;
  aspectRatio: AspectRatio;
  framing: FramingMode;
  focusTrack?: Array<{ time: number; x: number; y: number }>;
  style: EditStyle;
  captions: CaptionSettings;
  music: MusicSettings;
  autoPublish?: AutoPublishSettings;
  publications?: Partial<Record<PublishingProvider, PublicationResult>>;
  hookOverlay: boolean;
  splitPoints: number[];
  excludedRanges: Array<{ start: number; end: number }>;
}

export interface JobState {
  id: string;
  type: 'analysis' | 'render';
  status: ProjectStatus;
  stage: string;
  progress: number;
  detail: string;
  updatedAt: string;
  error?: string;
}

export type ProcessingTimingStage =
  | 'objectMaterialization'
  | 'audioExtraction'
  | 'transcription'
  | 'sceneAnalysis'
  | 'viralAnalysis'
  | 'clipSelection'
  | 'rendering';

export interface ProcessingTiming {
  durationMs: number;
  updatedAt: string;
  detail?: string;
}

export interface AudioChunkReference {
  index: number;
  filename: string;
  start: number;
  end: number;
  overlap: number;
}

export type AnalysisCheckpoint =
  | 'video-prepared'
  | 'audio-prepared'
  | 'transcript-complete'
  | 'scenes-complete'
  | 'clips-selected'
  | 'previews-complete';

export interface ProjectAnalysisState {
  version: 2;
  workflowRunId?: string;
  sourceFingerprint: string;
  completedStages: AnalysisCheckpoint[];
  audioChunks?: AudioChunkReference[];
  silences?: Array<{ start: number; end: number }>;
  sceneTimestamps?: number[];
  timings?: Partial<Record<ProcessingTimingStage, ProcessingTiming>>;
  fullVideoFfmpegPasses: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;
  sourceUrl: string;
  video?: VideoMetadata;
  clips: Clip[];
  transcript: TranscriptSegment[];
  musicTracks?: MusicTrack[];
  media?: Record<string, StoredMediaArtifact>;
  transcriptionMode: 'pending' | 'local-whisper' | 'built-in-whisper' | 'openai' | 'signal-only';
  preferredDuration: 75 | 90 | 120 | 180;
  defaultCaptionPreset?: CaptionSettings['preset'];
  storageReady?: boolean;
  analysis?: ProjectAnalysisState;
  job: JobState;
  thumbnailUrl?: string;
  error?: string;
}

export interface PublicSettings {
  aiConfigured: boolean;
  aiBaseUrl: string;
  aiModel: string;
  whisperConfigured: boolean;
  builtInWhisperModel: string;
  ffmpegReady: boolean;
  storagePath: string;
  integrations: IntegrationStatus[];
}
