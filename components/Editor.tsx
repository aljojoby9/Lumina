import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Pause, RotateCcw, Download, Undo2, Redo2, ArrowLeft, Save, Loader2, AlertTriangle, Plus, Maximize2, Minimize2, MessageSquare, PanelRightClose, PanelRightOpen, RefreshCw, Pencil } from 'lucide-react';
import VideoPlayer, { VideoPlayerRef } from './VideoPlayer';
import Timeline from './Timeline';
import ControlPanel from './ControlPanel';
import AIAssistant from './AIAssistant';
import { VideoState, ChatMessage, TimelineClip, Project } from '../types';
import { processUserCommand } from '../services/geminiService';
import { saveProject } from '../services/db';
import { saveFileToLocal, getFileFromLocal } from '../services/localStore';

// Helper for ID generation
const generateId = () => Math.random().toString(36).substr(2, 9);

// Helper to get media metadata (duration)
const getMediaInfo = (file: File): Promise<{ duration: number, type: 'video' | 'image' }> => {
    return new Promise((resolve) => {
        if (file.type.startsWith('image')) {
            resolve({ duration: 5, type: 'image' });
            return;
        }
        
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        
        const onLoaded = () => {
             const dur = video.duration;
            resolve({ duration: (isFinite(dur) && dur > 0) ? dur : 10, type: 'video' });
            cleanup();
        }

        const onError = () => {
            console.warn("Could not load metadata for file:", file.name);
            resolve({ duration: 10, type: 'video' });
            cleanup();
        }
        
        const cleanup = () => {
             URL.revokeObjectURL(video.src);
             video.removeEventListener('loadedmetadata', onLoaded);
             video.removeEventListener('error', onError);
        }

        video.addEventListener('loadedmetadata', onLoaded);
        video.addEventListener('error', onError);
        
        video.src = URL.createObjectURL(file);
    });
};

interface EditorProps {
    project: Project;
    onBack: () => void;
}

