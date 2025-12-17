
export interface VideoState {
  isPlaying: boolean;
  currentTime: number;
  duration: number; // Global timeline duration
  volume: number;
  playbackRate: number;
  filter: string; // Preset ID OR raw CSS string
  brightness: number;
  contrast: number;
  saturation: number;
  fadeIn: number; // Duration in seconds
  fadeOut: number; // Duration in seconds
}

export type FilterType = 'none' | 'grayscale' | 'sepia' | 'vintage' | 'cyberpunk' | 'warm';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isProcessing?: boolean;
}

export interface AIEngineResponse {
  action: 'set_speed' | 'set_volume' | 'apply_filter' | 'set_custom_filter' | 'set_transition' | 'trim' | 'analyze_mood' | 'unknown';
  parameters?: {
    value?: number | string;
    description?: string;
  };
  reply: string;
}

export interface TimelineClip {
  id: string;
  type: 'video' | 'image';
  src: string; // Blob URL
  name: string;
  
  // Timeline positioning
  start: number; // Global start time on timeline
  duration: number; // How long it plays on timeline
  
  // Trimming (Video only)
  offset: number; // How many seconds into the source file to start playing
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  lastModified: number;
  videoState: VideoState;
  clips: TimelineClip[];
  messages: ChatMessage[];
  videoName?: string;
  thumbnail?: string; // Base64 data URL
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
}