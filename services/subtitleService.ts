import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from "@google/generative-ai";
import { Subtitle } from "../types";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

const generateId = () => Math.random().toString(36).substr(2, 9);

export interface SubtitleGenerationConfig {
    language: string;          // Target language (default: 'en')
    chunkDuration: number;     // Duration of each audio chunk in seconds (default: 30)
}

const DEFAULT_CONFIG: SubtitleGenerationConfig = {
    language: 'en',
    chunkDuration: 30
};

const TRANSCRIPTION_SYSTEM_INSTRUCTION = `
You are an expert audio transcriptionist. Your task is to transcribe speech from audio with precise timing.

Instructions:
1. Listen carefully to the audio and transcribe ALL spoken words accurately
2. Include timestamps for each subtitle segment
3. Break the transcription into natural subtitle segments (1-3 sentences each)
4. Each segment should be readable on screen (max 80 characters preferred)
5. Preserve speaker intent, tone markers, and important non-speech sounds in brackets like [applause] or [music]
6. If the audio is unclear, use [...] to indicate inaudible portions
7. For multiple speakers, identify them if possible (Speaker 1, Speaker 2, etc.)

Return accurate speech-to-text transcription with proper timing.
`;

const TRANSCRIPTION_RESPONSE_SCHEMA: ResponseSchema = {
    type: SchemaType.OBJECT,
    properties: {
        segments: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    startTime: { type: SchemaType.NUMBER },
                    endTime: { type: SchemaType.NUMBER },
                    text: { type: SchemaType.STRING },
                    speaker: { type: SchemaType.STRING }
                },
                required: ['startTime', 'endTime', 'text']
            }
        },
        summary: { type: SchemaType.STRING }
    },
    required: ['segments', 'summary']
};

/**
 * Extract audio from video element as base64 WAV data
 * Uses Web Audio API to capture and encode audio
 */
