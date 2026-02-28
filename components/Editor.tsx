import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    ArrowLeft, Save, Plus, Loader2, Upload, CheckCircle2, Wand2, Sparkles,
    Play, Pause, Scissors, Type, LayoutTemplate, RotateCcw, Clapperboard,
    Moon, Coffee, Film, Zap, Sun, Repeat, Layers, Flame,
    Minimize2, ArrowLeftFromLine, ArrowRightFromLine, Maximize, Minimize, Wind,
    Download, FileVideo, Cpu, Stars, Undo2, Redo2, X, Check, Mic, StopCircle, Music, Image as ImageIcon, RefreshCw
} from 'lucide-react';
import VideoPlayer, { VideoPlayerRef } from './VideoPlayer';
import Timeline from './Timeline';
import ControlPanel from './ControlPanel';
import AIAssistant from './AIAssistant';
import { VideoState, ChatMessage, TimelineClip, Project, AIAction, Subtitle, FilterType, TransitionType, AudioClip, AppSettings, ExportFormat } from '../types';
import { processUserCommand } from '../services/pythonBackendClient';
import { saveProject } from '../services/db';
import { uploadMediaFile, getMediaFileURL, uploadExportedVideo } from '../services/storageService';
import { extractBestMoments } from '../services/pythonBackendClient';
import { generateSubtitles } from '../services/pythonBackendClient';

const generateId = () => Math.random().toString(36).substr(2, 9);

const calculateProjectDuration = (videoClips: TimelineClip[], audioTracks: AudioClip[]) => {
    const maxVideoEnd = videoClips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);
    const maxAudioEnd = audioTracks.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);
    return Math.max(maxVideoEnd, maxAudioEnd, 0);
};

type ThumbnailPlatform = 'youtube' | 'instagram' | 'tiktok' | 'facebook' | 'x' | 'linkedin';
const THUMBNAIL_PRESETS: Record<ThumbnailPlatform, { label: string; width: number; height: number }> = {
    youtube: { label: 'YouTube', width: 1280, height: 720 },
    instagram: { label: 'Instagram', width: 1080, height: 1080 },
    tiktok: { label: 'TikTok', width: 1080, height: 1920 },
    facebook: { label: 'Facebook', width: 1200, height: 630 },
    x: { label: 'X', width: 1600, height: 900 },
    linkedin: { label: 'LinkedIn', width: 1200, height: 627 },
};

interface EditorProps {
    project: Project;
    appSettings: AppSettings;
    onBack: () => void;
}

