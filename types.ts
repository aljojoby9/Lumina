
export type FilterType = 'none' | 'grayscale' | 'sepia' | 'vintage' | 'cyberpunk' | 'warm' | 'invert' | 'blur' | 'dramatic' | 'noir' | 'technicolor';
export type TransitionType = 'none' | 'fade' | 'slide-left' | 'slide-right' | 'zoom-in' | 'zoom-out' | 'blur-dissolve';

export interface Subtitle {
  id: string;
  text: string;
  start: number;
  duration: number;
}

export interface VideoState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  filter: string;
  brightness: number;
  contrast: number;
  saturation: number;
  fadeIn: number;
  fadeOut: number;
  isAudioEnhanced: boolean;
  focusArea?: { x: number, y: number, scale: number };
}

export interface AIAction {
  action: 'set_speed' | 'set_volume' | 'apply_filter' | 'set_custom_filter' | 'set_transition' | 'trim_clip' | 'remove_clip' | 'split_clip' | 'seek_to' | 'add_subtitles' | 'enhance_audio' | 'focus_object' | 'keep_only_highlights' | 'unknown';
  parameters?: {
    value?: number | string;
    timestamp?: number;
    description?: string;
    subtitles?: { text: string, start: number, duration: number }[];
    targetClipId?: string;
    startOffset?: number;
    endOffset?: number;
    ranges?: { start: number, end: number }[];
    transition?: string;
    filter?: string;
  };
}

export interface AIEngineResponse {
  actions: AIAction[];
  reply: string;
}

export interface TimelineClip {
  id: string;
  type: 'video' | 'image';
  src: string;
  name: string;
  start: number;
  duration: number;
  offset: number;
  filter?: FilterType;
  transitionIn?: TransitionType;
  transitionInDuration?: number;
  transitionOut?: TransitionType;
  transitionOutDuration?: number;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  lastModified: number;
  videoState: VideoState;
  clips: TimelineClip[];
  subtitles: Subtitle[];
  messages: ChatMessage[];
  videoName?: string;
  thumbnail?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isProcessing?: boolean;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
}

// Best Moments Feature Types
export interface MomentAnalysis {
  timestamp: number;
  interestScore: number;  // 1-10
  reason: string;         // Why this moment is interesting
  suggestedDuration: number; // How long this moment should be in the highlight
}

export interface BestMomentsConfig {
  targetDuration: number;   // e.g., 30 seconds
  samplingInterval: number; // e.g., 30 seconds between samples
  minClipLength: number;    // e.g., 2 seconds minimum per clip
  maxClipLength: number;    // e.g., 6 seconds maximum per clip
}

export interface FrameData {
  timestamp: number;
  imageBase64: string;
}

export interface BestMomentsResult {
  moments: MomentAnalysis[];
  actions: AIAction[];
  summary: string;
}
