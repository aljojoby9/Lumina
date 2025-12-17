import React, { useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react';
import { VideoState } from '../types';
import { AlertTriangle, FileVideo, RefreshCw, Image as ImageIcon } from 'lucide-react';

interface VideoPlayerProps {
  src: string | null;
  type?: 'video' | 'image';
  videoState: VideoState;
  
  // New props for multi-clip handling
  timelineTime: number; // Global time
  clipStart: number; // When this clip starts on the timeline
  clipOffset: number; // How far into the source file to start
  
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onEnded: () => void;
}

export interface VideoPlayerRef {
  getSnapshot: () => string | null;
}

const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(({ 
  src, 
  type = 'video', // Default to video
  videoState, 
  timelineTime,
  clipStart,
  clipOffset,
  onTimeUpdate, 
  onDurationChange, 
  onEnded 
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [hasError, setHasError] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string>('');

  // Reset error when src changes
  useEffect(() => {
      setHasError(false);
      setErrorDetails('');
  }, [src]);

  // Expose method to capture frame for AI analysis and thumbnails
  useImperativeHandle(ref, () => ({
    getSnapshot: () => {
      const MAX_WIDTH = 640; // Limit width to prevent massive database payloads

      // Handle Video Snapshot
      if (type === 'video' && videoRef.current) {
          try {
            const video = videoRef.current;
            const originalWidth = video.videoWidth || 640;
            const originalHeight = video.videoHeight || 360;
            
            // Calculate aspect ratio preserving dimensions
            const scale = Math.min(1, MAX_WIDTH / originalWidth);
            const width = originalWidth * scale;
            const height = originalHeight * scale;

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            if (ctx) {
              // Apply filters if needed for WYSIWYG snapshot, currently raw video
              ctx.drawImage(video, 0, 0, width, height);
              return canvas.toDataURL('image/jpeg', 0.7);
            }
          } catch (e) {
              console.error("Failed to capture snapshot:", e);
          }
      } 
      // Handle Image Snapshot
      else if (type === 'image' && imgRef.current) {
          try {
            const img = imgRef.current;
            const originalWidth = img.naturalWidth || 640;
            const originalHeight = img.naturalHeight || 360;

            const scale = Math.min(1, MAX_WIDTH / originalWidth);
            const width = originalWidth * scale;
            const height = originalHeight * scale;

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              return canvas.toDataURL('image/jpeg', 0.7);
            }
          } catch (e) {
               console.error("Failed to capture image snapshot:", e);
          }
      }
      return null;
    }
  }));

  // Sync Logic: Ensure video player matches global timeline
  useEffect(() => {
    if (type !== 'video' || !videoRef.current || !src || hasError) return;

    // Calculate where the video SHOULD be based on timeline
    const targetTime = (timelineTime - clipStart) + clipOffset;
    
    // Safety: Ensure readyState is at least HAVE_METADATA (1) before seeking
    if (videoRef.current.readyState >= 1) {
        if (Math.abs(videoRef.current.currentTime - targetTime) > 0.25) {
            if (targetTime >= 0) {
                videoRef.current.currentTime = targetTime;
            }
        }
    }
  }, [timelineTime, clipStart, clipOffset, src, hasError, type]);

  // Handle Play/Pause (Video Only)
  useEffect(() => {
    if (type !== 'video' || !videoRef.current || hasError) return;

    if (videoState.isPlaying) {
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => {
                console.debug("Playback interrupted:", e);
            });
        }
    } else {
        videoRef.current.pause();
    }
  }, [videoState.isPlaying, src, hasError, type]);

  // Handle Playback Rate
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = videoState.playbackRate;
    }
  }, [videoState.playbackRate]);

  // Handle Volume
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = videoState.volume;
    }
  }, [videoState.volume]);

  // Construct Filter String
  const getFilterString = () => {
    let filters = [];
    
    // Standard Presets
    const presets = ['grayscale', 'sepia', 'vintage', 'cyberpunk', 'warm', 'none'];
    
    if (presets.includes(videoState.filter)) {
      switch (videoState.filter) {
        case 'grayscale': filters.push('grayscale(100%)'); break;
        case 'sepia': filters.push('sepia(100%)'); break;
        case 'vintage': filters.push('sepia(50%) contrast(120%) brightness(90%)'); break;
        case 'cyberpunk': filters.push('hue-rotate(180deg) saturate(200%) contrast(110%)'); break;
        case 'warm': filters.push('sepia(30%) saturate(140%) hue-rotate(-10deg)'); break;
        default: break;
      }
    } else {
      // Custom AI Filter
      filters.push(videoState.filter);
    }
    
    // Global Adjustments
    filters.push(`brightness(${videoState.brightness}%)`);
    filters.push(`contrast(${videoState.contrast}%)`);
    filters.push(`saturate(${videoState.saturation}%)`);
    
    return filters.join(' ');
  };

  // Calculate Opacity for Transitions
  const getOpacity = () => {
      const { fadeIn, fadeOut, duration, currentTime } = videoState;
      let opacity = 1;

      // Fade In
      if (fadeIn > 0 && currentTime < fadeIn) {
          opacity = currentTime / fadeIn;
      }

      // Fade Out
      if (fadeOut > 0 && duration > 0 && currentTime > (duration - fadeOut)) {
          opacity = (duration - currentTime) / fadeOut;
      }

      return Math.max(0, Math.min(1, opacity));
  };

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement | HTMLImageElement, Event>) => {
      const el = e.target as HTMLVideoElement; 
      if (src) {
         console.warn("Media error for:", src);
         setHasError(true);
         if (el.error) {
             setErrorDetails(`Error Code: ${el.error.code} - ${el.error.message}`);
         } else {
             setErrorDetails("Failed to load image/video resource");
         }
      }
  };

  const handleRetry = () => {
      setHasError(false);
      setErrorDetails('');
      if (videoRef.current) {
          videoRef.current.load();
      }
  };

  if (!src) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black/50 border-2 border-dashed border-gray-700 rounded-lg text-gray-400">
        <FileVideo size={32} className="mb-2 opacity-50" />
        <p className="mb-1 text-lg font-medium">No Media Selected</p>
        <p className="text-sm opacity-70">Source invalid or missing</p>
      </div>
    );
  }

  if (hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 border border-red-900/50 rounded-lg text-red-400">
            <AlertTriangle size={32} className="mb-2" />
            <p className="mb-1 text-lg font-medium">Playback Error</p>
            <p className="text-sm opacity-70">Could not load media file.</p>
            <p className="text-xs mt-1 opacity-50">{errorDetails}</p>
            <button 
                onClick={handleRetry}
                className="mt-4 flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-md text-xs text-gray-300 transition-colors"
            >
                <RefreshCw size={12} /> Retry
            </button>
        </div>
      );
  }

  const commonStyles = {
    filter: getFilterString(),
    opacity: getOpacity()
  };

  // RENDER IMAGE
  if (type === 'image') {
      return (
        <div className="relative w-full h-full bg-black overflow-hidden rounded-lg shadow-2xl flex items-center justify-center">
            <img 
                ref={imgRef}
                src={src}
                alt="Clip Preview"
                className="w-full h-full object-contain transition-all duration-300"
                style={commonStyles}
                onError={handleError}
            />
        </div>
      );
  }

  // RENDER VIDEO
  return (
    <div className="relative w-full h-full bg-black overflow-hidden rounded-lg shadow-2xl">
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain transition-all duration-300"
        style={commonStyles}
        onEnded={onEnded}
        onError={handleError}
        playsInline
        preload="auto"
        // Setup initial seek when metadata is loaded
        onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            const targetTime = (timelineTime - clipStart) + clipOffset;
            if (Math.abs(el.currentTime - targetTime) > 0.1) {
                 el.currentTime = Math.max(0, targetTime);
            }
        }}
      />
    </div>
  );
});

export default VideoPlayer;