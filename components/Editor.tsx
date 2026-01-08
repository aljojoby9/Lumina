import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    ArrowLeft, Save, Plus, Loader2, Upload, CheckCircle2, Wand2, Sparkles,
    Play, Pause, Scissors, Type, LayoutTemplate, RotateCcw, Clapperboard,
    Moon, Coffee, Film, Zap, Sun, Repeat, Layers, Flame,
    Minimize2, ArrowLeftFromLine, ArrowRightFromLine, Maximize, Minimize, Wind,
    Download, FileVideo, Cpu, Stars, Undo2, Redo2
} from 'lucide-react';
import VideoPlayer, { VideoPlayerRef } from './VideoPlayer';
import Timeline from './Timeline';
import ControlPanel from './ControlPanel';
import AIAssistant from './AIAssistant';
import { VideoState, ChatMessage, TimelineClip, Project, AIAction, Subtitle, FilterType, TransitionType } from '../types';
import { processUserCommand } from '../services/geminiService';
import { saveProject } from '../services/db';
import { uploadMediaFile, getMediaFileURL } from '../services/storageService';
import { extractBestMoments } from '../services/videoAnalysisService';
import { generateSubtitles } from '../services/subtitleService';

const generateId = () => Math.random().toString(36).substr(2, 9);

interface EditorProps {
    project: Project;
    onBack: () => void;
}