const Editor: React.FC<EditorProps> = ({ project, appSettings, onBack }) => {
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
    const [showExportModal, setShowExportModal] = useState(false);
    const [selectedExportFormat, setSelectedExportFormat] = useState<ExportFormat>(appSettings.defaultExportFormat || 'mp4');
    const [showThumbnailStudio, setShowThumbnailStudio] = useState(false);
    const [thumbnailPlatform, setThumbnailPlatform] = useState<ThumbnailPlatform>('youtube');
    const [thumbnailBaseFrame, setThumbnailBaseFrame] = useState<string | null>(null);
    const [thumbnailPreview, setThumbnailPreview] = useState<string>(project.thumbnail || '');
    const [thumbnailTitle, setThumbnailTitle] = useState(project.name || 'NEW VIDEO');
    const [thumbnailTextColor, setThumbnailTextColor] = useState('#ffffff');
    const [thumbnailTextSize, setThumbnailTextSize] = useState(56);
    const [thumbnailTextY, setThumbnailTextY] = useState(82);
    const [thumbnailBrightness, setThumbnailBrightness] = useState(110);
    const [thumbnailContrast, setThumbnailContrast] = useState(120);
    const [thumbnailSaturation, setThumbnailSaturation] = useState(120);
    const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
    const [thumbnailStatus, setThumbnailStatus] = useState('');
    const [audioClips, setAudioClips] = useState<AudioClip[]>(project.audioClips || []);
    const [selectedAudioClipId, setSelectedAudioClipId] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [showRecordingModal, setShowRecordingModal] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderAudioRef = useRef<MediaRecorder | null>(null);
    const recordingTimerRef = useRef<number | null>(null);
    const recordingStartTimeRef = useRef<number>(0);
    const recordingStartPositionRef = useRef<number>(0);
    const discardRecordingRef = useRef(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const recordedAudioChunksRef = useRef<Blob[]>([]);

    useEffect(() => {
        setSelectedExportFormat(appSettings.defaultExportFormat || 'mp4');
    }, [appSettings.defaultExportFormat]);

    const wrapTextLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
        const words = text.trim().split(/\s+/);
        const lines: string[] = [];
        let current = '';

        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (ctx.measureText(candidate).width <= maxWidth) {
                current = candidate;
            } else {
                if (current) lines.push(current);
                current = word;
            }
        }
        if (current) lines.push(current);
        return lines.slice(0, 3);
    };

    const renderThumbnailPreview = useCallback(async () => {
        if (!thumbnailBaseFrame) return;

        const preset = THUMBNAIL_PRESETS[thumbnailPlatform];
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Failed to load thumbnail frame'));
            image.src = thumbnailBaseFrame;
        });

        const canvas = document.createElement('canvas');
        canvas.width = preset.width;
        canvas.height = preset.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const scale = Math.max(preset.width / img.width, preset.height / img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        const dx = (preset.width - drawWidth) / 2;
        const dy = (preset.height - drawHeight) / 2;

        ctx.filter = `brightness(${thumbnailBrightness}%) contrast(${thumbnailContrast}%) saturate(${thumbnailSaturation}%)`;
        ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
        ctx.filter = 'none';

        const gradient = ctx.createLinearGradient(0, preset.height * 0.35, 0, preset.height);
        gradient.addColorStop(0, 'rgba(0,0,0,0.0)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.72)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, preset.width, preset.height);

        const maxTextWidth = preset.width * 0.86;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${thumbnailTextSize}px Inter, sans-serif`;
        const lines = wrapTextLines(ctx, thumbnailTitle || projectName || 'NEW VIDEO', maxTextWidth);
        const baseY = (thumbnailTextY / 100) * preset.height;
        const lineHeight = thumbnailTextSize * 1.05;
        const blockHeight = lines.length * lineHeight;
        const startY = baseY - (blockHeight / 2) + (lineHeight / 2);

        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = thumbnailTextColor;
        lines.forEach((line, index) => {
            ctx.fillText(line.toUpperCase(), preset.width / 2, startY + index * lineHeight);
        });

        setThumbnailPreview(canvas.toDataURL('image/jpeg', 0.92));
    }, [thumbnailBaseFrame, thumbnailPlatform, thumbnailBrightness, thumbnailContrast, thumbnailSaturation, thumbnailTextColor, thumbnailTextSize, thumbnailTextY, thumbnailTitle, projectName]);

    useEffect(() => {
        if (!thumbnailBaseFrame) return;
        void renderThumbnailPreview();
    }, [thumbnailBaseFrame, thumbnailPlatform, thumbnailBrightness, thumbnailContrast, thumbnailSaturation, thumbnailTextColor, thumbnailTextSize, thumbnailTextY, thumbnailTitle, renderThumbnailPreview]);

    // History state for undo/redo
    interface HistoryState {
        clips: TimelineClip[];
        audioClips: AudioClip[];
        subtitles: Subtitle[];
    }
    const [history, setHistory] = useState<HistoryState[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const isUndoRedoAction = useRef(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const playerRef = useRef<VideoPlayerRef>(null);
    const requestRef = useRef<number>(null);
    const lastTimeRef = useRef<number>(null);
    const currentTimeRef = useRef<number>(0);  // Track time without state updates
    const lastStateUpdateRef = useRef<number>(0);  // Throttle state updates
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const audioElementsRef = useRef<Record<string, HTMLAudioElement | null>>({});
    const exportAudioContextRef = useRef<AudioContext | null>(null);
    const exportMediaStreamRef = useRef<MediaStream | null>(null);
    const thumbnailPreviewWindowRef = useRef<Window | null>(null);

    // Persistent saving logic
    const persistProject = useCallback(async (
        state: VideoState,
        currentClips: TimelineClip[],
        currentAudioClips: AudioClip[],
        currentSubs: Subtitle[],
        currentMessages: ChatMessage[],
        name: string
    ) => {
        setSaveStatus('saving');
        try {
            // Keep backend URLs (they're permanent), only strip blob URLs
            const clipsForDb = currentClips.map(({ src, ...rest }) => ({
                ...rest,
                src: src?.startsWith('blob:') ? '' : (src || '')
            }));
            const audioClipsForDb = currentAudioClips.map(({ src, ...rest }) => ({
                ...rest,
                src: src?.startsWith('blob:') ? '' : (src || '')
            }));
            await saveProject(project.id, {
                videoState: state,
                clips: clipsForDb,
                audioClips: audioClipsForDb,
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

                        // If the clip already has a valid backend URL saved, use it directly
                        if (c.src && (c.src.includes('localhost:8000') || c.src.includes('127.0.0.1:8000'))) {
                            console.log(`Using saved backend URL for ${c.id}`);
                            restoredClips.push({ ...c });
                        } else {
                            // Otherwise, try to fetch from the backend by ID
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
                setAudioClips(project.audioClips || []);
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
                        text: `⚠️ ${missingFiles} media file(s) couldn't be restored from storage. Please re-import your video files to continue editing.`
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
            persistProject(videoState, clips, audioClips, subtitles, messages, projectName);
        }, 1500); // Save after 1.5s of inactivity

        return () => clearTimeout(timer);
    }, [clips, audioClips, subtitles, messages, projectName,
        // Only watch specific parts of videoState to avoid saving on every frame of playback
        videoState.filter, videoState.volume, videoState.playbackRate,
        videoState.brightness, videoState.contrast, videoState.saturation,
        videoState.fadeIn, videoState.fadeOut, videoState.isAudioEnhanced,
        persistProject]);

    useEffect(() => {
        const combinedDuration = calculateProjectDuration(clips, audioClips);
        setVideoState(prev => {
            const clampedCurrentTime = Math.min(prev.currentTime, combinedDuration);
            const durationChanged = Math.abs(prev.duration - combinedDuration) > 0.01;
            const timeChanged = Math.abs(prev.currentTime - clampedCurrentTime) > 0.01;
            if (!durationChanged && !timeChanged) return prev;
            return {
                ...prev,
                duration: combinedDuration,
                currentTime: clampedCurrentTime
            };
        });
    }, [clips, audioClips]);

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
            audioClips: JSON.parse(JSON.stringify(audioClips)),
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
    }, [clips, audioClips, subtitles, isLoadingMedia]);

    // Undo function
    const handleUndo = useCallback(() => {
        if (historyIndex <= 0) return;

        isUndoRedoAction.current = true;
        const prevState = history[historyIndex - 1];
        setClips(prevState.clips);
        setAudioClips(prevState.audioClips);
        setSubtitles(prevState.subtitles);
        setHistoryIndex(prev => prev - 1);

        const totalDur = calculateProjectDuration(prevState.clips, prevState.audioClips);
        setVideoState(prev => ({ ...prev, duration: totalDur }));
    }, [history, historyIndex]);

    // Redo function  
    const handleRedo = useCallback(() => {
        if (historyIndex >= history.length - 1) return;

        isUndoRedoAction.current = true;
        const nextState = history[historyIndex + 1];
        setClips(nextState.clips);
        setAudioClips(nextState.audioClips);
        setSubtitles(nextState.subtitles);
        setHistoryIndex(prev => prev + 1);

        const totalDur = calculateProjectDuration(nextState.clips, nextState.audioClips);
        setVideoState(prev => ({ ...prev, duration: totalDur }));
    }, [history, historyIndex]);

    // Toggle play/pause
    const handleTogglePlay = useCallback(() => {
        if (isExporting) return;
        setVideoState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
        lastStateUpdateRef.current = performance.now();  // Reset throttle on manual play/pause
    }, [isExporting]);

    // PLAYBACK TICKER — Optimized for smooth/lag-free playback
    const animate = useCallback((time: number) => {
        if (lastTimeRef.current !== undefined) {
            const deltaTime = (time - lastTimeRef.current) / 1000;
            const nextTime = currentTimeRef.current + (deltaTime * videoState.playbackRate);
            currentTimeRef.current = nextTime;

            // Only update React state every 50ms (instead of every 16ms) to reduce re-renders
            const now = performance.now();
            if (now - lastStateUpdateRef.current > 50) {
                lastStateUpdateRef.current = now;
                
                setVideoState(prev => {
                    if (!prev.isPlaying) return prev;
                    return { ...prev, currentTime: nextTime };
                });
            }

            // Update export progress immediately (it doesn't trigger full re-renders)
            if (isExporting) {
                const safeDuration = Math.max(videoState.duration, 0.001);
                setExportProgress((nextTime / safeDuration) * 100);
            }

            // Check for end of video
            if (nextTime >= videoState.duration) {
                currentTimeRef.current = videoState.duration;
                setVideoState(prev => ({ ...prev, currentTime: prev.duration, isPlaying: false }));
                if (isExporting) handleFinalizeExport();
            }
        }
        lastTimeRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
    }, [videoState.playbackRate, videoState.duration, isExporting]);

    useEffect(() => {
        if (videoState.isPlaying) {
            currentTimeRef.current = videoState.currentTime;
            lastTimeRef.current = performance.now();
            lastStateUpdateRef.current = performance.now();
            requestRef.current = requestAnimationFrame(animate);
        } else {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            lastTimeRef.current = undefined;
            currentTimeRef.current = videoState.currentTime;  // Sync ref with state
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [videoState.isPlaying, videoState.currentTime, animate]);

    const handleUpdateState = (updates: Partial<VideoState>) => {
        if (isExporting) return;
        setVideoState(prev => ({ ...prev, ...updates }));
    };

    useEffect(() => {
        const currentTime = videoState.currentTime;
        const isPlaying = videoState.isPlaying;

        for (const clip of audioClips) {
            const audioEl = audioElementsRef.current[clip.id];
            if (!audioEl) continue;

            const clipStart = clip.start;
            const clipEnd = clip.start + clip.duration;
            const isActive = currentTime >= clipStart && currentTime < clipEnd;
            const targetTime = Math.max(0, (currentTime - clipStart) + (clip.offset ?? 0));
            const expectedVolume = clip.isMuted
                ? 0
                : Math.max(0, Math.min(1, (clip.volume ?? 0.8) * (videoState.volume ?? 1)));

            audioEl.volume = expectedVolume;
            audioEl.playbackRate = videoState.playbackRate;

            if (!isActive) {
                if (!audioEl.paused) audioEl.pause();
                if (Math.abs(audioEl.currentTime) > 0.05) {
                    try {
                        audioEl.currentTime = 0;
                    } catch (err) {
                        // Ignore seek issues while metadata is loading
                    }
                }
                continue;
            }

            const drift = Math.abs(audioEl.currentTime - targetTime);
            if (drift > 0.15) {
                try {
                    audioEl.currentTime = targetTime;
                } catch (err) {
                    // Ignore seek issues while metadata is loading
                }
            }

            if (isPlaying) {
                void audioEl.play().catch(() => {
                    // Browser may block autoplay until user interaction
                });
            } else if (!audioEl.paused) {
                audioEl.pause();
            }
        }
    }, [audioClips, videoState.currentTime, videoState.isPlaying, videoState.playbackRate, videoState.volume]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []) as File[];
        if (files.length === 0) return;

        setIsLoadingMedia(true);
        let updatedClips = [...clips];
        let updatedAudioClips = [...audioClips];

        for (const file of files) {
            const id = generateId();
            const isVideo = file.type.startsWith('video/');
            const isAudio = file.type.startsWith('audio/');
            const isImage = file.type.startsWith('image/');

            let downloadURL: string | undefined;

            // Upload to backend storage
            try {
                downloadURL = await uploadMediaFile(project.id, id, file);
            } catch (uploadErr: any) {
                console.error('Failed to upload file:', uploadErr);
                setMessages(prev => [...prev, {
                    id: generateId(),
                    role: 'model',
                    text: `⚠️ Upload failed for ${file.name}: ${uploadErr.message || 'Unknown error. Check console for details.'}`
                }]);
                continue;
            }

            // Handle Audio Files
            if (isAudio) {
                const duration = await new Promise<number>((resolve) => {
                    const audio = document.createElement('audio');
                    audio.preload = 'metadata';
                    audio.onloadedmetadata = () => {
                        const metadataDuration = audio.duration;
                        resolve(Number.isFinite(metadataDuration) && metadataDuration > 0 ? metadataDuration : 3);
                    };
                    audio.onerror = () => resolve(3);
                    audio.src = URL.createObjectURL(file);
                });

                const newAudioClip: AudioClip = {
                    id,
                    type: 'audio',
                    src: downloadURL || URL.createObjectURL(file),
                    name: file.name,
                    start: videoState.currentTime,  // Start at current timeline position
                    duration,
                    offset: 0,
                    volume: 0.8
                };
                updatedAudioClips.push(newAudioClip);
                continue;
            }

            // Handle Video/Image Files
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

            const newClip: TimelineClip = {
                id,
                type: isVideo ? 'video' : isImage ? 'image' : 'video',
                src: downloadURL || URL.createObjectURL(file),
                name: file.name,
                start: updatedClips.reduce((acc, c) => acc + c.duration, 0),
                duration,
                offset: 0
            };
            updatedClips.push(newClip);
        }

        setClips(updatedClips);
        setAudioClips(updatedAudioClips);
        const totalDuration = calculateProjectDuration(updatedClips, updatedAudioClips);
        setVideoState(prev => ({ ...prev, duration: totalDuration }));
        setIsLoadingMedia(false);
        if (fileInputRef.current) fileInputRef.current.value = '';

        if (clips.length === 0 && updatedClips.length > 0) {
            handleAICommand("Generate a human-quality first edit draft for this raw footage.", updatedClips);
        }
    };

    // Voice Recording Functions
    const handleStartRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
            const recorder = preferredMime
                ? new MediaRecorder(stream, { mimeType: preferredMime })
                : new MediaRecorder(stream);
            
            recordedAudioChunksRef.current = [];
            discardRecordingRef.current = false;
            recordingStartPositionRef.current = videoState.currentTime;
            recordingStartTimeRef.current = performance.now();
            recorder.ondataavailable = (e: BlobEvent) => {
                if (e.data.size > 0) recordedAudioChunksRef.current.push(e.data);
            };

            recorder.onstop = async () => {
                const elapsedSeconds = Math.max(0.1, (performance.now() - recordingStartTimeRef.current) / 1000);
                if (discardRecordingRef.current) {
                    recordedAudioChunksRef.current = [];
                    return;
                }

                if (recordedAudioChunksRef.current.length === 0) {
                    setMessages(prev => [...prev, {
                        id: generateId(),
                        role: 'model',
                        text: '⚠️ No audio was captured. Please try again.'
                    }]);
                    return;
                }

                const blobType = recorder.mimeType || 'audio/webm';
                const blob = new Blob(recordedAudioChunksRef.current, { type: blobType });
                const file = new File([blob], `voiceover-${Date.now()}.webm`, { type: blobType });
                
                // Upload the recording
                const id = generateId();
                try {
                    const downloadURL = await uploadMediaFile(project.id, id, file);
                    const duration = await new Promise<number>((resolve) => {
                        const audio = document.createElement('audio');
                        audio.preload = 'metadata';
                        audio.onloadedmetadata = () => {
                            const metadataDuration = audio.duration;
                            resolve(Number.isFinite(metadataDuration) && metadataDuration > 0 ? metadataDuration : elapsedSeconds);
                        };
                        audio.onerror = () => resolve(elapsedSeconds);
                        audio.src = downloadURL || URL.createObjectURL(file);
                    });

                    const newAudioClip: AudioClip = {
                        id,
                        type: 'voiceover',
                        src: downloadURL || URL.createObjectURL(file),
                        name: `Voice Over - ${new Date().toLocaleTimeString()}`,
                        start: recordingStartPositionRef.current,
                        duration,
                        offset: 0,
                        volume: 1.0,
                        recordedAt: Date.now()
                    };
                    
                    setAudioClips(prev => [...prev, newAudioClip]);
                    setMessages(prev => [...prev, {
                        id: generateId(),
                        role: 'model',
                        text: '✅ Voice over recorded successfully!'
                    }]);
                } catch (err) {
                    console.error('Failed to upload voice recording:', err);
                    setMessages(prev => [...prev, {
                        id: generateId(),
                        role: 'model',
                        text: '⚠️ Failed to save voice recording'
                    }]);
                } finally {
                    recordedAudioChunksRef.current = [];
                }
            };

            recorder.start(250);
            mediaRecorderAudioRef.current = recorder;
            setIsRecording(true);
            setRecordingTime(0);

            // Update recording time every 100ms
            if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = window.setInterval(() => {
                setRecordingTime(Math.max(0, (performance.now() - recordingStartTimeRef.current) / 1000));
            }, 100);
        } catch (err) {
            console.error('Failed to access microphone:', err);
            setMessages(prev => [...prev, {
                id: generateId(),
                role: 'model',
                text: '⚠️ Could not access microphone. Please check permissions.'
            }]);
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderAudioRef.current) {
            mediaRecorderAudioRef.current.stop();
            mediaRecorderAudioRef.current.stream.getTracks().forEach(track => track.stop());
            mediaRecorderAudioRef.current = null;
        }
        if (recordingTimerRef.current) {
            window.clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        setIsRecording(false);
        setRecordingTime(0);
        setShowRecordingModal(false);
    };

    const handleDiscardRecording = () => {
        discardRecordingRef.current = true;
        if (mediaRecorderAudioRef.current) {
            mediaRecorderAudioRef.current.stop();
            mediaRecorderAudioRef.current.stream.getTracks().forEach(track => track.stop());
            mediaRecorderAudioRef.current = null;
        }
        if (recordingTimerRef.current) {
            window.clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        recordedAudioChunksRef.current = [];
        setIsRecording(false);
        setRecordingTime(0);
        setShowRecordingModal(false);
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

    const handleOpenThumbnailStudio = () => {
        setShowThumbnailStudio(true);
        if (!thumbnailBaseFrame && project.thumbnail) {
            setThumbnailPreview(project.thumbnail);
        }

        const previewWindow = window.open('', 'lumina-thumbnail-preview', 'width=1100,height=760,resizable=yes,scrollbars=yes');
        if (previewWindow) {
            thumbnailPreviewWindowRef.current = previewWindow;
            previewWindow.document.write(`
                <!doctype html>
                <html>
                <head>
                    <title>Lumina Thumbnail Preview</title>
                    <style>
                        body { margin:0; background:#0f0f12; color:#fff; font-family: Inter, Arial, sans-serif; display:flex; flex-direction:column; height:100vh; }
                        .header { padding:12px 16px; border-bottom:1px solid #27272a; font-weight:700; letter-spacing:.06em; text-transform:uppercase; font-size:12px; color:#94a3b8; display:flex; align-items:center; justify-content:space-between; }
                        .layout { display:grid; grid-template-columns: 1.2fr 360px; gap:0; flex:1; min-height:0; }
                        .stage { display:flex; align-items:center; justify-content:center; padding:20px; min-height:0; }
                        .frame { width:min(100%, 1200px); aspect-ratio:16/9; border:1px solid #334155; border-radius:14px; overflow:hidden; background:#000; display:flex; align-items:center; justify-content:center; }
                        img { width:100%; height:100%; object-fit:contain; }
                        .hint { color:#64748b; font-size:13px; }
                        .panel { border-left:1px solid #27272a; background:#111318; padding:16px; display:flex; flex-direction:column; gap:12px; overflow:auto; }
                        .label { font-size:11px; color:#94a3b8; letter-spacing:.08em; text-transform:uppercase; font-weight:700; }
                        .input, .select { width:100%; background:#0b0d12; color:white; border:1px solid #334155; border-radius:8px; padding:10px; box-sizing:border-box; }
                        .btn { border:none; border-radius:10px; padding:10px 12px; font-weight:800; cursor:pointer; color:white; }
                        .btn-primary { background: linear-gradient(90deg,#4f46e5,#7c3aed); }
                        .btn-success { background: linear-gradient(90deg,#059669,#10b981); }
                        .btn-ghost { background:#374151; }
                        .row { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
                        .status { font-size:12px; color:#a5b4fc; background:rgba(79,70,229,.12); border:1px solid rgba(79,70,229,.25); border-radius:10px; padding:10px; min-height:38px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <span>Thumbnail Preview Window</span>
                        <button class="btn btn-ghost" id="closeBtn" style="padding:6px 10px; font-size:12px;">Close</button>
                    </div>
                    <div class="layout">
                        <div class="stage">
                            <div class="frame" id="previewFrame">
                                <span class="hint" id="previewHint">Generate or edit thumbnail...</span>
                                <img id="previewImage" style="display:none;" />
                            </div>
                        </div>
                        <div class="panel">
                            <div>
                                <div class="label">Platform</div>
                                <select id="platformSelect" class="select">
                                    <option value="youtube">YouTube</option>
                                    <option value="instagram">Instagram</option>
                                    <option value="tiktok">TikTok</option>
                                    <option value="facebook">Facebook</option>
                                    <option value="x">X</option>
                                    <option value="linkedin">LinkedIn</option>
                                </select>
                            </div>
                            <div>
                                <div class="label">Title</div>
                                <input id="titleInput" class="input" placeholder="Enter title" />
                            </div>
                            <div class="row">
                                <button id="generateBtn" class="btn btn-primary">AI Generate</button>
                                <button id="saveBtn" class="btn btn-success">Save Thumbnail</button>
                            </div>
                            <div class="status" id="statusText">Ready.</div>
                        </div>
                    </div>
                    <script>
                        const send = (type, payload = {}) => {
                            if (window.opener) {
                                window.opener.postMessage({ source: 'lumina-thumbnail', type, ...payload }, '*');
                            }
                        };
                        document.getElementById('generateBtn')?.addEventListener('click', () => send('GENERATE'));
                        document.getElementById('saveBtn')?.addEventListener('click', () => send('SAVE'));
                        document.getElementById('closeBtn')?.addEventListener('click', () => send('CLOSE'));
                        document.getElementById('platformSelect')?.addEventListener('change', (e) => send('SET_PLATFORM', { platform: e.target.value }));
                        document.getElementById('titleInput')?.addEventListener('input', (e) => send('SET_TITLE', { title: e.target.value }));
                    </script>
                </body>
                </html>
            `);
            previewWindow.document.close();
        } else {
            setThumbnailStatus('Pop-up blocked. Allow pop-ups to use separate thumbnail preview window.');
        }
    };

    const handleCloseThumbnailStudio = () => {
        setShowThumbnailStudio(false);
        if (thumbnailPreviewWindowRef.current && !thumbnailPreviewWindowRef.current.closed) {
            thumbnailPreviewWindowRef.current.close();
        }
        thumbnailPreviewWindowRef.current = null;
    };

    useEffect(() => {
        const win = thumbnailPreviewWindowRef.current;
        if (!win || win.closed) return;

        const img = win.document.getElementById('previewImage') as HTMLImageElement | null;
        const hint = win.document.getElementById('previewHint') as HTMLElement | null;
        const statusEl = win.document.getElementById('statusText') as HTMLElement | null;
        const platformSelect = win.document.getElementById('platformSelect') as HTMLSelectElement | null;
        const titleInput = win.document.getElementById('titleInput') as HTMLInputElement | null;
        const generateBtn = win.document.getElementById('generateBtn') as HTMLButtonElement | null;
        const saveBtn = win.document.getElementById('saveBtn') as HTMLButtonElement | null;
        if (!img || !hint) return;

        if (thumbnailPreview) {
            img.src = thumbnailPreview;
            img.style.display = 'block';
            hint.style.display = 'none';
        } else {
            img.src = '';
            img.style.display = 'none';
            hint.style.display = 'inline';
        }

        if (statusEl) {
            statusEl.textContent = thumbnailStatus || 'Ready.';
        }
        if (platformSelect && platformSelect.value !== thumbnailPlatform) {
            platformSelect.value = thumbnailPlatform;
        }
        if (titleInput && titleInput.value !== thumbnailTitle) {
            titleInput.value = thumbnailTitle;
        }
        if (generateBtn) {
            generateBtn.disabled = isGeneratingThumbnail;
            generateBtn.textContent = isGeneratingThumbnail ? 'Generating...' : 'AI Generate';
        }
        if (saveBtn) {
            saveBtn.disabled = !thumbnailPreview;
        }
    }, [thumbnailPreview, thumbnailStatus, thumbnailPlatform, thumbnailTitle, isGeneratingThumbnail]);

    useEffect(() => {
        return () => {
            if (thumbnailPreviewWindowRef.current && !thumbnailPreviewWindowRef.current.closed) {
                thumbnailPreviewWindowRef.current.close();
            }
        };
    }, []);

    const handleGenerateThumbnailWithAI = async () => {
        const videoClips = clips.filter(c => c.type === 'video');
        if (videoClips.length === 0) {
            setThumbnailStatus('Please add a video clip first.');
            return;
        }

        setIsGeneratingThumbnail(true);
        setThumbnailStatus('AI is scanning the whole video for the best scene...');

        try {
            const seekVideo = async (video: HTMLVideoElement, timestamp: number, errorMessage: string) => {
                await new Promise<void>((resolve, reject) => {
                    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Math.max(0.1, timestamp + 0.1);
                    const maxSeek = Math.max(0, duration - 0.05);
                    const target = Math.max(0, Math.min(timestamp, maxSeek));

                    if (Math.abs(video.currentTime - target) < 0.03) {
                        resolve();
                        return;
                    }

                    let settled = false;
                    const cleanup = () => {
                        video.removeEventListener('seeked', onSeeked);
                        video.removeEventListener('error', onError);
                        window.clearTimeout(timeoutId);
                    };

                    const onSeeked = () => {
                        if (settled) return;
                        settled = true;
                        cleanup();
                        resolve();
                    };

                    const onError = () => {
                        if (settled) return;
                        settled = true;
                        cleanup();
                        reject(new Error(errorMessage));
                    };

                    const timeoutId = window.setTimeout(() => {
                        if (settled) return;
                        settled = true;
                        cleanup();
                        if (Math.abs(video.currentTime - target) < 0.08) {
                            resolve();
                        } else {
                            reject(new Error(errorMessage));
                        }
                    }, 2500);

                    video.addEventListener('seeked', onSeeked, { once: true });
                    video.addEventListener('error', onError, { once: true });
                    try {
                        video.currentTime = target;
                    } catch {
                        onError();
                    }
                });
            };

            const scoreCurrentFrame = (video: HTMLVideoElement) => {
                const tiny = document.createElement('canvas');
                tiny.width = 160;
                tiny.height = 90;
                const tctx = tiny.getContext('2d');
                if (!tctx) return 0;
                tctx.drawImage(video, 0, 0, tiny.width, tiny.height);
                const data = tctx.getImageData(0, 0, tiny.width, tiny.height).data;

                let sum = 0;
                let sumSq = 0;
                for (let i = 0; i < data.length; i += 4) {
                    const y = (0.2126 * data[i]) + (0.7152 * data[i + 1]) + (0.0722 * data[i + 2]);
                    sum += y;
                    sumSq += y * y;
                }
                const n = data.length / 4;
                const mean = sum / n;
                const variance = Math.max(0, (sumSq / n) - (mean * mean));
                const stdev = Math.sqrt(variance);

                const darkPenalty = mean < 45 ? (45 - mean) * 2 : 0;
                return (stdev * 2 + mean) - darkPenalty;
            };

            let bestSelection: {
                clip: TimelineClip;
                sourceTimestamp: number;
                timelineTimestamp: number;
                combinedScore: number;
            } | null = null;

            for (let index = 0; index < videoClips.length; index += 1) {
                const sourceClip = videoClips[index];
                setThumbnailStatus(`AI scanning clip ${index + 1}/${videoClips.length}...`);

                const tempVideo = document.createElement('video');
                tempVideo.src = sourceClip.src;
                tempVideo.crossOrigin = 'anonymous';
                tempVideo.preload = 'metadata';
                tempVideo.muted = true;

                await new Promise<void>((resolve, reject) => {
                    tempVideo.onloadedmetadata = () => resolve();
                    tempVideo.onerror = () => reject(new Error('Could not load video for thumbnail generation'));
                });

                const mediaDuration = Number.isFinite(tempVideo.duration) && tempVideo.duration > 0 ? tempVideo.duration : (sourceClip.offset + sourceClip.duration);
                const clipStartInSource = Math.max(0, Math.min(sourceClip.offset, mediaDuration));
                const clipEndInSource = Math.max(clipStartInSource + 0.05, Math.min(sourceClip.offset + sourceClip.duration, mediaDuration));
                const clipRange = Math.max(0.05, clipEndInSource - clipStartInSource);
                const margin = Math.min(0.8, Math.max(0.02, clipRange * 0.15));
                const safeStart = Math.max(0, Math.min(clipStartInSource + margin, clipEndInSource - 0.02));
                const safeEnd = Math.max(safeStart + 0.02, Math.min(clipEndInSource - 0.02, mediaDuration));

                let clipBestTimestamp = safeStart + Math.max(0, (safeEnd - safeStart) * 0.5);
                let clipBestScore = Number.NEGATIVE_INFINITY;

                try {
                    const analysis = await extractBestMoments(tempVideo, {
                        targetDuration: 12,
                        samplingInterval: 20,
                        minClipLength: 2,
                        maxClipLength: 5,
                    }, (_, status) => {
                        if (status) setThumbnailStatus(`AI scanning clip ${index + 1}/${videoClips.length}: ${status}`);
                    });

                    const insideClip = (analysis.moments || [])
                        .filter(m => m.timestamp >= safeStart && m.timestamp <= safeEnd)
                        .sort((a, b) => b.interestScore - a.interestScore)
                        .slice(0, 10);

                    for (const moment of insideClip) {
                        try {
                            await seekVideo(tempVideo, moment.timestamp, 'Failed to seek candidate frame');
                        } catch {
                            continue;
                        }
                        const visualScore = scoreCurrentFrame(tempVideo);
                        const combined = (moment.interestScore * 100) + visualScore;
                        if (combined > clipBestScore) {
                            clipBestScore = combined;
                            clipBestTimestamp = moment.timestamp;
                        }
                    }
                } catch (aiErr) {
                    console.warn('AI scene analysis failed for clip, using visual fallback:', aiErr);
                }

                if (!Number.isFinite(clipBestScore) || clipBestScore === Number.NEGATIVE_INFINITY) {
                    const sampleCount = 12;
                    const range = Math.max(0.02, safeEnd - safeStart);
                    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
                        const ratio = sampleIndex / (sampleCount - 1);
                        const ts = safeStart + (range * ratio);
                        try {
                            await seekVideo(tempVideo, ts, 'Failed to seek fallback frame');
                        } catch {
                            continue;
                        }
                        const visualScore = scoreCurrentFrame(tempVideo);
                        if (visualScore > clipBestScore) {
                            clipBestScore = visualScore;
                            clipBestTimestamp = ts;
                        }
                    }
                }

                const timelineTimestamp = sourceClip.start + Math.max(0, clipBestTimestamp - sourceClip.offset);
                if (!bestSelection || clipBestScore > bestSelection.combinedScore) {
                    bestSelection = {
                        clip: sourceClip,
                        sourceTimestamp: clipBestTimestamp,
                        timelineTimestamp,
                        combinedScore: clipBestScore,
                    };
                }
            }

            if (!bestSelection) {
                throw new Error('Unable to find a suitable frame for thumbnail generation.');
            }

            const selectedVideo = document.createElement('video');
            selectedVideo.src = bestSelection.clip.src;
            selectedVideo.crossOrigin = 'anonymous';
            selectedVideo.preload = 'metadata';

            await new Promise<void>((resolve, reject) => {
                selectedVideo.onloadedmetadata = () => resolve();
                selectedVideo.onerror = () => reject(new Error('Could not load selected clip for thumbnail rendering'));
            });

            const boundedSelectedTimestamp = Math.max(0, Math.min(bestSelection.sourceTimestamp, (selectedVideo.duration || bestSelection.sourceTimestamp)));
            await seekVideo(selectedVideo, boundedSelectedTimestamp, 'Failed to seek to AI-selected scene');

            const frameCanvas = document.createElement('canvas');
            frameCanvas.width = selectedVideo.videoWidth || 1280;
            frameCanvas.height = selectedVideo.videoHeight || 720;
            const frameCtx = frameCanvas.getContext('2d');
            if (!frameCtx) throw new Error('Canvas context unavailable');
            frameCtx.drawImage(selectedVideo, 0, 0, frameCanvas.width, frameCanvas.height);
            const baseFrame = frameCanvas.toDataURL('image/jpeg', 0.92);

            setThumbnailBaseFrame(baseFrame);
            setThumbnailStatus(`AI selected the best scene at ${bestSelection.timelineTimestamp.toFixed(1)}s on your timeline. Edit and save your thumbnail.`);
        } catch (err: any) {
            console.error('Thumbnail AI generation failed:', err);
            setThumbnailStatus(err.message || 'Failed to generate thumbnail.');
        } finally {
            setIsGeneratingThumbnail(false);
        }
    };

    const handleSaveThumbnail = async () => {
        if (!thumbnailPreview) {
            setThumbnailStatus('Generate a thumbnail first.');
            return;
        }

        try {
            await saveProject(project.id, {
                thumbnail: thumbnailPreview,
            });
            setMessages(prev => [...prev, {
                id: generateId(),
                role: 'model',
                text: '🖼️ Thumbnail saved successfully!'
            }]);
            handleCloseThumbnailStudio();
        } catch (err: any) {
            setThumbnailStatus(err.message || 'Failed to save thumbnail.');
        }
    };

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            const data = event.data;
            if (!data || data.source !== 'lumina-thumbnail') return;

            switch (data.type) {
                case 'GENERATE':
                    void handleGenerateThumbnailWithAI();
                    break;
                case 'SAVE':
                    void handleSaveThumbnail();
                    break;
                case 'CLOSE':
                    handleCloseThumbnailStudio();
                    break;
                case 'SET_PLATFORM':
                    if (data.platform && Object.prototype.hasOwnProperty.call(THUMBNAIL_PRESETS, data.platform)) {
                        setThumbnailPlatform(data.platform as ThumbnailPlatform);
                    }
                    break;
                case 'SET_TITLE':
                    setThumbnailTitle(String(data.title || ''));
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [handleGenerateThumbnailWithAI, thumbnailPreview, thumbnailPlatform, thumbnailTitle]);

    const handleExportClick = () => {
        if (clips.length === 0) return;
        setShowExportModal(true);
    };

    const createMixedExportStream = (videoStream: MediaStream) => {
        if (audioClips.length === 0) return videoStream;

        try {
            const Ctx = window.AudioContext || (window as any).webkitAudioContext;
            const audioCtx = new Ctx();
            const destination = audioCtx.createMediaStreamDestination();

            const baseAudioTracks = videoStream.getAudioTracks();
            if (baseAudioTracks.length > 0) {
                const baseAudioStream = new MediaStream(baseAudioTracks);
                const baseSource = audioCtx.createMediaStreamSource(baseAudioStream);
                const baseGain = audioCtx.createGain();
                baseGain.gain.value = 1;
                baseSource.connect(baseGain).connect(destination);
            }

            for (const clip of audioClips) {
                const audioEl = audioElementsRef.current[clip.id];
                if (!audioEl) continue;

                const elementStream = (audioEl as any).captureStream?.() || (audioEl as any).mozCaptureStream?.();
                if (!elementStream) continue;
                const tracks = elementStream.getAudioTracks();
                if (tracks.length === 0) continue;

                const source = audioCtx.createMediaStreamSource(new MediaStream(tracks));
                const gain = audioCtx.createGain();
                gain.gain.value = clip.isMuted ? 0 : Math.max(0, Math.min(1, clip.volume ?? 0.8));
                source.connect(gain).connect(destination);
            }

            const mixedStream = new MediaStream();
            videoStream.getVideoTracks().forEach(track => mixedStream.addTrack(track));
            destination.stream.getAudioTracks().forEach(track => mixedStream.addTrack(track));

            exportAudioContextRef.current = audioCtx;
            exportMediaStreamRef.current = mixedStream;
            return mixedStream;
        } catch (err) {
            console.warn('Failed to create mixed export stream, using original stream:', err);
            return videoStream;
        }
    };

    const cleanupExportAudioResources = () => {
        if (exportMediaStreamRef.current) {
            exportMediaStreamRef.current.getTracks().forEach(track => track.stop());
            exportMediaStreamRef.current = null;
        }
        if (exportAudioContextRef.current) {
            void exportAudioContextRef.current.close();
            exportAudioContextRef.current = null;
        }
    };

    const handleSelectAudioClip = useCallback((audioClipId: string) => {
        const targetClip = audioClips.find(clip => clip.id === audioClipId);
        if (!targetClip) return;

        setSelectedAudioClipId(audioClipId);
        setVideoState(prev => ({
            ...prev,
            currentTime: targetClip.start,
            isPlaying: true
        }));
    }, [audioClips]);

    const handleMoveAudioClip = useCallback((audioClipId: string, newStart: number) => {
        setAudioClips(prevAudioClips => {
            const movingClip = prevAudioClips.find(clip => clip.id === audioClipId);
            if (!movingClip) return prevAudioClips;

            const frameStep = 1 / 60;
            const desiredStart = Math.max(0, Math.round(newStart / frameStep) * frameStep);

            const moved = prevAudioClips.map(clip => (
                clip.id === audioClipId ? { ...clip, start: desiredStart } : clip
            ));

            const sorted = [...moved].sort((a, b) => a.start - b.start);
            let cursor = 0;
            const ripple = sorted.map(clip => {
                const start = Math.max(clip.start, cursor);
                cursor = start + clip.duration;
                return { ...clip, start };
            });

            return ripple;
        });
    }, []);

    const handleToggleMuteAudioClip = useCallback((audioClipId: string) => {
        setAudioClips(prev => prev.map(clip => (
            clip.id === audioClipId
                ? { ...clip, isMuted: !clip.isMuted }
                : clip
        )));
    }, []);

    const handleExportStart = () => {
        setShowExportModal(false);
        setIsExporting(true);
        setExportProgress(0);
        recordedChunksRef.current = [];
        setVideoState(prev => ({ ...prev, currentTime: 0, isPlaying: true }));

        const baseStream = playerRef.current?.getStream();
        const stream = baseStream ? createMixedExportStream(baseStream) : null;
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

            setTimeout(async () => {
                const webmBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                const format = selectedExportFormat;
                const baseName = projectName || 'Lumina_Edit';

                let finalBlob = webmBlob;
                let exportFilename = `${baseName}.${format}`;

                // For non-webm formats, convert via the backend
                if (format !== 'webm') {
                    try {
                        const formData = new FormData();
                        formData.append('file', webmBlob, 'export.webm');
                        formData.append('target_format', format);
                        formData.append('filename', baseName);

                        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
                        const res = await fetch(`${BACKEND_URL}/api/convert`, {
                            method: 'POST',
                            body: formData,
                        });

                        if (res.ok) {
                            finalBlob = await res.blob();
                        } else {
                            console.warn('Format conversion failed, downloading as webm');
                            exportFilename = `${baseName}.webm`;
                        }
                    } catch (err) {
                        console.warn('Format conversion error, downloading as webm:', err);
                        exportFilename = `${baseName}.webm`;
                    }
                }

                // Download locally
                const url = URL.createObjectURL(finalBlob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = exportFilename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);

                // Also persist to backend storage
                uploadExportedVideo(project.id, finalBlob, exportFilename)
                    .then((backendUrl) => {
                        console.log(`Export saved to backend: ${backendUrl}`);
                        setMessages(prev => [...prev, {
                            id: generateId(),
                            role: 'model',
                            text: `✅ Video exported as ${format.toUpperCase()} and saved!`
                        }]);
                    })
                    .catch((err) => {
                        console.warn('Failed to save export to backend:', err);
                    });

                setIsExporting(false);
                setExportProgress(0);
                cleanupExportAudioResources();
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

    const handleMoveVideoClip = useCallback((clipId: string, newStart: number) => {
        setClips(prevClips => {
            const movingClip = prevClips.find(clip => clip.id === clipId);
            if (!movingClip) return prevClips;

            const frameStep = 1 / 60;
            const desiredStart = Math.max(0, Math.round(newStart / frameStep) * frameStep);

            const moved = prevClips.map(clip => (
                clip.id === clipId ? { ...clip, start: desiredStart } : clip
            ));

            const sorted = [...moved].sort((a, b) => a.start - b.start);
            let cursor = 0;
            const ripple = sorted.map(clip => {
                const start = Math.max(clip.start, cursor);
                cursor = start + clip.duration;
                return { ...clip, start };
            });

            return ripple;
        });
    }, []);

    const handleToggleMuteVideoClip = useCallback((clipId: string) => {
        setClips(prevClips => prevClips.map(clip => (
            clip.id === clipId
                ? { ...clip, isMuted: !clip.isMuted }
                : clip
        )));
    }, []);

    const handleSplitAtPlayhead = useCallback(() => {
        if (isExporting) return;

        const splitTime = videoState.currentTime;
        const epsilon = 0.01;
        let splitsCount = 0;

        const updatedVideoClips: TimelineClip[] = [];
        for (const clip of clips) {
            const clipEnd = clip.start + clip.duration;
            const canSplit = splitTime > (clip.start + epsilon) && splitTime < (clipEnd - epsilon);

            if (!canSplit) {
                updatedVideoClips.push(clip);
                continue;
            }

            const leftDuration = splitTime - clip.start;
            const rightDuration = clip.duration - leftDuration;

            const leftClip: TimelineClip = {
                ...clip,
                id: generateId(),
                duration: leftDuration,
                transitionOut: undefined,
                transitionOutDuration: undefined,
            };

            const rightClip: TimelineClip = {
                ...clip,
                id: generateId(),
                start: splitTime,
                duration: rightDuration,
                offset: clip.offset + leftDuration,
                transitionIn: undefined,
                transitionInDuration: undefined,
            };

            updatedVideoClips.push(leftClip, rightClip);
            splitsCount += 1;
        }

        const updatedAudioClips: AudioClip[] = [];
        for (const clip of audioClips) {
            const clipEnd = clip.start + clip.duration;
            const canSplit = splitTime > (clip.start + epsilon) && splitTime < (clipEnd - epsilon);

            if (!canSplit) {
                updatedAudioClips.push(clip);
                continue;
            }

            const leftDuration = splitTime - clip.start;
            const rightDuration = clip.duration - leftDuration;

            const leftClip: AudioClip = {
                ...clip,
                id: generateId(),
                duration: leftDuration,
            };

            const rightClip: AudioClip = {
                ...clip,
                id: generateId(),
                start: splitTime,
                duration: rightDuration,
                offset: (clip.offset ?? 0) + leftDuration,
            };

            updatedAudioClips.push(leftClip, rightClip);
            splitsCount += 1;
        }

        setClips(updatedVideoClips);
        setAudioClips(updatedAudioClips);

        if (splitsCount > 0) {
            setMessages(prev => [...prev, {
                id: generateId(),
                role: 'model',
                text: `✂️ Split ${splitsCount} clip${splitsCount > 1 ? 's' : ''} at ${splitTime.toFixed(2)}s.`
            }]);
        }
    }, [isExporting, videoState.currentTime, clips, audioClips]);

    const handleTrimLeftAtPlayhead = useCallback(() => {
        if (isExporting) return;
        const t = videoState.currentTime;
        const epsilon = 0.01;
        let changed = 0;

        const nextClips = clips.map(clip => {
            const end = clip.start + clip.duration;
            const active = t > clip.start + epsilon && t < end - epsilon;
            if (!active) return clip;
            changed += 1;
            return {
                ...clip,
                start: t,
                duration: end - t,
                offset: clip.offset + (t - clip.start)
            };
        });

        const nextAudio = audioClips.map(clip => {
            const end = clip.start + clip.duration;
            const active = t > clip.start + epsilon && t < end - epsilon;
            if (!active) return clip;
            changed += 1;
            return {
                ...clip,
                start: t,
                duration: end - t,
                offset: (clip.offset ?? 0) + (t - clip.start)
            };
        });

        if (changed > 0) {
            setClips(nextClips);
            setAudioClips(nextAudio);
            setMessages(prev => [...prev, { id: generateId(), role: 'model', text: `⏭️ Trim In applied to ${changed} clip${changed > 1 ? 's' : ''}.` }]);
        }
    }, [isExporting, videoState.currentTime, clips, audioClips]);

    const handleTrimRightAtPlayhead = useCallback(() => {
        if (isExporting) return;
        const t = videoState.currentTime;
        const epsilon = 0.01;
        let changed = 0;

        const nextClips = clips.map(clip => {
            const end = clip.start + clip.duration;
            const active = t > clip.start + epsilon && t < end - epsilon;
            if (!active) return clip;
            changed += 1;
            return {
                ...clip,
                duration: t - clip.start
            };
        });

        const nextAudio = audioClips.map(clip => {
            const end = clip.start + clip.duration;
            const active = t > clip.start + epsilon && t < end - epsilon;
            if (!active) return clip;
            changed += 1;
            return {
                ...clip,
                duration: t - clip.start
            };
        });

        if (changed > 0) {
            setClips(nextClips);
            setAudioClips(nextAudio);
            setMessages(prev => [...prev, { id: generateId(), role: 'model', text: `⏮️ Trim Out applied to ${changed} clip${changed > 1 ? 's' : ''}.` }]);
        }
    }, [isExporting, videoState.currentTime, clips, audioClips]);

    const handleDeleteAtPlayhead = useCallback(() => {
        if (isExporting) return;
        const t = videoState.currentTime;
        const epsilon = 0.01;

        const nextClips = clips.filter(clip => !(t >= clip.start + epsilon && t < (clip.start + clip.duration - epsilon)));
        const nextAudio = audioClips.filter(clip => !(t >= clip.start + epsilon && t < (clip.start + clip.duration - epsilon)));
        const removed = (clips.length - nextClips.length) + (audioClips.length - nextAudio.length);

        if (removed > 0) {
            setClips(nextClips);
            setAudioClips(nextAudio);
            setMessages(prev => [...prev, { id: generateId(), role: 'model', text: `🗑️ Deleted ${removed} clip${removed > 1 ? 's' : ''} at playhead.` }]);
        }
    }, [isExporting, videoState.currentTime, clips, audioClips]);

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

    const activeClip = clips
        .filter(c => videoState.currentTime >= c.start && videoState.currentTime < (c.start + c.duration))
        .sort((a, b) => b.start - a.start)[0];
    const canSplitAtPlayhead =
        clips.some(c => videoState.currentTime > c.start + 0.01 && videoState.currentTime < (c.start + c.duration - 0.01)) ||
        audioClips.some(c => videoState.currentTime > c.start + 0.01 && videoState.currentTime < (c.start + c.duration - 0.01));
    const canTrimLeftAtPlayhead = canSplitAtPlayhead;
    const canTrimRightAtPlayhead = canSplitAtPlayhead;
    const canDeleteAtPlayhead = canSplitAtPlayhead;

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
                            disabled={(clips.length === 0 && audioClips.length === 0) || isExporting}
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

                    <input type="file" ref={fileInputRef} className="hidden" multiple accept="video/*,image/*,audio/*" onChange={handleFileUpload} />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoadingMedia || isExporting}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                    >
                        <Upload size={16} /> Import
                    </button>

                    <button
                        onClick={() => setShowRecordingModal(true)}
                        disabled={isLoadingMedia || isExporting || isRecording}
                        className="flex items-center gap-2 px-4 py-2 bg-red-900 hover:bg-red-800 text-red-200 border border-red-700 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                    >
                        <Mic size={16} /> Voice Over
                    </button>

                    <button
                        onClick={handleOpenThumbnailStudio}
                        disabled={isLoadingMedia || isExporting || clips.filter(c => c.type === 'video').length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-900 hover:bg-indigo-800 text-indigo-200 border border-indigo-700 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                    >
                        <ImageIcon size={16} /> Thumbnail
                    </button>

                    <button
                        onClick={() => persistProject(videoState, clips, audioClips, subtitles, messages, projectName)}
                        disabled={isExporting || saveStatus === 'saving'}
                        className="flex items-center gap-2 px-6 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-bold transition-all shadow-lg disabled:opacity-50"
                    >
                        <Save size={16} /> Save Now
                    </button>

                    <button
                        onClick={handleExportClick}
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
                                        clipMuted={!!activeClip.isMuted}
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

                                <div className="hidden" aria-hidden>
                                    {audioClips.map((audioClip) => (
                                        <audio
                                            key={audioClip.id}
                                            ref={(el) => {
                                                audioElementsRef.current[audioClip.id] = el;
                                            }}
                                            src={audioClip.src}
                                            preload="auto"
                                            crossOrigin="anonymous"
                                        />
                                    ))}
                                </div>

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

                                {showExportModal && (
                                    <div className="absolute inset-0 bg-black/80 z-[70] flex items-center justify-center backdrop-blur-xl animate-in fade-in duration-300">
                                        <div className="w-full max-w-lg p-8 bg-dark-surface border border-lumina-500/30 rounded-3xl shadow-[0_0_100px_rgba(14,165,233,0.15)] relative">
                                            <button
                                                onClick={() => setShowExportModal(false)}
                                                className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-all"
                                            >
                                                <X size={18} />
                                            </button>

                                            <div className="flex items-center gap-4 mb-8">
                                                <div className="w-14 h-14 rounded-2xl bg-lumina-500/20 flex items-center justify-center text-lumina-400 border border-lumina-500/20">
                                                    <Download size={28} />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">Export Video</h3>
                                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">Choose your output format</p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-5 gap-3 mb-8">
                                                {([
                                                    { id: 'mp4' as const, label: 'MP4', desc: 'Universal', color: 'lumina' },
                                                    { id: 'webm' as const, label: 'WebM', desc: 'Web-ready', color: 'green' },
                                                    { id: 'mov' as const, label: 'MOV', desc: 'Apple/Pro', color: 'purple' },
                                                    { id: 'avi' as const, label: 'AVI', desc: 'Legacy', color: 'amber' },
                                                    { id: 'mkv' as const, label: 'MKV', desc: 'Hi-Quality', color: 'cyan' },
                                                ]).map(fmt => (
                                                    <button
                                                        key={fmt.id}
                                                        onClick={() => setSelectedExportFormat(fmt.id)}
                                                        className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 ${
                                                            selectedExportFormat === fmt.id
                                                                ? `border-${fmt.color}-500 bg-${fmt.color}-500/10 shadow-lg shadow-${fmt.color}-500/10`
                                                                : 'border-gray-700/50 bg-black/30 hover:border-gray-600 hover:bg-gray-800/50'
                                                        }`}
                                                    >
                                                        {selectedExportFormat === fmt.id && (
                                                            <div className={`absolute -top-2 -right-2 w-5 h-5 bg-${fmt.color}-500 rounded-full flex items-center justify-center`}>
                                                                <Check size={12} className="text-white" />
                                                            </div>
                                                        )}
                                                        <span className={`text-lg font-black uppercase tracking-tight ${
                                                            selectedExportFormat === fmt.id ? 'text-white' : 'text-gray-400'
                                                        }`}>
                                                            .{fmt.label}
                                                        </span>
                                                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">{fmt.desc}</span>
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="p-4 bg-black/40 rounded-2xl border border-white/5 mb-6">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Output Details</span>
                                                </div>
                                                <div className="grid grid-cols-3 gap-4 text-center">
                                                    <div>
                                                        <p className="text-[9px] text-gray-600 font-bold uppercase">Format</p>
                                                        <p className="text-sm text-white font-black uppercase">{selectedExportFormat}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] text-gray-600 font-bold uppercase">Clips</p>
                                                        <p className="text-sm text-white font-black">{clips.length}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] text-gray-600 font-bold uppercase">Duration</p>
                                                        <p className="text-sm text-white font-black">{Math.round(videoState.duration)}s</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <button
                                                onClick={handleExportStart}
                                                className="w-full py-4 bg-gradient-to-r from-lumina-600 to-purple-600 hover:from-lumina-500 hover:to-purple-500 text-white rounded-2xl text-sm font-black uppercase tracking-wider transition-all shadow-lg shadow-lumina-900/30 flex items-center justify-center gap-3"
                                            >
                                                <FileVideo size={20} />
                                                Start Export as {selectedExportFormat.toUpperCase()}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {showThumbnailStudio && (
                                    <div className="absolute inset-0 bg-black/85 z-[75] flex items-center justify-center backdrop-blur-xl animate-in fade-in duration-300 p-6">
                                        <div className="w-full max-w-6xl bg-dark-surface border border-indigo-500/30 rounded-3xl shadow-[0_0_100px_rgba(99,102,241,0.2)] overflow-hidden">
                                            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center text-indigo-300">
                                                        <ImageIcon size={22} />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-xl font-black text-white uppercase tracking-tight">Thumbnail Studio</h3>
                                                        <p className="text-xs text-gray-500 uppercase tracking-wider">AI scene pick + manual edit</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={handleCloseThumbnailStudio}
                                                    className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-all"
                                                >
                                                    <X size={18} />
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-0 min-h-[560px]">
                                                <div className="p-6 border-r border-white/10 bg-black/20">
                                                    <div className="aspect-video min-h-[260px] bg-black rounded-2xl border border-white/10 overflow-hidden flex items-center justify-center">
                                                        {thumbnailPreview ? (
                                                            <img src={thumbnailPreview} alt="Thumbnail preview" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="text-center text-gray-500">
                                                                <ImageIcon size={36} className="mx-auto mb-3 opacity-50" />
                                                                <p className="text-sm">Generate a thumbnail from AI-selected scene</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                                                        <span>Platform: {THUMBNAIL_PRESETS[thumbnailPlatform].label}</span>
                                                        <span>{THUMBNAIL_PRESETS[thumbnailPlatform].width} × {THUMBNAIL_PRESETS[thumbnailPlatform].height}</span>
                                                    </div>
                                                    {thumbnailStatus && (
                                                        <div className="mt-3 text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3">
                                                            {thumbnailStatus}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="p-6 space-y-5 overflow-y-auto">
                                                    <div>
                                                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">Platform</p>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            {(Object.keys(THUMBNAIL_PRESETS) as ThumbnailPlatform[]).map(platform => (
                                                                <button
                                                                    key={platform}
                                                                    onClick={() => setThumbnailPlatform(platform)}
                                                                    className={`px-3 py-2 rounded-xl border text-xs font-bold uppercase transition-all ${thumbnailPlatform === platform ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-black/20 border-white/10 text-gray-400 hover:text-white hover:border-gray-500'}`}
                                                                >
                                                                    {THUMBNAIL_PRESETS[platform].label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={handleGenerateThumbnailWithAI}
                                                        disabled={isGeneratingThumbnail}
                                                        className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                                    >
                                                        {isGeneratingThumbnail ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                                        AI Generate from Scene
                                                    </button>

                                                    <div>
                                                        <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2 block">Title Text</label>
                                                        <input
                                                            value={thumbnailTitle}
                                                            onChange={(e) => setThumbnailTitle(e.target.value)}
                                                            placeholder="Enter thumbnail title"
                                                            className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500"
                                                        />
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2 block">Text Size</label>
                                                            <input type="range" min={28} max={110} value={thumbnailTextSize} onChange={(e) => setThumbnailTextSize(Number(e.target.value))} className="w-full" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2 block">Text Y Position</label>
                                                            <input type="range" min={20} max={90} value={thumbnailTextY} onChange={(e) => setThumbnailTextY(Number(e.target.value))} className="w-full" />
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2 block">Text Color</label>
                                                            <input type="color" value={thumbnailTextColor} onChange={(e) => setThumbnailTextColor(e.target.value)} className="w-full h-10 rounded-lg bg-transparent border border-white/10" />
                                                        </div>
                                                        <div className="grid grid-cols-1 gap-2">
                                                            <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Look</label>
                                                            <div className="text-[10px] text-gray-400">Adjust image punch for social feeds</div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 gap-3">
                                                        <div>
                                                            <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2 block">Brightness ({thumbnailBrightness}%)</label>
                                                            <input type="range" min={70} max={150} value={thumbnailBrightness} onChange={(e) => setThumbnailBrightness(Number(e.target.value))} className="w-full" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2 block">Contrast ({thumbnailContrast}%)</label>
                                                            <input type="range" min={70} max={170} value={thumbnailContrast} onChange={(e) => setThumbnailContrast(Number(e.target.value))} className="w-full" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2 block">Saturation ({thumbnailSaturation}%)</label>
                                                            <input type="range" min={70} max={190} value={thumbnailSaturation} onChange={(e) => setThumbnailSaturation(Number(e.target.value))} className="w-full" />
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3 pt-3">
                                                        <button
                                                            onClick={handleCloseThumbnailStudio}
                                                            className="py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold uppercase tracking-wide transition-all"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            onClick={handleSaveThumbnail}
                                                            disabled={!thumbnailPreview}
                                                            className="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-wide transition-all disabled:opacity-50"
                                                        >
                                                            Save Thumbnail
                                                        </button>
                                                    </div>
                                                </div>
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

                                {showRecordingModal && (
                                    <div className="absolute inset-0 bg-black/80 z-[60] flex flex-col items-center justify-center backdrop-blur-xl animate-in fade-in duration-500">
                                        <div className="w-full max-w-md p-8 bg-dark-surface border border-red-500/30 rounded-3xl shadow-[0_0_100px_rgba(239,68,68,0.15)] relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-red-500/5 to-transparent h-20 w-full animate-[scan_2s_linear_infinite]" />

                                            <div className="flex items-center gap-4 mb-8">
                                                <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-400 border border-red-500/20">
                                                    <Mic size={32} className={isRecording ? 'animate-pulse' : ''} />
                                                </div>
                                                <div>
                                                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Voice Over</h3>
                                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">Record at {videoState.currentTime.toFixed(1)}s</p>
                                                </div>
                                            </div>

                                            <div className="space-y-6">
                                                {/* Recording Timer */}
                                                <div className="text-center">
                                                    <div className="text-6xl font-black text-red-400 mb-4 font-mono">
                                                        {Math.floor(recordingTime / 60)}:{String(Math.floor(recordingTime % 60)).padStart(2, '0')}
                                                    </div>
                                                    {isRecording && (
                                                        <div className="flex items-center justify-center gap-2">
                                                            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                                                            <span className="text-red-400 text-sm font-black uppercase">Recording...</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Waveform Visualization */}
                                                <div className="h-20 bg-black/40 rounded-2xl border border-red-500/20 flex items-center justify-center overflow-hidden p-2">
                                                    {isRecording ? (
                                                        <div className="flex items-end gap-1 h-full">
                                                            {Array.from({ length: 20 }).map((_, i) => (
                                                                <div
                                                                    key={i}
                                                                    className="flex-1 bg-gradient-to-t from-red-500 to-red-400 rounded-full transition-all"
                                                                    style={{
                                                                        height: `${Math.random() * 100}%`,
                                                                        animation: 'pulse 0.3s ease-in-out'
                                                                    }}
                                                                />
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-gray-500 text-sm">Ready to record</p>
                                                    )}
                                                </div>

                                                {/* Controls */}
                                                <div className="grid grid-cols-2 gap-3">
                                                    {!isRecording ? (
                                                        <>
                                                            <button
                                                                onClick={handleStartRecording}
                                                                className="py-4 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white rounded-2xl font-black uppercase tracking-wider transition-all shadow-lg shadow-red-900/30 flex items-center justify-center gap-2"
                                                            >
                                                                <Mic size={18} />
                                                                Record
                                                            </button>
                                                            <button
                                                                onClick={() => setShowRecordingModal(false)}
                                                                className="py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-2xl font-black uppercase tracking-wider transition-all"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={handleStopRecording}
                                                                className="py-4 bg-gradient-to-r from-red-700 to-red-800 hover:from-red-600 hover:to-red-700 text-white rounded-2xl font-black uppercase tracking-wider transition-all shadow-lg shadow-red-900/50"
                                                            >
                                                                Stop
                                                            </button>
                                                            <button
                                                                onClick={handleDiscardRecording}
                                                                className="py-4 text-red-400 hover:text-red-300 font-black uppercase tracking-wider transition-colors border-2 border-red-500/30 rounded-2xl"
                                                            >
                                                                Discard
                                                            </button>
                                                        </>
                                                    )}
                                                </div>

                                                <p className="text-center text-[10px] text-gray-500 italic">Click Record and speak into your microphone</p>
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
                        duration={Math.max(calculateProjectDuration(clips, audioClips), 10)}
                        currentTime={videoState.currentTime}
                        clips={clips} subtitles={subtitles}
                        audioClips={audioClips}
                        selectedAudioClipId={selectedAudioClipId}
                        onSeek={(t) => handleUpdateState({ currentTime: t })}
                        onSplitAtPlayhead={handleSplitAtPlayhead}
                        canSplitAtPlayhead={canSplitAtPlayhead}
                        onTrimLeftAtPlayhead={handleTrimLeftAtPlayhead}
                        onTrimRightAtPlayhead={handleTrimRightAtPlayhead}
                        onDeleteAtPlayhead={handleDeleteAtPlayhead}
                        canTrimLeftAtPlayhead={canTrimLeftAtPlayhead}
                        canTrimRightAtPlayhead={canTrimRightAtPlayhead}
                        canDeleteAtPlayhead={canDeleteAtPlayhead}
                        onDropPreset={handleDropPreset}
                        onMoveVideoClip={handleMoveVideoClip}
                        onToggleMuteVideoClip={handleToggleMuteVideoClip}
                        onSelectAudioClip={handleSelectAudioClip}
                        onMoveAudioClip={handleMoveAudioClip}
                        onToggleMuteAudioClip={handleToggleMuteAudioClip}
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