const Editor: React.FC<EditorProps> = ({ project, onBack }) => {
  // --- STATE ---
  
  // 1. Sanitize clips immediately to prevent browser trying to fetch dead Blob URLs from previous sessions.
  // We use a ref to ensure this mapping happens only once on mount.
  const sanitizedInitialClips = useRef(
      project.clips.map(clip => ({
          ...clip,
          src: '' // Force empty src initially; restoreMedia will populate valid ones
      }))
  ).current;

  // Initialize main state with sanitized clips
  const [clips, setClips] = useState<TimelineClip[]>(sanitizedInitialClips);
  
  // Initialize history with sanitized clips to prevent undo/redo triggering 404s
  const [history, setHistory] = useState<{state: VideoState, clips: TimelineClip[]}[]>([{
      state: project.videoState, 
      clips: sanitizedInitialClips
  }]);

  const [videoState, setVideoState] = useState<VideoState>(project.videoState);
  const [activeClip, setActiveClip] = useState<TimelineClip | null>(null);
  
  // Project Name State
  const [projectName, setProjectName] = useState(project.name);
  const [isEditingName, setIsEditingName] = useState(false);

  // UI State
  const [showChat, setShowChat] = useState(true);
  const [isLoadingMedia, setIsLoadingMedia] = useState(true);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(project.messages);
  
  const [historyIndex, setHistoryIndex] = useState(0);

  const playerRef = useRef<VideoPlayerRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null); // New input for replacement
  const playbackInterval = useRef<number | null>(null);

  // --- INITIALIZATION ---

  useEffect(() => {
    // Restore media files for all clips from IndexedDB
    const restoreMedia = async () => {
        setIsLoadingMedia(true);
        try {
            // We use the original project clips to get IDs, but we never use their stale 'src' properties
            const loadedClips = [...project.clips];
            
            const updatedClips = await Promise.all(loadedClips.map(async (clip) => {
                try {
                    // Try to get file from local store using the ID as key
                    const file = await getFileFromLocal(clip.id);
                    if (file) {
                        return { ...clip, src: URL.createObjectURL(file) };
                    }
                } catch (err) {
                    console.warn(`Failed to restore media for clip ${clip.id}`, err);
                }
                // If not found or error, keep src empty
                return { ...clip, src: '' };
            }));

            // Filter out corrupted metadata (NaN durations), but allow missing src (visualized as error on timeline)
            const validClips = updatedClips.filter(c => {
                 const hasDuration = isFinite(c.duration) && c.duration > 0;
                 const hasStart = isFinite(c.start);
                 return hasDuration && hasStart;
            });

            // Sort clips by start time
            validClips.sort((a, b) => a.start - b.start);
            
            setClips(validClips);
            
            // Re-sync history base state with restored clips
            setHistory(prev => {
                const newHistory = [...prev];
                if (newHistory[0]) {
                    newHistory[0].clips = validClips;
                }
                return newHistory;
            });
            
            // Update duration based on restored clips
            if (validClips.length > 0) {
                const maxDur = Math.max(...validClips.map(c => c.start + c.duration), 0);
                if (maxDur > 0) {
                     setVideoState(prev => ({ ...prev, duration: maxDur }));
                }
            }
        } catch (e) {
            console.error("Error restoring media:", e);
        } finally {
            setIsLoadingMedia(false);
        }
    };
    restoreMedia();

    return () => {
        // Cleanup Blob URLs on unmount
        clips.forEach(c => {
            if (c.src && c.src.startsWith('blob:')) {
                URL.revokeObjectURL(c.src);
            }
        });
    };
  }, [project.id]);

  // --- PLAYBACK ENGINE ---

  useEffect(() => {
      // Find the clip at current time
      const current = clips.find(c => {
          const start = c.start || 0;
          const duration = c.duration || 0;
          return videoState.currentTime >= start && videoState.currentTime < (start + duration);
      });
      setActiveClip(current || null);
  }, [videoState.currentTime, clips]);

  useEffect(() => {
      if (videoState.isPlaying) {
          playbackInterval.current = window.setInterval(() => {
              setVideoState(prev => {
                  const nextTime = prev.currentTime + 0.1 * prev.playbackRate; // 100ms tick
                  
                  const maxDuration = Math.max(...clips.map(c => (c.start || 0) + (c.duration || 0)), 0);
                  if (nextTime >= maxDuration && maxDuration > 0) {
                      return { ...prev, currentTime: maxDuration, isPlaying: false };
                  }
                  
                  return { ...prev, currentTime: nextTime };
              });
          }, 100);
      } else {
          if (playbackInterval.current) clearInterval(playbackInterval.current);
      }

      return () => {
          if (playbackInterval.current) clearInterval(playbackInterval.current);
      };
  }, [videoState.isPlaying, clips]);

  // --- ACTIONS ---

  const handleAddMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsLoadingMedia(true);
    const newClips: TimelineClip[] = [];
    
    // Calculate start position
    const validClips = clips.filter(c => isFinite(c.start) && isFinite(c.duration));
    let startPosition = validClips.length > 0 
        ? Math.max(...validClips.map(c => c.start + c.duration)) 
        : 0;
    
    if (!isFinite(startPosition) || startPosition < 0) startPosition = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const clipId = generateId();
        
        try {
            const { duration, type } = await getMediaInfo(file);
            const url = URL.createObjectURL(file);
            
            newClips.push({
                id: clipId,
                type,
                src: url,
                name: file.name,
                start: startPosition,
                duration: duration,
                offset: 0
            });
            
            await saveFileToLocal(clipId, file);
            startPosition += duration;

        } catch (e) {
            console.error("Failed to process file", file.name, e);
        }
    }

    const updatedClips = [...clips, ...newClips].sort((a, b) => a.start - b.start);
    setClips(updatedClips);
    
    const newTotalDuration = Math.max(...updatedClips.map(c => c.start + c.duration), 0);
    setVideoState(prev => ({ ...prev, duration: newTotalDuration }));
    
    recordHistory({ ...videoState, duration: newTotalDuration }, updatedClips);
    
    setIsLoadingMedia(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleReplaceMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !activeClip) return;
      
      try {
          // 1. Save new file
          await saveFileToLocal(activeClip.id, file);
          
          // 2. Create URL
          const url = URL.createObjectURL(file);
          
          // 3. Update clips state
          const updatedClips = clips.map(c => {
              if (c.id === activeClip.id) {
                  return { 
                      ...c, 
                      src: url, 
                      name: file.name, 
                      type: (file.type.startsWith('image') ? 'image' : 'video') as 'image' | 'video'
                  }; 
              }
              return c;
          });
          
          setClips(updatedClips);
          recordHistory(videoState, updatedClips);

      } catch (e) {
          console.error("Failed to replace media", e);
      } finally {
          if (replaceInputRef.current) replaceInputRef.current.value = '';
      }
  };

  const updateClip = (updatedClip: TimelineClip) => {
      const newClips = clips.map(c => c.id === updatedClip.id ? updatedClip : c).sort((a, b) => a.start - b.start);
      setClips(newClips);
      
      const newTotalDuration = Math.max(...newClips.map(c => c.start + c.duration), 0);
      setVideoState(prev => ({ ...prev, duration: newTotalDuration }));
  };

  // --- RENAME PROJECT ---
  const handleSaveName = async () => {
      setIsEditingName(false);
      const trimmedName = projectName.trim();
      const finalName = trimmedName.length > 0 ? trimmedName : "Untitled Project";
      setProjectName(finalName);
      
      if (finalName === project.name) return; // No change
      
      try {
          await saveProject(project.id, { name: finalName });
      } catch (e) {
          console.error("Failed to rename project", e);
      }
  };

  // --- HISTORY ---
  const recordHistory = (state: VideoState, currentClips: TimelineClip[]) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({ state, clips: currentClips });
      if (newHistory.length > 20) newHistory.shift();
      
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setVideoState(state);
  };

  const undo = () => {
      if (historyIndex > 0) {
          const prev = history[historyIndex - 1];
          setHistoryIndex(historyIndex - 1);
          setVideoState(prev.state);
          setClips(prev.clips);
      }
  };

  const redo = () => {
      if (historyIndex < history.length - 1) {
          const next = history[historyIndex + 1];
          setHistoryIndex(historyIndex + 1);
          setVideoState(next.state);
          setClips(next.clips);
      }
  };

  const handleSave = async () => {
      setIsSaving(true);
      try {
        // Generate a small thumbnail from the current frame
        const thumbnail = playerRef.current?.getSnapshot();

        await saveProject(project.id, {
            videoState,
            clips, 
            messages,
            name: projectName,
            thumbnail: thumbnail || undefined
        });
      } catch (e) {
          console.error("Save failed", e);
      } finally {
          setIsSaving(false);
      }
  };

  // --- AI HANDLERS ---
  const handleAICommand = async (text: string) => {
    const userMsg: ChatMessage = { id: generateId(), role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setIsProcessingAI(true);

    const currentFrame = playerRef.current?.getSnapshot();
    const response = await processUserCommand(text, currentFrame || undefined);

    setIsProcessingAI(false);

    setMessages(prev => [...prev, {
      id: generateId(),
      role: 'model',
      text: response.reply
    }]);

    if (response.action !== 'unknown' && response.action !== 'analyze_mood') {
        applyAIAction(response);
    }
  };

  const applyAIAction = (response: any) => {
      const val = response.parameters?.value;
      const updates: Partial<VideoState> = {};

      switch (response.action) {
          case 'set_speed':
              if (val) updates.playbackRate = parseFloat(val);
              break;
          case 'set_volume':
              if (val) updates.volume = parseFloat(val);
              break;
          case 'apply_filter':
              if (val) updates.filter = val as string;
              break;
          case 'set_custom_filter':
              if (val) updates.filter = val as string;
              break;
          case 'set_transition':
              // Expected format: "in:2", "out:3", "both:1.5"
              if (val && typeof val === 'string') {
                  const [type, durStr] = val.split(':');
                  const dur = parseFloat(durStr) || 1;
                  
                  if (type === 'in') updates.fadeIn = dur;
                  else if (type === 'out') updates.fadeOut = dur;
                  else if (type === 'both') {
                      updates.fadeIn = dur;
                      updates.fadeOut = dur;
                  }
              }
              break;
      }
      
      if (Object.keys(updates).length > 0) {
          const newState = { ...videoState, ...updates };
          recordHistory(newState, clips);
      }
  };

  // Safe duration calc
  const safeClips = clips.filter(c => isFinite(c.start) && isFinite(c.duration));
  const totalDuration = safeClips.length > 0 ? Math.max(...safeClips.map(c => c.start + c.duration), 10) : 10;

  return (
    <div className="flex flex-col h-screen bg-dark-bg text-gray-100 font-sans overflow-hidden">
      
      {/* Header */}
      <header className="h-14 bg-black border-b border-dark-border flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 -ml-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-800 transition-colors">
                <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col justify-center min-w-[200px]">
                {isEditingName ? (
                    <input 
                        type="text" 
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        onBlur={handleSaveName}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                        autoFocus
                        className="bg-gray-800 text-white text-sm font-bold px-2 py-0.5 rounded border border-lumina-500 outline-none w-full"
                    />
                ) : (
                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingName(true)}>
                        <span className="font-bold text-sm text-white truncate max-w-[250px]">{projectName}</span>
                        <button className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white transition-opacity">
                            <Pencil size={12} />
                        </button>
                    </div>
                )}
                <span className="text-xs text-gray-500">{clips.length} Clips • {Math.floor(totalDuration)}s</span>
            </div>
        </div>
        
        <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1 border border-dark-border">
            <button onClick={undo} disabled={historyIndex <= 0} className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 transition-colors">
                <Undo2 size={18} />
            </button>
            <div className="w-px h-4 bg-gray-700 mx-1"></div>
            <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 transition-colors">
                <Redo2 size={18} />
            </button>
        </div>

        <div className="flex items-center gap-3">
             <button 
                 onClick={() => setShowChat(!showChat)}
                 className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors border ${showChat ? 'bg-lumina-900/50 border-lumina-500/50 text-lumina-400' : 'bg-gray-800 border-gray-700 text-gray-300'}`}
             >
                 {showChat ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
                 <span className="hidden sm:inline">AI Chat</span>
             </button>

             <button 
                onClick={handleSave}
                disabled={isSaving || isLoadingMedia}
                className={`flex items-center gap-2 px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-md text-sm font-medium transition-colors border border-gray-700 ${isLoadingMedia ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                Save
            </button>
            
            <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoadingMedia}
                className={`flex items-center gap-2 px-4 py-1.5 bg-lumina-600 hover:bg-lumina-500 text-white rounded-md text-sm font-medium transition-colors shadow-lg shadow-lumina-900/20 ${isLoadingMedia ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <Plus size={16} /> Add Media
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleAddMedia} 
                accept="video/*,image/*" 
                multiple 
                className="hidden" 
            />
            
            {/* Hidden Input for Replacements */}
            <input 
                type="file"
                ref={replaceInputRef}
                onChange={handleReplaceMedia}
                accept="video/*,image/*"
                className="hidden"
            />
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Chat Sidebar */}
        {showChat && (
            <AIAssistant messages={messages} onSendMessage={handleAICommand} isProcessing={isProcessingAI} />
        )}

        {/* Center Stage */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-900 transition-all duration-300">
            <div className="flex-1 p-6 flex items-center justify-center relative bg-center-pattern">
                 {isLoadingMedia ? (
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 size={32} className="text-lumina-500 animate-spin" />
                        <span className="text-gray-400 text-sm">Loading project assets...</span>
                    </div>
                 ) : clips.length > 0 ? (
                    <>
                        {/* Playback Controls Overlay */}
                        <div className="absolute top-4 flex gap-2 bg-black/50 backdrop-blur rounded-full px-4 py-2 border border-white/10 z-10 shadow-lg">
                            <button onClick={() => setVideoState(prev => ({...prev, isPlaying: !prev.isPlaying}))} className="text-white hover:text-lumina-400 transition-colors">
                                {videoState.isPlaying ? <Pause size={20} /> : <Play size={20} />}
                            </button>
                            <button onClick={() => setVideoState(prev => ({...prev, currentTime: 0}))} className="text-white hover:text-lumina-400 transition-colors">
                                <RotateCcw size={20} />
                            </button>
                            <div className="w-px h-5 bg-white/20 mx-1"></div>
                            <span className="text-xs font-mono pt-1 text-gray-300">
                                {Math.floor(videoState.currentTime / 60)}:{(Math.floor(videoState.currentTime % 60)).toString().padStart(2, '0')} / 
                                {Math.floor(totalDuration / 60)}:{(Math.floor(totalDuration % 60)).toString().padStart(2, '0')}
                            </span>
                        </div>

                        {/* Video Canvas */}
                        <div className="w-full max-w-5xl aspect-video bg-black rounded-lg shadow-2xl overflow-hidden ring-1 ring-white/10 relative">
                            {activeClip ? (
                                <div className="w-full h-full relative group">
                                    <VideoPlayer 
                                        key={activeClip.id} // FORCE REMOUNT ON CLIP CHANGE
                                        ref={playerRef}
                                        src={activeClip.src}
                                        type={activeClip.type} // Pass the type here
                                        videoState={videoState}
                                        timelineTime={videoState.currentTime}
                                        clipStart={activeClip.start}
                                        clipOffset={activeClip.offset}
                                        onTimeUpdate={(t) => {}}
                                        onDurationChange={() => {}}
                                        onEnded={() => {}}
                                    />
                                    
                                    {/* Missing Media Overlay / Relink Button */}
                                    {!activeClip.src && (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <div className="pointer-events-auto">
                                                <button 
                                                    onClick={() => replaceInputRef.current?.click()}
                                                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium transition-transform hover:scale-105"
                                                >
                                                    <RefreshCw size={16} /> Relink Media
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-black text-gray-600">
                                    <span className="text-sm">No clip at this timestamp</span>
                                </div>
                            )}
                        </div>
                    </>
                 ) : (
                     <div className="text-center p-8 border-2 border-dashed border-gray-700 rounded-2xl bg-black/20">
                         <Plus size={48} className="mx-auto text-lumina-500 mb-4 opacity-50" />
                         <h3 className="text-xl font-bold text-white mb-2">Start Creating</h3>
                         <p className="text-gray-400 max-w-md mb-6">
                            Add videos or images to the timeline to get started.
                         </p>
                         <button onClick={() => fileInputRef.current?.click()} className="px-6 py-2 bg-lumina-600 hover:bg-lumina-500 text-white rounded-lg font-medium">
                             Add Media Files
                         </button>
                     </div>
                 )}
            </div>

            <Timeline 
                duration={totalDuration}
                currentTime={videoState.currentTime}
                clips={isLoadingMedia ? [] : clips}
                onSeek={(time) => setVideoState(prev => ({ ...prev, currentTime: time }))}
                onClipUpdate={updateClip}
            />
        </div>

        {/* Right Panel */}
        <ControlPanel 
            state={videoState} 
            onUpdate={(updates, commit) => {
                const newState = { ...videoState, ...updates };
                setVideoState(newState);
                if (commit) recordHistory(newState, clips);
            }} 
            onCommit={() => recordHistory(videoState, clips)} 
        />
      </div>
    </div>
  );
};

export default Editor;