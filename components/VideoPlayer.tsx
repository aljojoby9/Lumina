
import React, { useRef, useEffect, forwardRef, useImperativeHandle, useState, useMemo } from 'react';
import { VideoState, Subtitle, TransitionType, FilterType } from '../types';
import { AlertTriangle, Play, Pause, RefreshCcw } from 'lucide-react';

interface VideoPlayerProps {
  src: string | null;
  type?: 'video' | 'image';
  videoState: VideoState;
  subtitles: Subtitle[];
  timelineTime: number;
  clipStart: number;
  clipDuration: number;
  clipOffset: number;
  clipFilter?: FilterType;
  transitionIn?: TransitionType;
  transitionOut?: TransitionType;
  onTogglePlay: () => void;
  onEnded: () => void;
}

export interface VideoPlayerRef {
  getSnapshot: () => string | null;
  getStream: () => MediaStream | null;
}

const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(({
  src,
  type = 'video',
  videoState,
  subtitles,
  timelineTime,
  clipStart,
  clipDuration,
  clipOffset,
  clipFilter,
  transitionIn,
  transitionOut,
  onTogglePlay,
  onEnded
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [hasError, setHasError] = useState(false);
  const [showControls, setShowControls] = useState(false);

  const TRANSITION_DURATION = 0.5; // Standard transition time

  useEffect(() => {
    if (type === 'video' && videoRef.current && videoState.isAudioEnhanced) {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioCtxRef.current.createMediaElementSource(videoRef.current);
        const filter = audioCtxRef.current.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 150;
        const compressor = audioCtxRef.current.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, audioCtxRef.current.currentTime);
        source.connect(filter).connect(compressor).connect(audioCtxRef.current.destination);
      }
    }
  }, [videoState.isAudioEnhanced, type]);

  // Reset error state when source changes
  useEffect(() => {
    setHasError(false);
  }, [src]);

  useImperativeHandle(ref, () => ({
    getSnapshot: () => {
      if (type === 'video' && videoRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth || 1280;
        canvas.height = videoRef.current.videoHeight || 720;
        canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.8);
      }
      return null;
    },
    getStream: () => {
      if (videoRef.current) {
        // Note: captureStream is available on Video and Canvas elements
        return (videoRef.current as any).captureStream ? (videoRef.current as any).captureStream() : null;
      }
      return null;
    }
  }));

  // Synchronize video time with timeline
  useEffect(() => {
    if (type !== 'video' || !videoRef.current || !src || hasError) return;
    const targetTime = (timelineTime - clipStart) + clipOffset;

    // Check if the target time is within the video's seekable range and duration
    // and if the difference is significant enough to require a seek
    const diff = Math.abs(videoRef.current.currentTime - targetTime);
    if (diff > 0.05 && diff < 1000) { // Avoid extreme jumps or tiny adjustments
      try {
        videoRef.current.currentTime = Math.max(0, targetTime);
      } catch (e) {
        console.warn("Seek failed:", e);
      }
    }
  }, [timelineTime, clipStart, clipOffset, src, hasError, type]);

  // Handle Playback State
  useEffect(() => {
    if (type !== 'video' || !videoRef.current || hasError) return;

    videoRef.current.volume = videoState.volume;
    videoRef.current.playbackRate = videoState.playbackRate;

    const handlePlay = () => {
      if (videoState.isPlaying) {
        videoRef.current?.play().catch(() => { });
      } else {
        videoRef.current?.pause();
      }
    };

    if (videoRef.current.readyState >= 3) {
      handlePlay();
    } else {
      videoRef.current.addEventListener('canplay', handlePlay, { once: true });
    }

    return () => {
      videoRef.current?.removeEventListener('canplay', handlePlay);
    };
  }, [videoState.isPlaying, videoState.volume, videoState.playbackRate, src, hasError, type]);

  const activeSubtitle = subtitles.find(s =>
    timelineTime >= s.start && timelineTime < (s.start + s.duration)
  );

  // Filters and Transitions
  const filterStyle = useMemo(() => {
    const filters = [
      `brightness(${videoState.brightness}%)`,
      `contrast(${videoState.contrast}%)`,
      `saturate(${videoState.saturation}%)`
    ];

    const activeFilter = clipFilter || videoState.filter;

    switch (activeFilter) {
      case 'grayscale': filters.push('grayscale(100%)'); break;
      case 'sepia': filters.push('sepia(100%)'); break;
      case 'vintage': filters.push('sepia(40%) contrast(110%) brightness(95%) saturate(80%)'); break;
      case 'cyberpunk': filters.push('hue-rotate(170deg) saturate(180%) contrast(140%)'); break;
      case 'warm': filters.push('sepia(25%) saturate(140%) hue-rotate(-15deg)'); break;
      case 'invert': filters.push('invert(100%)'); break;
      case 'blur': filters.push('blur(4px)'); break;
      case 'dramatic': filters.push('contrast(150%) brightness(85%) saturate(80%)'); break;
      case 'noir': filters.push('grayscale(100%) contrast(160%) brightness(80%)'); break;
      case 'technicolor': filters.push('saturate(220%) contrast(105%)'); break;
    }

    return filters.join(' ');
  }, [videoState.filter, videoState.brightness, videoState.contrast, videoState.saturation, clipFilter]);

  const transitionEffect = useMemo(() => {
    const timeInClip = timelineTime - clipStart;
    const timeLeft = clipDuration - timeInClip;

    let opacity = 1;
    let transform = 'scale(1) translateX(0)';
    let blur = 0;

    if (videoState.fadeIn > 0 && timeInClip < videoState.fadeIn) {
      opacity = timeInClip / videoState.fadeIn;
    } else if (videoState.fadeOut > 0 && timeLeft < videoState.fadeOut) {
      opacity = timeLeft / videoState.fadeOut;
    }

    if (timeInClip < TRANSITION_DURATION && transitionIn && transitionIn !== 'none') {
      const p = timeInClip / TRANSITION_DURATION;
      if (transitionIn === 'fade') opacity *= p;
      if (transitionIn === 'slide-left') transform = `translateX(${(1 - p) * 100}%)`;
      if (transitionIn === 'slide-right') transform = `translateX(${(p - 1) * 100}%)`;
      if (transitionIn === 'zoom-in') transform = `scale(${0.9 + p * 0.1})`;
      if (transitionIn === 'zoom-out') transform = `scale(${1.1 - p * 0.1})`;
      if (transitionIn === 'blur-dissolve') blur = (1 - p) * 15;
    } else if (timeLeft < TRANSITION_DURATION && transitionOut && transitionOut !== 'none') {
      const p = 1 - (timeLeft / TRANSITION_DURATION);
      if (transitionOut === 'fade') opacity *= (1 - p);
      if (transitionOut === 'slide-left') transform = `translateX(${-p * 100}%)`;
      if (transitionOut === 'slide-right') transform = `translateX(${p * 100}%)`;
      if (transitionOut === 'zoom-in') transform = `scale(${1 + p * 0.1})`;
      if (transitionOut === 'zoom-out') transform = `scale(${1 - p * 0.1})`;
      if (transitionOut === 'blur-dissolve') blur = p * 15;
    }

    return {
      opacity,
      transform,
      filter: blur > 0 ? `${filterStyle} blur(${blur}px)` : filterStyle
    };
  }, [timelineTime, clipStart, clipDuration, transitionIn, transitionOut, filterStyle, videoState.fadeIn, videoState.fadeOut]);

  if (hasError) return (
    <div className="w-full h-full bg-gray-900 flex flex-col items-center justify-center text-red-500 gap-4">
      <div className="p-6 bg-red-500/10 rounded-full border border-red-500/20">
        <AlertTriangle size={32} />
      </div>
      <div className="text-center">
        <span className="text-sm font-bold uppercase tracking-widest block mb-1">Playback Error</span>
        <p className="text-[10px] text-gray-500 max-w-[200px] leading-relaxed">There was a problem loading or seeking the video.</p>
      </div>
      <button
        onClick={() => {
          setHasError(false);
          if (videoRef.current) {
            videoRef.current.load();
          }
        }}
        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg active:scale-95"
      >
        <RefreshCcw size={14} /> Retry
      </button>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden group select-none"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {src ? (
        type === 'video' ? (
          <video
            ref={videoRef}
            src={src}
            className="w-full h-full object-contain"
            style={transitionEffect}
            onEnded={onEnded}
            onError={() => setHasError(true)}
            playsInline
            crossOrigin="anonymous"
          />
        ) : (
          <img
            src={src}
            className="w-full h-full object-contain"
            style={transitionEffect}
          />
        )
      ) : null}

      {!videoState.isPlaying && (
        <div
          className={`absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity duration-300 cursor-pointer ${showControls ? 'opacity-100' : 'opacity-0'}`}
          onClick={onTogglePlay}
        >
          <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-xl transition-transform active:scale-90">
            <Play size={32} className="ml-1" fill="currentColor" />
          </div>
        </div>
      )}

      {activeSubtitle && (
        <div className="absolute bottom-10 left-0 right-0 flex justify-center px-8 pointer-events-none">
          <span className="bg-black/70 text-white px-4 py-2 rounded-md text-lg font-medium text-center backdrop-blur-sm border border-white/10 shadow-lg">
            {activeSubtitle.text}
          </span>
        </div>
      )}
    </div>
  );
});

export default VideoPlayer;