const Editor: React.FC<EditorProps> = ({ project, onBack }) => {
    const [clips, setClips] = useState<TimelineClip[]>([]);
    const [subtitles, setSubtitles] = useState<Subtitle[]>(project.subtitles || []);
    const [videoState, setVideoState] = useState<VideoState>(project.videoState);
    const [messages, setMessages] = useState<ChatMessage[]>(project.messages);
    const [isLoadingMedia, setIsLoadingMedia] = useState(true);
    const [isProcessingAI, setIsProcessingAI] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [projectName, setProjectName] = useState(project.name);
    const [showDraftPreview, setShowDraftPreview] = useState(false);
    const [isViewingDraft, setIsViewingDraft] = useState(false);
    const [isAnalyzingMoments, setIsAnalyzingMoments] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState(0);
    const [isGeneratingSubtitles, setIsGeneratingSubtitles] = useState(false);
    const [subtitleProgress, setSubtitleProgress] = useState(0);
    const [subtitleStatus, setSubtitleStatus] = useState('');
    const [analysisStatus, setAnalysisStatus] = useState('');

    // History state for undo/redo
    interface HistoryState {
        clips: TimelineClip[];
        subtitles: Subtitle[];
    }
    const [history, setHistory] = useState<HistoryState[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const isUndoRedoAction = useRef(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const playerRef = useRef<VideoPlayerRef>(null);
    const requestRef = useRef<number>(null);
    const lastTimeRef = useRef<number>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);

    // Persistent saving logic
    const persistProject = useCallback(async (
        state: VideoState,
        currentClips: TimelineClip[],
        currentSubs: Subtitle[],
        currentMessages: ChatMessage[],
        name: string
    ) => {
        setSaveStatus('saving');
        try {
            // Keep Supabase URLs (they're permanent), only strip blob URLs
            const clipsForDb = currentClips.map(({ src, ...rest }) => ({
                ...rest,
                src: src?.startsWith('blob:') ? '' : (src || '')
            }));
            await saveProject(project.id, {
                videoState: state,
                clips: clipsForDb,
                subtitles: currentSubs,
                messages: currentMessages,
                name
            });
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (e) {
            console.error("Save failed:", e);
            setSaveStatus('idle');
        }
    }, [project.id]);

    // Restore logic
    useEffect(() => {
        const restore = async () => {
            setIsLoadingMedia(true);
            try {
                const restoredClips: TimelineClip[] = [];
                let missingFiles = 0;

                for (const c of project.clips) {
                    try {
                        console.log(`Restoring clip ${c.id}: ${c.name}, saved src: ${c.src?.substring(0, 50)}...`);

                        // If the clip already has a valid Supabase URL saved, use it directly
                        if (c.src && c.src.includes('supabase.co')) {
                            console.log(`Using saved Supabase URL for ${c.id}`);
                            restoredClips.push({ ...c });
                        } else {
                            // Otherwise, try to fetch from Supabase Storage by ID
                            const url = await getMediaFileURL(project.id, c.id, c.name);
                            console.log(`Fetched URL for ${c.id}:`, url);
                            if (url) {
                                restoredClips.push({ ...c, src: url });
                            } else {
                                missingFiles++;
                                console.warn(`File missing for clip ${c.id}: ${c.name}`);
                            }
                        }
                    } catch (err) {
                        missingFiles++;
                        console.error(`Failed to restore clip ${c.id}:`, err);
                    }
                }

                console.log(`Restored ${restoredClips.length} clips, ${missingFiles} missing`);
                setClips(restoredClips);

                // Recalculate timeline if clips were restored
                if (restoredClips.length > 0) {
                    let currentStart = 0;
                    const recalculated = restoredClips.map(clip => {
                        const updated = { ...clip, start: currentStart };
                        currentStart += clip.duration;
                        return updated;
                    });
                    setClips(recalculated);

                    const totalDuration = recalculated.reduce((acc, c) => acc + c.duration, 0);
                    setVideoState(prev => ({ ...prev, duration: totalDuration }));
                }

                // Sync initial state from project
                setSubtitles(project.subtitles || []);
                if (restoredClips.length === 0) {
                    // Reset video state if no clips restored
                    setVideoState(project.videoState);
                }
                setMessages(project.messages);
                setProjectName(project.name);

                // Notify user if files were missing
                if (missingFiles > 0 && project.clips.length > 0) {
                    setMessages(prev => [...prev, {
                        id: generateId(),
                        role: 'model',
                        text: `⚠️ ${missingFiles} media file(s) couldn't be restored from cloud storage. Please re-import your video files to continue editing.`
                    }]);
                }
            } catch (e) {
                console.error("Restore failed:", e);
            } finally {
                setIsLoadingMedia(false);
            }
        };
        restore();
    }, [project.id]);

    // Debounced Auto-Save
    useEffect(() => {
        if (isLoadingMedia || isExporting) return;

        const timer = setTimeout(() => {
            persistProject(videoState, clips, subtitles, messages, projectName);
        }, 1500); // Save after 1.5s of inactivity

        return () => clearTimeout(timer);
    }, [clips, subtitles, messages, projectName,
        // Only watch specific parts of videoState to avoid saving on every frame of playback
        videoState.filter, videoState.volume, videoState.playbackRate,
        videoState.brightness, videoState.contrast, videoState.saturation,
        videoState.fadeIn, videoState.fadeOut, videoState.isAudioEnhanced,
        persistProject]);

    // History tracking for undo/redo
    useEffect(() => {
        if (isLoadingMedia || isUndoRedoAction.current) {
            isUndoRedoAction.current = false;
            return;
        }

        // Don't track if nothing has changed
        if (clips.length === 0 && subtitles.length === 0) return;

        const newState: HistoryState = {
            clips: JSON.parse(JSON.stringify(clips)),
            subtitles: JSON.parse(JSON.stringify(subtitles))
        };

        setHistory(prev => {
            // Trim history if we're not at the end (we made changes after undoing)
            const trimmed = prev.slice(0, historyIndex + 1);
            // Limit history to 50 entries
            const limited = trimmed.length >= 50 ? trimmed.slice(1) : trimmed;
            return [...limited, newState];
        });
        setHistoryIndex(prev => Math.min(prev + 1, 49));
    }, [clips, subtitles, isLoadingMedia]);

    // Undo function
    const handleUndo = useCallback(() => {
        if (historyIndex <= 0) return;

        isUndoRedoAction.current = true;
        const prevState = history[historyIndex - 1];
        setClips(prevState.clips);
        setSubtitles(prevState.subtitles);
        setHistoryIndex(prev => prev - 1);

        const totalDur = prevState.clips.reduce((acc, c) => acc + c.duration, 0);
        setVideoState(prev => ({ ...prev, duration: totalDur }));
    }, [history, historyIndex]);

    // Redo function  
    const handleRedo = useCallback(() => {
        if (historyIndex >= history.length - 1) return;

        isUndoRedoAction.current = true;
        const nextState = history[historyIndex + 1];
        setClips(nextState.clips);
        setSubtitles(nextState.subtitles);
        setHistoryIndex(prev => prev + 1);

        const totalDur = nextState.clips.reduce((acc, c) => acc + c.duration, 0);
        setVideoState(prev => ({ ...prev, duration: totalDur }));
    }, [history, historyIndex]);

    // Toggle play/pause
    const handleTogglePlay = useCallback(() => {
        if (isExporting) return;
        setVideoState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
    }, [isExporting]);

    // PLAYBACK TICKER
    const animate = useCallback((time: number) => {
        if (lastTimeRef.current !== undefined) {
            const deltaTime = (time - lastTimeRef.current) / 1000;
            setVideoState(prev => {
                if (!prev.isPlaying) return prev;
                const nextTime = prev.currentTime + (deltaTime * prev.playbackRate);

                if (isExporting) {
                    setExportProgress((nextTime / prev.duration) * 100);
                }

                if (nextTime >= prev.duration) {
                    if (isExporting) handleFinalizeExport();
                    return { ...prev, currentTime: prev.duration, isPlaying: false };
                }
                return { ...prev, currentTime: nextTime };
            });
        }
        lastTimeRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
    }, [isExporting]);

    useEffect(() => {
        if (videoState.isPlaying) {
            lastTimeRef.current = performance.now();
            requestRef.current = requestAnimationFrame(animate);
        } else {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            lastTimeRef.current = undefined;
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [videoState.isPlaying, animate]);

    const handleUpdateState = (updates: Partial<VideoState>) => {
        if (isExporting) return;
        setVideoState(prev => ({ ...prev, ...updates }));
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []) as File[];
        if (files.length === 0) return;

        setIsLoadingMedia(true);
        let updatedClips = [...clips];

        for (const file of files) {
            const id = generateId();
            const isVideo = file.type.startsWith('video/');

            // Upload to Supabase Storage
            try {
                await uploadMediaFile(project.id, id, file);
            } catch (uploadErr: any) {
                console.error('Failed to upload file:', uploadErr);
                setMessages(prev => [...prev, {
                    id: generateId(),
                    role: 'model',
                    text: `⚠️ Upload failed for ${file.name}: ${uploadErr.message || 'Unknown error. Check console for details.'}`
                }]);
                continue;
            }

            let duration = 5;
            if (isVideo) {
                duration = await new Promise((resolve) => {
                    const video = document.createElement('video');
                    video.preload = 'metadata';
                    video.onloadedmetadata = () => resolve(video.duration);
                    video.onerror = () => resolve(5);
                    video.src = URL.createObjectURL(file);
                });
            }

            // Get the download URL for immediate use
            const downloadURL = await getMediaFileURL(project.id, id, file.name);

            const newClip: TimelineClip = {
                id,
                type: isVideo ? 'video' : 'image',
                src: downloadURL || URL.createObjectURL(file),
                name: file.name,
                start: updatedClips.reduce((acc, c) => acc + c.duration, 0),
                duration,
                offset: 0
            };
            updatedClips.push(newClip);
        }

        setClips(updatedClips);
        const totalDuration = updatedClips.reduce((acc, c) => acc + c.duration, 0);
        setVideoState(prev => ({ ...prev, duration: totalDuration }));
        setIsLoadingMedia(false);
        if (fileInputRef.current) fileInputRef.current.value = '';

        if (clips.length === 0 && updatedClips.length > 0) {
            handleAICommand("Generate a human-quality first edit draft for this raw footage.", updatedClips);
        }
    };

    const applyAIAction = useCallback(async (actionObj: AIAction, state: VideoState, currentClips: TimelineClip[]) => {
        const val = actionObj.parameters?.value;
        const ts = actionObj.parameters?.timestamp;
        const targetId = actionObj.parameters?.targetClipId;
        let updates: Partial<VideoState> = {};
        let updatedClips = [...currentClips];

        const recalculateTimeline = (list: TimelineClip[]) => {
            let currentStart = 0;
            return list.map(clip => {
                const nc = { ...clip, start: currentStart };
                currentStart += clip.duration;
                return nc;
            });
        };

        switch (actionObj.action) {
            case 'seek_to': if (ts !== undefined) updates.currentTime = ts; break;
            case 'set_speed': if (val) updates.playbackRate = parseFloat(String(val)); break;
            case 'set_volume': if (val) updates.volume = parseFloat(String(val)); break;
            case 'apply_filter':
                if (val) {
                    updates.filter = String(val);
                    const activeId = currentClips.find(c => state.currentTime >= c.start && state.currentTime < c.start + c.duration)?.id;
                    if (activeId) {
                        updatedClips = updatedClips.map(c => c.id === activeId ? { ...c, filter: val as FilterType } : c);
                    }
                }
                break;
            case 'set_transition':
                if (val) {
                    const activeId = currentClips.find(c => state.currentTime >= c.start && state.currentTime < c.start + c.duration)?.id;
                    if (activeId) {
                        updatedClips = updatedClips.map(c => c.id === activeId ? { ...c, transitionIn: val as TransitionType } : c);
                    }
                }
                break;
            case 'remove_clip':
                if (targetId && updatedClips.length > 1) {
                    updatedClips = updatedClips.filter(c => c.id !== targetId);
                    updatedClips = recalculateTimeline(updatedClips);
                }
                break;
            case 'trim_clip':
                if (targetId) {
                    const sOffset = actionObj.parameters?.startOffset || 0;
                    const eOffset = actionObj.parameters?.endOffset || 0;
                    updatedClips = updatedClips.map(c => {
                        if (c.id === targetId) {
                            return {
                                ...c,
                                duration: Math.max(0.1, c.duration - sOffset - eOffset),
                                offset: c.offset + sOffset
                            };
                        }
                        return c;
                    });
                    updatedClips = recalculateTimeline(updatedClips);
                }
                break;
            case 'split_clip':
                if (ts !== undefined) {
                    const idx = updatedClips.findIndex(c => ts >= c.start && ts < (c.start + c.duration));
                    if (idx !== -1) {
                        const c = updatedClips[idx];
                        const rel = ts - c.start;
                        const c1 = { ...c, id: generateId(), duration: rel };
                        const c2 = { ...c, id: generateId(), start: ts, duration: c.duration - rel, offset: c.offset + rel };
                        updatedClips.splice(idx, 1, c1, c2);
                        updatedClips = recalculateTimeline(updatedClips);
                        updates.currentTime = ts;
                    }
                }
                break;
            case 'keep_only_highlights':
                // This action keeps only specific time ranges from the original video
                const ranges = actionObj.parameters?.ranges || [];
                const transitionType = (actionObj.parameters?.transition || 'fade') as TransitionType;
                const filterType = (actionObj.parameters?.filter || 'none') as FilterType;

                if (ranges.length > 0 && updatedClips.length > 0) {
                    // Find the original video clip (first video clip as source)
                    const originalClip = updatedClips.find(c => c.type === 'video');
                    if (originalClip) {
                        // Create new clips for each highlight range
                        const highlightClips: TimelineClip[] = [];
                        let currentStart = 0;

                        for (let i = 0; i < ranges.length; i++) {
                            const range = ranges[i];
                            const clipDuration = range.end - range.start;

                            highlightClips.push({
                                id: generateId(),
                                type: 'video',
                                src: originalClip.src,
                                name: `${originalClip.name} - Highlight ${i + 1}`,
                                start: currentStart,
                                duration: clipDuration,
                                offset: range.start, // This makes it play from the correct position
                                filter: filterType !== 'none' ? filterType : undefined,
                                transitionIn: i > 0 ? transitionType : undefined, // Transition between clips
                                transitionInDuration: 0.5
                            });

                            currentStart += clipDuration;
                        }

                        // Replace all clips with just the highlights
                        updatedClips = highlightClips;

                        // Update total duration
                        const newDuration = highlightClips.reduce((acc, c) => acc + c.duration, 0);
                        updates.duration = newDuration;
                        updates.currentTime = 0;
                    }
                }
                break;
        }
        return { newState: { ...state, ...updates }, updatedClips };
    }, []);

    const handleAICommand = async (text: string, overrideClips?: TimelineClip[]) => {
        // Check if this is a "best moments" request
        const lowerText = text.toLowerCase();
        if (lowerText.includes('best moment') || lowerText.includes('highlight') || lowerText.includes('extract best')) {
            handleBestMoments();
            return;
        }

        const activeClips = overrideClips || clips;
        const userMsg: ChatMessage = { id: generateId(), role: 'user', text };

        // We update local state, then call AI. Auto-save will pick up the new user message.
        setMessages(prev => [...prev, userMsg]);
        setIsProcessingAI(true);
        setShowDraftPreview(false);
        setIsViewingDraft(false);

        try {
            const manifest = {
                clips: activeClips.map(c => ({ id: c.id, name: c.name, start: c.start, duration: c.duration, filter: c.filter })),
                currentTime: videoState.currentTime
            };
            const frame = playerRef.current?.getSnapshot();
            const response = await processUserCommand(text, manifest, frame || undefined);

            let currentState = { ...videoState };
            let currentClips = [...activeClips];

            for (const action of response.actions) {
                const res = await applyAIAction(action, currentState, currentClips);
                currentState = res.newState;
                currentClips = res.updatedClips;
            }

            const totalDur = currentClips.reduce((acc, c) => acc + c.duration, 0);
            currentState.duration = totalDur;

            setVideoState(currentState);
            setClips(currentClips);
            setMessages(prev => [...prev, { id: generateId(), role: 'model', text: response.reply }]);

            if (response.actions.length > 2) {
                setShowDraftPreview(true);
                setIsViewingDraft(true);
            }
        } catch (e) {
            console.error("AI command failed:", e);
            setMessages(prev => [...prev, { id: generateId(), role: 'model', text: "I hit a snag trying to edit your video. Can you try rephrasing?" }]);
        }
        finally {
            setIsProcessingAI(false);
        }
    };

    const handleBestMoments = async () => {
        if (clips.length === 0) return;

        // Find the first video clip
        const videoClip = clips.find(c => c.type === 'video');
        if (!videoClip) {
            setMessages(prev => [...prev, {
                id: generateId(),
                role: 'model',
                text: "I need a video clip to analyze. Please upload a video first!"
            }]);
            return;
        }

        setIsAnalyzingMoments(true);
        setAnalysisProgress(0);
        setAnalysisStatus("Preparing video analysis...");

        // Add user message
        setMessages(prev => [...prev, {
            id: generateId(),
            role: 'user',
            text: "Extract the best moments and create a 30-second highlight reel"
        }]);

        try {
            // Create a temporary video element for analysis
            const tempVideo = document.createElement('video');
            tempVideo.src = videoClip.src;
            tempVideo.crossOrigin = "anonymous";
            tempVideo.preload = "metadata";

            await new Promise<void>((resolve, reject) => {
                tempVideo.onloadedmetadata = () => resolve();
                tempVideo.onerror = () => reject(new Error("Failed to load video"));
            });

            // Check if video is long enough
            if (tempVideo.duration < 60) {
                setMessages(prev => [...prev, {
                    id: generateId(),
                    role: 'model',
                    text: `Your video is only ${Math.round(tempVideo.duration)} seconds long. Best Moments works best with videos over 1 minute. Try the Auto-Draft feature instead!`
                }]);
                setIsAnalyzingMoments(false);
                return;
            }

            // Run the analysis
            const result = await extractBestMoments(
                tempVideo,
                { targetDuration: 30 },
                (progress, status) => {
                    setAnalysisProgress(progress);
                    setAnalysisStatus(status);
                }
            );

            // Apply the edit actions
            let currentState = { ...videoState };
            let currentClips = [...clips];

            for (const action of result.actions) {
                const res = await applyAIAction(action, currentState, currentClips);
                currentState = res.newState;
                currentClips = res.updatedClips;
            }

            const totalDur = currentClips.reduce((acc, c) => acc + c.duration, 0);
            currentState.duration = totalDur;

            setVideoState(currentState);
            setClips(currentClips);

            // Add success message
            setMessages(prev => [...prev, {
                id: generateId(),
                role: 'model',
                text: `🌟 ${result.summary}\n\nI've created a highlight reel with the best moments! The timeline has been updated with ${result.moments.filter(m => m.interestScore >= 7).length} top moments. Click Play to preview!`
            }]);

            setShowDraftPreview(true);
            setIsViewingDraft(true);

        } catch (error: any) {
            console.error("Best moments analysis failed:", error);
            setMessages(prev => [...prev, {
                id: generateId(),
                role: 'model',
                text: `I encountered an error while analyzing your video: ${error.message || "Unknown error"}. Please try again.`
            }]);
        } finally {
            setIsAnalyzingMoments(false);
            setAnalysisProgress(0);
            setAnalysisStatus("");
        }
    };

    const handleGenerateSubtitles = async () => {
        if (clips.length === 0) return;

        // Find the first video clip
        const videoClip = clips.find(c => c.type === 'video');
        if (!videoClip) {
            setMessages(prev => [...prev, {
                id: generateId(),
                role: 'model',
                text: "I need a video clip to generate subtitles. Please upload a video first!"
            }]);
            return;
        }

        setIsGeneratingSubtitles(true);
        setSubtitleProgress(0);
        setSubtitleStatus("Preparing video analysis...");

        // Add user message
        setMessages(prev => [...prev, {
            id: generateId(),
            role: 'user',
            text: "Generate automatic subtitles for this video"
        }]);

        try {
            // Create a temporary video element for analysis
            const tempVideo = document.createElement('video');
            tempVideo.src = videoClip.src;
            tempVideo.crossOrigin = "anonymous";
            tempVideo.preload = "metadata";

            await new Promise<void>((resolve, reject) => {
                tempVideo.onloadedmetadata = () => resolve();
                tempVideo.onerror = () => reject(new Error("Failed to load video"));
            });

            // Run the subtitle generation
            const result = await generateSubtitles(
                tempVideo,
                {},
                (progress, status) => {
                    setSubtitleProgress(progress);
                    setSubtitleStatus(status);
                }
            );

            // Add the generated subtitles to existing subtitles
            setSubtitles(prev => [...prev, ...result.subtitles]);

            // Add success message
            setMessages(prev => [...prev, {
                id: generateId(),
                role: 'model',
                text: `✨ ${result.summary}\n\nI've added ${result.subtitles.length} subtitles to your video. Play the video to see them!`
            }]);

        } catch (error: any) {
            console.error("Subtitle generation failed:", error);
            setMessages(prev => [...prev, {
                id: generateId(),
                role: 'model',
                text: `I encountered an error while generating subtitles: ${error.message || "Unknown error"}. Please try again.`
            }]);
        } finally {
            setIsGeneratingSubtitles(false);
            setSubtitleProgress(0);
            setSubtitleStatus("");
        }
    };

    const startPreview = () => {
        setVideoState(prev => ({
            ...prev,
            currentTime: 0,
            isPlaying: true
        }));
        setShowDraftPreview(false);
    };

    const handleExport = () => {
        if (clips.length === 0) return;
        setIsExporting(true);
        setExportProgress(0);
        recordedChunksRef.current = [];
        setVideoState(prev => ({ ...prev, currentTime: 0, isPlaying: true }));

        const stream = playerRef.current?.getStream();
        if (stream) {
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) recordedChunksRef.current.push(e.data);
            };
            recorder.start();
            mediaRecorderRef.current = recorder;
        }
    };

    const handleFinalizeExport = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();

            setTimeout(() => {
                const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `${projectName || 'Lumina_Edit'}.webm`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                setIsExporting(false);
                setExportProgress(0);
            }, 500);
        }
    };

    const handleDropPreset = (clipId: string, type: 'filter' | 'transition', value: string) => {
        setClips(prevClips => prevClips.map(c => {
            if (c.id === clipId) {
                if (type === 'filter') return { ...c, filter: value as FilterType };
                if (type === 'transition') return { ...c, transitionIn: value as TransitionType };
            }
            return c;
        }));
    };

    const filterConfig: { id: FilterType; icon: any; color: string; label: string }[] = [
        { id: 'grayscale', icon: Moon, color: 'text-gray-400', label: 'B&W' },
        { id: 'sepia', icon: Coffee, color: 'text-amber-600', label: 'Sepia' },
        { id: 'vintage', icon: Film, color: 'text-yellow-600', label: 'Vintage' },
        { id: 'cyberpunk', icon: Zap, color: 'text-purple-400', label: 'Cyber' },
        { id: 'warm', icon: Sun, color: 'text-orange-400', label: 'Warm' },
        { id: 'invert', icon: Repeat, color: 'text-blue-400', label: 'Invert' },
        { id: 'blur', icon: Layers, color: 'text-gray-300', label: 'Blur' },
        { id: 'dramatic', icon: Flame, color: 'text-red-500', label: 'Drama' },
    ];

    const transitionConfig: { id: TransitionType; icon: any; color: string; label: string }[] = [
        { id: 'fade', icon: Minimize2, color: 'text-blue-500', label: 'Fade' },
        { id: 'slide-left', icon: ArrowLeftFromLine, color: 'text-green-500', label: 'Left' },
        { id: 'slide-right', icon: ArrowRightFromLine, color: 'text-green-500', label: 'Right' },
        { id: 'zoom-in', icon: Maximize, color: 'text-yellow-500', label: 'Z-In' },
        { id: 'zoom-out', icon: Minimize, color: 'text-yellow-500', label: 'Z-Out' },
        { id: 'blur-dissolve', icon: Wind, color: 'text-indigo-400', label: 'Disslv' },
    ];

    const activeClip = clips.find(c => videoState.currentTime >= c.start && videoState.currentTime <= (c.start + c.duration + 0.01));

    return (
        <div className="flex flex-col h-screen bg-dark-bg text-gray-100 overflow-hidden font-sans">
            <header className="h-14 bg-dark-surface border-b border-dark-border flex items-center justify-between px-6 z-40 shadow-xl">
                <div className="flex items-center gap-6">
                    <button onClick={onBack} className="p-2 text-gray-400 hover:text-white transition-all hover:bg-gray-800 rounded-lg">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-lumina-500 font-bold uppercase tracking-widest">Lumina Studio</span>
                        <input
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            className="bg-transparent border-none text-sm font-semibold focus:outline-none focus:text-lumina-400 transition-colors cursor-text"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-xs text-gray-500 mr-2 flex items-center gap-2">
                        {saveStatus === 'saving' && <><Loader2 size={12} className="animate-spin text-lumina-400" /> Syncing</>}
                        {saveStatus === 'saved' && <><CheckCircle2 size={12} className="text-green-500" /> Saved</>}
                        {saveStatus === 'idle' && <span className="opacity-0">.</span>}
                    </div>

                    {/* Playback and Edit Controls */}
                    <div className="flex items-center gap-1 mr-2 border-r border-gray-700 pr-3">
                        <button
                            onClick={handleTogglePlay}
                            disabled={clips.length === 0 || isExporting}
                            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all disabled:opacity-50"
                            title={videoState.isPlaying ? "Pause" : "Play"}
                        >
                            {videoState.isPlaying ? <Pause size={18} /> : <Play size={18} />}
                        </button>
                        <button
                            onClick={handleUndo}
                            disabled={historyIndex <= 0 || isExporting}
                            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all disabled:opacity-50"
                            title="Undo"
                        >
                            <Undo2 size={18} />
                        </button>
                        <button
                            onClick={handleRedo}
                            disabled={historyIndex >= history.length - 1 || isExporting}
                            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all disabled:opacity-50"
                            title="Redo"
                        >
                            <Redo2 size={18} />
                        </button>
                    </div>

                    <button
                        onClick={() => handleAICommand("Generate a professional first draft of this project.")}
                        disabled={isProcessingAI || clips.length === 0 || isExporting || isAnalyzingMoments || isGeneratingSubtitles}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-lumina-600 hover:from-purple-500 hover:to-lumina-500 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 shadow-lg"
                    >
                        {isProcessingAI ? <Loader2 size={16} className="animate-spin" /> : <Clapperboard size={16} />}
                        Auto-Draft
                    </button>

                    <button
                        onClick={handleBestMoments}
                        disabled={isProcessingAI || clips.length === 0 || isExporting || isAnalyzingMoments || isGeneratingSubtitles}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 shadow-lg"
                    >
                        {isAnalyzingMoments ? <Loader2 size={16} className="animate-spin" /> : <Stars size={16} />}
                        Best Moments
                    </button>

                    <button
                        onClick={handleGenerateSubtitles}
                        disabled={isProcessingAI || clips.length === 0 || isExporting || isAnalyzingMoments || isGeneratingSubtitles}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 shadow-lg"
                    >
                        {isGeneratingSubtitles ? <Loader2 size={16} className="animate-spin" /> : <Type size={16} />}
                        Subtitles
                    </button>

                    <input type="file" ref={fileInputRef} className="hidden" multiple accept="video/*,image/*" onChange={handleFileUpload} />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoadingMedia || isExporting}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                    >
                        <Upload size={16} /> Import
                    </button>

                    <button
                        onClick={() => persistProject(videoState, clips, subtitles, messages, projectName)}
                        disabled={isExporting || saveStatus === 'saving'}
                        className="flex items-center gap-2 px-6 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-bold transition-all shadow-lg disabled:opacity-50"
                    >
                        <Save size={16} /> Save Now
                    </button>

                    <button
                        onClick={handleExport}
                        disabled={isExporting || clips.length === 0}
                        className="flex items-center gap-2 px-6 py-2 bg-lumina-600 hover:bg-lumina-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-lumina-900/20 disabled:opacity-50"
                    >
                        <Download size={16} /> Export
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden relative">
                <div className="w-20 flex flex-col items-center py-6 bg-dark-surface border-r border-dark-border z-30 overflow-y-auto no-scrollbar shadow-inner gap-8">
                    <div className="flex flex-col items-center gap-5 w-full">
                        <span className="text-[7px] text-gray-500 font-black uppercase tracking-[0.25em] mb-2">Filters</span>
                        {filterConfig.map((f) => {
                            const Icon = f.icon;
                            return (
                                <div
                                    key={f.id}
                                    draggable={!isExporting}
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('preset', JSON.stringify({ type: 'filter', value: f.id }));
                                        e.dataTransfer.effectAllowed = 'copy';
                                    }}
                                    className={`w-12 flex flex-col items-center gap-1 group transition-all ${isExporting ? 'opacity-30 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing hover:scale-110'}`}
                                    title={f.label}
                                >
                                    <div className={`w-10 h-10 rounded-xl bg-gray-900 border border-white/5 flex items-center justify-center ${f.color} group-hover:bg-white/5 group-hover:border-white/20 shadow-lg transition-all`}>
                                        <Icon size={20} />
                                    </div>
                                    <span className="text-[8px] text-gray-600 font-bold uppercase truncate w-full text-center group-hover:text-gray-400">{f.label}</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="w-8 h-px bg-white/5" />

                    <div className="flex flex-col items-center gap-5 w-full">
                        <span className="text-[7px] text-gray-500 font-black uppercase tracking-[0.25em] mb-2">Transitions</span>
                        {transitionConfig.map((t) => {
                            const Icon = t.icon;
                            return (
                                <div
                                    key={t.id}
                                    draggable={!isExporting}
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('preset', JSON.stringify({ type: 'transition', value: t.id }));
                                        e.dataTransfer.effectAllowed = 'copy';
                                    }}
                                    className={`w-12 flex flex-col items-center gap-1 group transition-all ${isExporting ? 'opacity-30 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing hover:scale-110'}`}
                                    title={t.label}
                                >
                                    <div className={`w-10 h-10 rounded-xl bg-gray-900 border border-white/5 flex items-center justify-center ${t.color} group-hover:bg-white/5 group-hover:border-white/20 shadow-lg transition-all`}>
                                        <Icon size={20} />
                                    </div>
                                    <span className="text-[8px] text-gray-600 font-bold uppercase truncate w-full text-center group-hover:text-gray-400">{t.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <AIAssistant messages={messages} onSendMessage={handleAICommand} isProcessing={isProcessingAI} onPreview={startPreview} />

                <div className="flex-1 flex flex-col bg-[#0f0f12] relative">
                    <div className="flex-1 flex items-stretch overflow-hidden">
                        <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
                            <div className="w-full max-w-5xl aspect-video bg-black rounded-xl relative overflow-hidden shadow-2xl border border-white/5 ring-1 ring-white/10">
                                {isViewingDraft && !isExporting && (
                                    <div className="absolute top-4 left-4 z-40 bg-purple-600/90 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-2 shadow-lg backdrop-blur-md border border-white/20 animate-pulse">
                                        <Sparkles size={12} />
                                        Viewing Draft Version
                                    </div>
                                )}

                                {isLoadingMedia && (
                                    <div className="absolute inset-0 bg-black/90 z-50 flex flex-col items-center justify-center gap-4 backdrop-blur-md">
                                        <Loader2 className="animate-spin text-lumina-400" size={32} />
                                        <p className="text-xs text-lumina-400 font-bold tracking-[0.3em] uppercase">Loading Workspace</p>
                                    </div>
                                )}

                                {activeClip ? (
                                    <VideoPlayer
                                        ref={playerRef} src={activeClip.src} type={activeClip.type}
                                        videoState={videoState} subtitles={subtitles}
                                        timelineTime={videoState.currentTime}
                                        clipStart={activeClip.start}
                                        clipDuration={activeClip.duration}
                                        clipOffset={activeClip.offset}
                                        clipFilter={activeClip.filter}
                                        transitionIn={activeClip.transitionIn}
                                        transitionOut={activeClip.transitionOut}
                                        onTogglePlay={() => handleUpdateState({ isPlaying: !videoState.isPlaying })}
                                        onEnded={() => handleUpdateState({ isPlaying: false })}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-700 gap-6">
                                        <div className="p-10 bg-gray-900/50 rounded-full border border-dashed border-white/10">
                                            <Sparkles size={48} className="opacity-20 text-lumina-500" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-bold text-gray-400">Project Canvas</p>
                                            <p className="text-xs text-gray-600 uppercase tracking-widest mt-1">Upload files to begin editing</p>
                                        </div>
                                    </div>
                                )}

                                {isExporting && (
                                    <div className="absolute inset-0 bg-black/80 z-[60] flex flex-col items-center justify-center backdrop-blur-xl animate-in fade-in duration-500">
                                        <div className="w-full max-w-md p-8 bg-dark-surface border border-lumina-500/30 rounded-3xl shadow-[0_0_100px_rgba(14,165,233,0.15)] relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-lumina-500/5 to-transparent h-20 w-full animate-[scan_2s_linear_infinite]" />

                                            <div className="flex items-center gap-4 mb-8">
                                                <div className="w-16 h-16 rounded-2xl bg-lumina-500/20 flex items-center justify-center text-lumina-400 border border-lumina-500/20">
                                                    <FileVideo size={32} className="animate-pulse" />
                                                </div>
                                                <div>
                                                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Rendering Studio</h3>
                                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">Mastering Export Profile</p>
                                                </div>
                                            </div>

                                            <div className="space-y-6">
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-[10px] text-lumina-400 font-black uppercase tracking-widest">
                                                        <span>Encoding Frames</span>
                                                        <span>{Math.round(exportProgress)}%</span>
                                                    </div>
                                                    <div className="h-3 bg-gray-900 rounded-full overflow-hidden border border-white/5 p-0.5">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-lumina-600 to-purple-600 rounded-full transition-all duration-300"
                                                            style={{ width: `${exportProgress}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="p-4 bg-black/40 rounded-2xl border border-white/5 flex items-center gap-3">
                                                        <Cpu size={16} className="text-gray-500" />
                                                        <div className="flex flex-col">
                                                            <span className="text-[8px] text-gray-600 font-bold uppercase">Hardware Accel</span>
                                                            <span className="text-[10px] text-green-500 font-black uppercase">Active</span>
                                                        </div>
                                                    </div>
                                                    <div className="p-4 bg-black/40 rounded-2xl border border-white/5 flex items-center gap-3">
                                                        <RotateCcw size={16} className="text-gray-500 animate-spin-slow" />
                                                        <div className="flex flex-col">
                                                            <span className="text-[8px] text-gray-600 font-bold uppercase">Frame Buffer</span>
                                                            <span className="text-[10px] text-white font-black uppercase">Syncing</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <p className="text-center text-[10px] text-gray-600 italic">Please keep this tab open until the download starts...</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {isAnalyzingMoments && (
                                    <div className="absolute inset-0 bg-black/80 z-[60] flex flex-col items-center justify-center backdrop-blur-xl animate-in fade-in duration-500">
                                        <div className="w-full max-w-md p-8 bg-dark-surface border border-amber-500/30 rounded-3xl shadow-[0_0_100px_rgba(245,158,11,0.15)] relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-500/5 to-transparent h-20 w-full animate-[scan_2s_linear_infinite]" />

                                            <div className="flex items-center gap-4 mb-8">
                                                <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/20">
                                                    <Stars size={32} className="animate-pulse" />
                                                </div>
                                                <div>
                                                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Best Moments</h3>
                                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">AI Video Analysis</p>
                                                </div>
                                            </div>

                                            <div className="space-y-6">
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-[10px] text-amber-400 font-black uppercase tracking-widest">
                                                        <span>{analysisStatus || "Analyzing..."}</span>
                                                        <span>{Math.round(analysisProgress)}%</span>
                                                    </div>
                                                    <div className="h-3 bg-gray-900 rounded-full overflow-hidden border border-white/5 p-0.5">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-amber-500 to-orange-600 rounded-full transition-all duration-300"
                                                            style={{ width: `${analysisProgress}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="p-4 bg-black/40 rounded-2xl border border-white/5 flex items-center gap-3">
                                                        <Sparkles size={16} className="text-amber-500 animate-pulse" />
                                                        <div className="flex flex-col">
                                                            <span className="text-[8px] text-gray-600 font-bold uppercase">AI Engine</span>
                                                            <span className="text-[10px] text-green-500 font-black uppercase">Active</span>
                                                        </div>
                                                    </div>
                                                    <div className="p-4 bg-black/40 rounded-2xl border border-white/5 flex items-center gap-3">
                                                        <Film size={16} className="text-gray-500" />
                                                        <div className="flex flex-col">
                                                            <span className="text-[8px] text-gray-600 font-bold uppercase">Frame Analysis</span>
                                                            <span className="text-[10px] text-white font-black uppercase">Running</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <p className="text-center text-[10px] text-gray-600 italic">Scanning video for the most exciting moments...</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {isGeneratingSubtitles && (
                                    <div className="absolute inset-0 bg-black/80 z-[60] flex flex-col items-center justify-center backdrop-blur-xl animate-in fade-in duration-500">
                                        <div className="w-full max-w-md p-8 bg-dark-surface border border-cyan-500/30 rounded-3xl shadow-[0_0_100px_rgba(6,182,212,0.15)] relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent h-20 w-full animate-[scan_2s_linear_infinite]" />

                                            <div className="flex items-center gap-4 mb-8">
                                                <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 border border-cyan-500/20">
                                                    <Type size={32} className="animate-pulse" />
                                                </div>
                                                <div>
                                                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Subtitles</h3>
                                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">AI Generation</p>
                                                </div>
                                            </div>

                                            <div className="space-y-6">
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-[10px] text-cyan-400 font-black uppercase tracking-widest">
                                                        <span>{subtitleStatus || "Generating..."}</span>
                                                        <span>{Math.round(subtitleProgress)}%</span>
                                                    </div>
                                                    <div className="h-3 bg-gray-900 rounded-full overflow-hidden border border-white/5 p-0.5">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full transition-all duration-300"
                                                            style={{ width: `${subtitleProgress}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="p-4 bg-black/40 rounded-2xl border border-white/5 flex items-center gap-3">
                                                        <Sparkles size={16} className="text-cyan-500 animate-pulse" />
                                                        <div className="flex flex-col">
                                                            <span className="text-[8px] text-gray-600 font-bold uppercase">AI Engine</span>
                                                            <span className="text-[10px] text-green-500 font-black uppercase">Active</span>
                                                        </div>
                                                    </div>
                                                    <div className="p-4 bg-black/40 rounded-2xl border border-white/5 flex items-center gap-3">
                                                        <Type size={16} className="text-gray-500" />
                                                        <div className="flex flex-col">
                                                            <span className="text-[8px] text-gray-600 font-bold uppercase">Text Detection</span>
                                                            <span className="text-[10px] text-white font-black uppercase">Running</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <p className="text-center text-[10px] text-gray-600 italic">Analyzing video frames and generating subtitles...</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {showDraftPreview && !videoState.isPlaying && !isExporting && (
                                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-50 animate-in fade-in duration-300 backdrop-blur-md">
                                        <div className="bg-dark-surface border border-lumina-500/40 p-10 rounded-3xl shadow-2xl text-center max-w-sm transform scale-100 transition-transform">
                                            <div className="w-20 h-20 bg-lumina-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-lumina-500/20 shadow-[0_0_40px_rgba(14,165,233,0.2)]">
                                                <Clapperboard className="text-lumina-400" size={36} />
                                            </div>
                                            <h3 className="text-2xl font-black text-white mb-3">Draft Generated!</h3>
                                            <p className="text-gray-400 text-sm mb-8 leading-relaxed">I've performed professional cuts, trims, and applied cinematic filters. Ready to review?</p>
                                            <div className="flex flex-col gap-3">
                                                <button
                                                    onClick={startPreview}
                                                    className="w-full py-4 bg-lumina-600 hover:bg-lumina-500 text-white rounded-xl font-black uppercase tracking-widest shadow-xl shadow-lumina-900/40 flex items-center justify-center gap-3 transition-all active:scale-95"
                                                >
                                                    <Play size={20} fill="white" />
                                                    Play Review
                                                </button>
                                                <button
                                                    onClick={() => setShowDraftPreview(false)}
                                                    className="w-full py-3 text-gray-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest"
                                                >
                                                    Modify Manually
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <ControlPanel
                            state={videoState}
                            onUpdate={handleUpdateState}
                            onCommit={() => { }} // Auto-save handled by effect now
                        />
                    </div>

                    <Timeline
                        duration={Math.max(...clips.map(c => c.start + c.duration), 10)}
                        currentTime={videoState.currentTime}
                        clips={clips} subtitles={subtitles}
                        onSeek={(t) => handleUpdateState({ currentTime: t })}
                        onDropPreset={handleDropPreset}
                    />
                </div>
            </div>
            <style>{`
        @keyframes scan {
            from { transform: translateY(-100%); }
            to { transform: translateY(400%); }
        }
        .animate-spin-slow {
            animation: spin 3s linear infinite;
        }
      `}</style>
        </div>
    );
};

export default Editor;