async function extractAudioFromVideo(
    videoElement: HTMLVideoElement,
    startTime: number,
    duration: number,
    onProgress?: (progress: number) => void
): Promise<string> {
    return new Promise(async (resolve, reject) => {
        try {
            // Create audio context
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

            // Calculate sample parameters
            const sampleRate = audioContext.sampleRate;
            const totalSamples = Math.ceil(duration * sampleRate);

            // Create a MediaElementSource (note: can only be created once per element)
            // So we'll use a different approach - capture MediaStream
            const stream = (videoElement as any).captureStream?.() ||
                (videoElement as any).mozCaptureStream?.();

            if (!stream) {
                throw new Error("Browser doesn't support captureStream");
            }

            // Get audio tracks
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
                throw new Error("No audio track found in video");
            }

            // Create a new audio-only stream
            const audioStream = new MediaStream(audioTracks);

            // Set up MediaRecorder to capture audio
            const mediaRecorder = new MediaRecorder(audioStream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            const chunks: Blob[] = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                try {
                    const audioBlob = new Blob(chunks, { type: 'audio/webm' });

                    // Convert to base64
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64 = (reader.result as string).split(',')[1];
                        resolve(base64);
                    };
                    reader.onerror = () => reject(new Error("Failed to read audio data"));
                    reader.readAsDataURL(audioBlob);
                } catch (err) {
                    reject(err);
                }
            };

            // Seek to start time
            videoElement.currentTime = startTime;
            await new Promise<void>((res) => {
                const handler = () => {
                    videoElement.removeEventListener('seeked', handler);
                    res();
                };
                videoElement.addEventListener('seeked', handler);
            });

            // Start recording
            mediaRecorder.start();

            // Play video to capture audio
            const originalVolume = videoElement.volume;
            const originalMuted = videoElement.muted;
            videoElement.muted = true; // Mute to avoid speaker output
            videoElement.play();

            // Wait for duration then stop
            setTimeout(() => {
                videoElement.pause();
                videoElement.muted = originalMuted;
                videoElement.volume = originalVolume;
                mediaRecorder.stop();
            }, duration * 1000);

        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Extract video/audio as base64 directly from video URL
 * This is MUCH faster and less memory-intensive than WAV conversion
 */
async function extractMediaAsBase64(
    videoSrc: string,
    onProgress?: (progress: number) => void
): Promise<{ base64: string; mimeType: string; duration: number }> {
    return new Promise(async (resolve, reject) => {
        try {
            onProgress?.(5);

            // Fetch the video as a blob
            const response = await fetch(videoSrc);
            const blob = await response.blob();
            const mimeType = blob.type || 'video/mp4';

            onProgress?.(30);

            // Get duration from a temporary video element
            const tempVideo = document.createElement('video');
            tempVideo.preload = 'metadata';
            tempVideo.muted = true;

            const videoDuration = await new Promise<number>((res, rej) => {
                tempVideo.onloadedmetadata = () => {
                    res(tempVideo.duration);
                    // Clean up
                    tempVideo.src = '';
                    tempVideo.remove();
                };
                tempVideo.onerror = () => rej(new Error('Failed to get video duration'));
                tempVideo.src = videoSrc;
            });

            onProgress?.(50);

            // Convert blob to base64
            const reader = new FileReader();

            reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1];
                onProgress?.(80);
                resolve({
                    base64,
                    mimeType,
                    duration: videoDuration
                });
            };

            reader.onerror = () => reject(new Error("Failed to read video data"));
            reader.readAsDataURL(blob);

        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Transcribe media using Gemini AI
 * Supports both audio and video input
 */
async function transcribeMediaWithGemini(
    mediaBase64: string,
    mimeType: string,
    mediaDuration: number,
    chunkOffset: number,
    config: SubtitleGenerationConfig,
    onProgress?: (progress: number) => void
): Promise<{ segments: Omit<Subtitle, 'id'>[]; summary: string }> {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key is not configured");
    }

    const client = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = client.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: TRANSCRIPTION_SYSTEM_INSTRUCTION
    });

    const parts: any[] = [
        {
            inlineData: {
                mimeType: mimeType,
                data: mediaBase64
            }
        },
        {
            text: `Transcribe the speech/dialogue from this media (${mediaDuration.toFixed(1)} seconds long).

CRITICAL TIMING INSTRUCTIONS:
1. Listen carefully to WHEN each phrase starts and ends
2. The duration of each subtitle MUST match the actual speaking duration
3. Short phrases (1-3 words) typically last 0.5-1.5 seconds
4. Longer sentences typically last 2-5 seconds
5. Do NOT make all subtitles the same duration - vary based on actual speech

Return each spoken segment with PRECISE timing:
- startTime: exact second when the speech BEGINS
- endTime: exact second when the speech ENDS (not when next speech starts)
- text: the transcribed speech
- speaker: speaker identifier if distinguishable

Be thorough and capture ALL spoken content with accurate timing.`
        }
    ];

    try {
        const result = await model.generateContent({
            contents: [{ role: 'user', parts }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: TRANSCRIPTION_RESPONSE_SCHEMA
            }
        });

        const responseText = result.response.text();
        const parsed = JSON.parse(responseText);

        const segments: Omit<Subtitle, 'id'>[] = [];

        if (parsed.segments && Array.isArray(parsed.segments)) {
            for (const seg of parsed.segments) {
                // Adjust timestamps to be relative to the full video
                segments.push({
                    text: seg.speaker ? `[${seg.speaker}] ${seg.text}` : seg.text,
                    start: chunkOffset + (seg.startTime || 0),
                    duration: (seg.endTime || seg.startTime + 3) - (seg.startTime || 0)
                });
            }
        }

        return {
            segments,
            summary: parsed.summary || `Transcribed ${segments.length} speech segments.`
        };
    } catch (error: any) {
        console.error("Transcription error:", error);
        throw error;
    }
}

/**
 * Clean up and merge overlapping subtitles
 */
function cleanupSubtitles(subtitles: Omit<Subtitle, 'id'>[]): Subtitle[] {
    // Sort by start time
    const sorted = [...subtitles].sort((a, b) => a.start - b.start);

    const cleaned: Subtitle[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];

        // Adjust duration if it overlaps with next subtitle
        let adjustedDuration = current.duration;
        if (next && current.start + current.duration > next.start) {
            adjustedDuration = Math.max(0.5, next.start - current.start - 0.1);
        }

        // Skip very short or empty subtitles
        if (adjustedDuration < 0.3 || !current.text.trim()) continue;

        // Skip placeholder text
        if (current.text === '[...]' || current.text.trim() === '') continue;

        cleaned.push({
            id: generateId(),
            text: current.text.trim(),
            start: Math.max(0, current.start),
            duration: adjustedDuration
        });
    }

    return cleaned;
}

export interface SubtitleGenerationResult {
    subtitles: Subtitle[];
    summary: string;
}

/**
 * Main function to generate subtitles from video through audio transcription
 */
