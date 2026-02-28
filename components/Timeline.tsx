
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { TimelineClip, Subtitle, FilterType, TransitionType, AudioClip } from '../types';
import { Type, Scissors, Wand2, Layers, MoveHorizontal, Mic, Music, Volume2, VolumeX, Trash2, SkipBack, SkipForward } from 'lucide-react';

interface TimelineProps {
  duration: number;
  currentTime: number;
  clips: TimelineClip[];
  subtitles: Subtitle[];
  audioClips?: AudioClip[];
  selectedAudioClipId?: string | null;
  onSeek: (time: number) => void;
  onSplitAtPlayhead?: () => void;
  canSplitAtPlayhead?: boolean;
  onTrimLeftAtPlayhead?: () => void;
  onTrimRightAtPlayhead?: () => void;
  onDeleteAtPlayhead?: () => void;
  canTrimLeftAtPlayhead?: boolean;
  canTrimRightAtPlayhead?: boolean;
  canDeleteAtPlayhead?: boolean;
  onDropPreset: (clipId: string, type: 'filter' | 'transition', value: string) => void;
  onMoveVideoClip?: (clipId: string, newStart: number) => void;
  onToggleMuteVideoClip?: (clipId: string) => void;
  onSelectAudioClip?: (audioClipId: string) => void;
  onMoveAudioClip?: (audioClipId: string, newStart: number) => void;
  onToggleMuteAudioClip?: (audioClipId: string) => void;
}

const Timeline: React.FC<TimelineProps> = ({ duration, currentTime, clips, subtitles, audioClips = [], selectedAudioClipId = null, onSeek, onSplitAtPlayhead, canSplitAtPlayhead = false, onTrimLeftAtPlayhead, onTrimRightAtPlayhead, onDeleteAtPlayhead, canTrimLeftAtPlayhead = false, canTrimRightAtPlayhead = false, canDeleteAtPlayhead = false, onDropPreset, onMoveVideoClip, onToggleMuteVideoClip, onSelectAudioClip, onMoveAudioClip, onToggleMuteAudioClip }) => {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [draggedOverClip, setDraggedOverClip] = useState<string | null>(null);
  const [draggingVideoId, setDraggingVideoId] = useState<string | null>(null);
  const [draggingAudioId, setDraggingAudioId] = useState<string | null>(null);
  const videoDragOffsetRef = useRef<number>(0);
  const videoDragDurationRef = useRef<number>(0);
  const dragOffsetRef = useRef<number>(0);
  const dragDurationRef = useRef<number>(0);
  const lastDragUpdateRef = useRef<number>(0);

  const timelineDuration = Math.max(duration, 10);

  const getStableWaveHeight = useCallback((clipId: string, index: number) => {
    let hash = 0;
    const seed = `${clipId}:${index}`;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    const normalized = Math.abs(hash % 100) / 100;
    return 20 + (normalized * 80);
  }, []);

  const calculateTimeFromX = useCallback((clientX: number) => {
    if (!progressBarRef.current) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return (x / rect.width) * timelineDuration;
  }, [timelineDuration]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsScrubbing(true);
    onSeek(calculateTimeFromX(e.clientX));
  };

  useEffect(() => {
    let lastSeekTime = 0;
    const SEEK_THROTTLE = 50; // ms

    const handleMouseMove = (e: MouseEvent) => {
      if (isScrubbing) {
        const now = performance.now();
        if (now - lastSeekTime > SEEK_THROTTLE) {
          onSeek(calculateTimeFromX(e.clientX));
          lastSeekTime = now;
        }
      }
    };
    const handleMouseUp = () => setIsScrubbing(false);

    if (isScrubbing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, calculateTimeFromX, onSeek]);

  useEffect(() => {
    const DRAG_THROTTLE = 16;

    const handleMouseMove = (e: MouseEvent) => {
      if (draggingVideoId && onMoveVideoClip) {
        const now = performance.now();
        if (now - lastDragUpdateRef.current < DRAG_THROTTLE) return;
        lastDragUpdateRef.current = now;

        const pointerTime = calculateTimeFromX(e.clientX);
        const maxStart = Math.max(0, timelineDuration - videoDragDurationRef.current);
        const nextStart = Math.max(0, Math.min(pointerTime - videoDragOffsetRef.current, maxStart));
        onMoveVideoClip(draggingVideoId, nextStart);
        return;
      }

      if (!draggingAudioId || !onMoveAudioClip) return;

      const now = performance.now();
      if (now - lastDragUpdateRef.current < DRAG_THROTTLE) return;
      lastDragUpdateRef.current = now;

      const pointerTime = calculateTimeFromX(e.clientX);
      const maxStart = Math.max(0, timelineDuration - dragDurationRef.current);
      const nextStart = Math.max(0, Math.min(pointerTime - dragOffsetRef.current, maxStart));
      onMoveAudioClip(draggingAudioId, nextStart);
    };

    const handleMouseUp = () => {
      if (draggingVideoId) {
        setDraggingVideoId(null);
      }
      if (draggingAudioId) {
        setDraggingAudioId(null);
      }
    };

    if (draggingAudioId || draggingVideoId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingAudioId, draggingVideoId, calculateTimeFromX, timelineDuration, onMoveAudioClip, onMoveVideoClip]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent, clipId: string) => {
    e.preventDefault();
    setDraggedOverClip(null);
    const data = e.dataTransfer.getData('preset');
    if (data) {
      const { type, value } = JSON.parse(data);
      onDropPreset(clipId, type, value);
    }
  };

  const handleDragEnter = (e: React.DragEvent, clipId: string) => {
    e.preventDefault();
    setDraggedOverClip(clipId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggedOverClip(null);
  };

  return (
    <div className="w-full h-80 bg-dark-surface border-t border-dark-border flex flex-col select-none relative z-30 overflow-visible">
      <div className="h-10 flex items-center justify-between px-6 text-xs text-gray-500 border-b border-dark-border bg-gray-900/80 font-mono tracking-tighter">
        <div className="flex items-center gap-4">
          <span className="text-lumina-400 font-bold">{Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(2).padStart(5, '0')}</span>
          <span className="opacity-30">/</span>
          <span>{Math.floor(timelineDuration / 60)}:{(timelineDuration % 60).toFixed(2).padStart(5, '0')}</span>
        </div>
        <div className="flex gap-4 items-center">
          <button
            onClick={onSplitAtPlayhead}
            disabled={!canSplitAtPlayhead}
            className="hover:text-white transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Split clips at playhead"
          >
            <Scissors size={12} /> Split
          </button>
          <button
            onClick={onTrimLeftAtPlayhead}
            disabled={!canTrimLeftAtPlayhead}
            className="hover:text-white transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Trim left edge to playhead"
          >
            <SkipForward size={12} /> Trim In
          </button>
          <button
            onClick={onTrimRightAtPlayhead}
            disabled={!canTrimRightAtPlayhead}
            className="hover:text-white transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Trim right edge to playhead"
          >
            <SkipBack size={12} /> Trim Out
          </button>
          <button
            onClick={onDeleteAtPlayhead}
            disabled={!canDeleteAtPlayhead}
            className="hover:text-red-300 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Delete clips at playhead"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>

      <div className="flex-1 relative p-5 space-y-4 overflow-x-auto overflow-y-auto no-scrollbar">
        <div
          className="relative min-h-[250px] min-w-full"
          ref={progressBarRef}
          onMouseDown={handleMouseDown}
        >
          {/* Time Markers */}
          <div className="absolute inset-0 flex pointer-events-none border-b border-white/5 h-6">
            {Array.from({ length: 11 }).map((_, i) => (
              <div key={i} className="flex-1 border-l border-white/10 h-full text-[9px] pl-1 pt-1">{(i * timelineDuration / 10).toFixed(0)}s</div>
            ))}
          </div>

          {/* Video Track */}
          <div className="h-24 relative bg-gray-900/50 rounded-lg border border-white/5 mb-4 mt-8 shadow-inner overflow-visible">
            {clips.map((clip) => (
              <div
                key={clip.id}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsScrubbing(false);
                  setDraggingVideoId(clip.id);
                  videoDragOffsetRef.current = calculateTimeFromX(e.clientX) - clip.start;
                  videoDragDurationRef.current = clip.duration;
                  lastDragUpdateRef.current = 0;
                }}
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, clip.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, clip.id)}
                className={`absolute top-0 bottom-0 bg-lumina-600/20 border-x border-lumina-400/30 group cursor-pointer flex flex-col items-start p-3 gap-1 overflow-hidden transition-all hover:bg-lumina-600/30 
                                ${clip.filter && clip.filter !== 'none' ? 'ring-1 ring-purple-500/50' : ''}
                                ${draggedOverClip === clip.id ? 'ring-2 ring-lumina-400 bg-lumina-400/20 scale-[1.02] z-10 shadow-[0_0_20px_rgba(14,165,233,0.3)]' : ''}
                                ${draggingVideoId === clip.id ? 'cursor-grabbing' : 'cursor-grab'}
                            `}
                style={{
                  left: `${(clip.start / timelineDuration) * 100}%`,
                  width: `${(clip.duration / timelineDuration) * 100}%`
                }}
              >
                {draggedOverClip === clip.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-lumina-500/10 backdrop-blur-[1px] pointer-events-none">
                    <div className="bg-lumina-500 text-white text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-lg animate-bounce">
                      Apply Effect
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 w-full">
                  <span className="text-xs font-bold text-white/90 truncate flex-1 uppercase tracking-tight">{clip.name}</span>
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMuteVideoClip?.(clip.id);
                    }}
                    className="p-0.5 rounded hover:bg-black/30 transition-colors"
                    title={clip.isMuted ? 'Unmute clip' : 'Mute clip'}
                  >
                    {clip.isMuted ? <VolumeX size={10} className="text-red-300" /> : <Volume2 size={10} className="text-white/80" />}
                  </button>
                  {clip.transitionIn && <MoveHorizontal size={10} className="text-yellow-400" />}
                  {clip.filter && clip.filter !== 'none' && <Wand2 size={10} className="text-purple-400" />}
                </div>
                <div className="flex gap-1 h-4 opacity-50 mt-1 w-full">
                  {Array.from({ length: Math.ceil(clip.duration) }).map((_, i) => (
                    <div key={i} className="w-1 bg-white/20 rounded-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Subtitle Track */}
          <div className="h-12 relative bg-purple-900/10 rounded-lg border border-purple-500/10 mb-4">
            <div className="absolute left-0 -top-4 text-[8px] text-purple-400 font-black uppercase tracking-[0.2em] opacity-60">Speech Track</div>
            {subtitles.map((sub) => (
              <div
                key={sub.id}
                className="absolute top-1.5 bottom-1.5 bg-purple-500/20 border border-purple-400/30 rounded flex items-center justify-center px-2 shadow-sm"
                style={{
                  left: `${(sub.start / timelineDuration) * 100}%`,
                  width: `${(sub.duration / timelineDuration) * 100}%`
                }}
              >
                <Type size={12} className="text-purple-300" />
              </div>
            ))}
          </div>

          {/* Audio Track */}
          <div className="h-20 relative bg-green-900/10 rounded-lg border border-green-500/10">
            <div className="absolute left-0 -top-4 text-[8px] text-green-400 font-black uppercase tracking-[0.2em] opacity-60">Audio Track</div>
            {audioClips.map((audio) => (
              <div
                key={audio.id}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsScrubbing(false);
                  onSelectAudioClip?.(audio.id);
                  setDraggingAudioId(audio.id);
                  dragOffsetRef.current = calculateTimeFromX(e.clientX) - audio.start;
                  dragDurationRef.current = audio.duration;
                  lastDragUpdateRef.current = 0;
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAudioClip?.(audio.id);
                }}
                className={`absolute top-1.5 bottom-1.5 border rounded flex flex-col items-start justify-center px-3 shadow-sm overflow-hidden ${
                  audio.type === 'voiceover' 
                    ? 'bg-red-500/20 border-red-400/30 text-red-300' 
                    : 'bg-green-500/20 border-green-400/30 text-green-300'
                } ${selectedAudioClipId === audio.id ? 'ring-2 ring-lumina-400 shadow-[0_0_16px_rgba(14,165,233,0.35)]' : ''} ${draggingAudioId === audio.id ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{
                  left: `${(audio.start / timelineDuration) * 100}%`,
                  width: `${(audio.duration / timelineDuration) * 100}%`
                }}
              >
                <div className="flex items-center gap-1 w-full">
                  {audio.type === 'voiceover' ? <Mic size={10} /> : <Music size={10} />}
                  <span className="text-[10px] font-bold truncate uppercase tracking-tight">{audio.name}</span>
                  <button
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMuteAudioClip?.(audio.id);
                    }}
                    className="ml-auto p-0.5 rounded hover:bg-black/30 transition-colors"
                    title={audio.isMuted ? 'Unmute clip' : 'Mute clip'}
                  >
                    {audio.isMuted ? <VolumeX size={10} className="text-red-300" /> : <Volume2 size={10} className="text-white/80" />}
                  </button>
                </div>
                {/* Simple waveform visualization */}
                <div className="flex items-end gap-[1px] h-8 w-full mt-2 opacity-50">
                  {Array.from({ length: Math.min(20, Math.ceil(audio.duration * 2)) }).map((_, i) => (
                    <div 
                      key={i} 
                      className={`flex-1 rounded-t-sm ${audio.type === 'voiceover' ? 'bg-red-400' : 'bg-green-400'}`}
                      style={{ height: `${getStableWaveHeight(audio.id, i)}%` }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-red-500 z-50 pointer-events-none shadow-[0_0_10px_rgba(239,68,68,0.5)]"
            style={{ left: `${(currentTime / timelineDuration) * 100}%` }}
          >
            <div className="w-3 h-3 -ml-[5px] -mt-1 bg-red-500 rounded-full border-2 border-white"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Timeline;