export async function generateSubtitles(
    videoElement: HTMLVideoElement,
    config: Partial<SubtitleGenerationConfig> = {},
    onProgress?: (progress: number, status: string) => void
): Promise<SubtitleGenerationResult> {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };

    onProgress?.(0, "Preparing audio extraction...");

    try {
        // Extract video as base64 (much faster than WAV conversion)
        onProgress?.(5, "Preparing video for analysis...");

        const { base64, mimeType, duration } = await extractMediaAsBase64(
            videoElement.src,
            (p) => onProgress?.(5 + p * 0.4, "Processing video...")
        );

        onProgress?.(50, "Transcribing speech with AI...");

        // Send directly to Gemini (supports video/audio natively)
        const result = await transcribeMediaWithGemini(
            base64,
            mimeType,
            duration,
            0,
            finalConfig,
            (p) => onProgress?.(50 + p * 0.4, "Transcribing speech...")
        );

        onProgress?.(90, "Processing subtitles...");

        // Clean up and return
        const cleanedSubtitles = cleanupSubtitles(result.segments);

        onProgress?.(100, "Done!");

        return {
            subtitles: cleanedSubtitles,
            summary: result.summary || `Generated ${cleanedSubtitles.length} subtitles from speech transcription.`
        };

    } catch (error: any) {
        console.error("Audio transcription failed:", error);

        // If audio extraction fails, fall back to visual analysis
        if (error.message?.includes('decodeAudioData') ||
            error.message?.includes('No audio track') ||
            error.message?.includes('captureStream')) {
            onProgress?.(10, "Audio extraction failed, using visual analysis...");
            return fallbackToVisualAnalysis(videoElement, onProgress);
        }

        throw error;
    }
}

/**
 * Fallback: Visual analysis if audio extraction fails
 */
async function fallbackToVisualAnalysis(
    videoElement: HTMLVideoElement,
    onProgress?: (progress: number, status: string) => void
): Promise<SubtitleGenerationResult> {
    const duration = videoElement.duration;
    const samplingInterval = duration < 30 ? 2 : duration < 60 ? 3 : 5;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 640;
    canvas.height = 360;

    const frames: { timestamp: number; imageBase64: string }[] = [];
    const timestamps: number[] = [];

    for (let t = 0; t < duration; t += samplingInterval) {
        timestamps.push(t);
    }

    // Capture frames
    for (let i = 0; i < timestamps.length; i++) {
        const timestamp = timestamps[i];

        videoElement.currentTime = timestamp;
        await new Promise<void>((resolve) => {
            const handler = () => {
                videoElement.removeEventListener('seeked', handler);
                resolve();
            };
            videoElement.addEventListener('seeked', handler);
        });

        await new Promise(r => setTimeout(r, 50));
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        frames.push({
            timestamp,
            imageBase64: canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
        });

        onProgress?.(10 + (i / timestamps.length) * 30, "Capturing frames...");
    }

    // Analyze with Gemini (visual)
    onProgress?.(45, "Analyzing video content...");

    const client = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = client.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: `Analyze these video frames and generate descriptive captions for what's happening.
        Create subtitle-style captions that describe the visual content and any apparent dialogue or action.`
    });

    const allSubtitles: Omit<Subtitle, 'id'>[] = [];
    const BATCH_SIZE = 8;

    for (let i = 0; i < frames.length; i += BATCH_SIZE) {
        const batch = frames.slice(i, i + BATCH_SIZE);

        const parts: any[] = [
            { text: `Generate captions for these ${batch.length} frames. Timestamps: ${batch.map(f => `${f.timestamp.toFixed(1)}s`).join(', ')}` }
        ];

        for (const frame of batch) {
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: frame.imageBase64 } });
        }

        try {
            const result = await model.generateContent({
                contents: [{ role: 'user', parts }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: SchemaType.OBJECT,
                        properties: {
                            subtitles: {
                                type: SchemaType.ARRAY,
                                items: {
                                    type: SchemaType.OBJECT,
                                    properties: {
                                        timestamp: { type: SchemaType.NUMBER },
                                        text: { type: SchemaType.STRING },
                                        duration: { type: SchemaType.NUMBER }
                                    },
                                    required: ['timestamp', 'text', 'duration']
                                }
                            }
                        },
                        required: ['subtitles']
                    }
                }
            });

            const parsed = JSON.parse(result.response.text());
            if (parsed.subtitles) {
                for (const sub of parsed.subtitles) {
                    allSubtitles.push({
                        text: sub.text,
                        start: sub.timestamp,
                        duration: sub.duration || samplingInterval
                    });
                }
            }
        } catch (e) {
            console.error("Visual analysis error:", e);
        }

        onProgress?.(45 + ((i + BATCH_SIZE) / frames.length) * 45, "Generating captions...");

        if (i + BATCH_SIZE < frames.length) {
            await new Promise(r => setTimeout(r, 300));
        }
    }

    const cleaned = cleanupSubtitles(allSubtitles);

    return {
        subtitles: cleaned,
        summary: `Generated ${cleaned.length} captions using visual analysis (audio extraction was not available).`
    };
}
