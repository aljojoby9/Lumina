/**
 * Lumina AI — Python Backend Client
 * Calls the Python FastAPI server for AI processing.
 * Drop-in replacement for luminaAIEngine.ts functions.
 *
 * To use the Python backend instead of the TypeScript engine:
 *   1. Start the Python server: cd backend && python main.py
 *   2. In Editor.tsx, change imports from './luminaAIEngine' to './pythonBackendClient'
 *
 * The Python backend provides:
 *   - OpenCV-powered video analysis (Sobel edges, optical flow, HSV color)
 *   - Vosk offline speech recognition (no API calls)
 *   - Same NLP command engine ported to Python
 */

import { AIEngineResponse, AIAction, BestMomentsResult, Subtitle } from "../types";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

// ── Command Processing ────────────────────────────────────────────────

export async function processUserCommand(
    prompt: string,
    projectManifest: any,
    currentFrameBase64?: string
): Promise<AIEngineResponse> {
    try {
        const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
        const res = await fetch(`${BACKEND_URL}/api/command`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt,
                project_manifest: projectManifest,
                current_frame_base64: currentFrameBase64 || null,
                gemini_api_key: geminiApiKey || null,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(err.detail || "Backend error");
        }

        return await res.json();
    } catch (error: any) {
        console.error("Python backend command error:", error);

        if (error.message?.includes("Failed to fetch") || error.message?.includes("NetworkError")) {
            return {
                actions: [],
                reply: "Cannot reach the Python AI backend. Make sure it's running: cd backend && python main.py",
            };
        }

        return {
            actions: [],
            reply: `Error: ${error.message}`,
        };
    }
}


// ── Best Moments / Video Analysis ─────────────────────────────────────

export interface SubtitleGenerationConfig {
    language: string;
    chunkDuration: number;
    startTime?: number;
    endTime?: number;
}

export interface SubtitleGenerationResult {
    subtitles: Subtitle[];
    summary: string;
}

/**
 * Upload a video file to the Python backend for best-moments analysis.
 * The frontend must provide the video File object (not a URL).
 */
export async function extractBestMomentsViaBackend(
    videoFile: File,
    config: { targetDuration?: number; samplingInterval?: number; minClipLength?: number; maxClipLength?: number } = {},
    onProgress?: (progress: number, status: string) => void
): Promise<BestMomentsResult> {
    onProgress?.(10, "Uploading video to AI engine...");

    const formData = new FormData();
    formData.append("file", videoFile);
    formData.append("target_duration", String(config.targetDuration ?? 30));
    formData.append("sampling_interval", String(config.samplingInterval ?? 30));
    formData.append("min_clip_length", String(config.minClipLength ?? 2));
    formData.append("max_clip_length", String(config.maxClipLength ?? 6));

    onProgress?.(30, "Analyzing video with AI...");

    const res = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: "POST",
        body: formData,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Analysis failed");
    }

    onProgress?.(90, "Processing results...");
    const data = await res.json();
    onProgress?.(100, "Done!");

    return data;
}

/**
 * Wrapper for extractBestMoments that works with an HTMLVideoElement.
 * Fetches the video URL as a File, then sends to the Python backend.
 */
export async function extractBestMoments(
    videoElement: HTMLVideoElement,
    config: any = {},
    onProgress?: (progress: number, status: string) => void
): Promise<BestMomentsResult> {
    onProgress?.(5, "Preparing video for analysis...");

    // Fetch video as blob from its src URL
    const response = await fetch(videoElement.src);
    const blob = await response.blob();
    const file = new File([blob], "video.mp4", { type: blob.type || "video/mp4" });

    return extractBestMomentsViaBackend(file, config, onProgress);
}


// ── Subtitle Generation ───────────────────────────────────────────────

/**
 * Generate subtitles by sending the video to the Python backend.
 */
export async function generateSubtitles(
    videoElement: HTMLVideoElement,
    config: Partial<SubtitleGenerationConfig> = {},
    onProgress?: (progress: number, status: string) => void
): Promise<SubtitleGenerationResult> {
    onProgress?.(5, "Preparing video for transcription...");

    // Fetch video as blob
    const response = await fetch(videoElement.src);
    const blob = await response.blob();
    const file = new File([blob], "video.mp4", { type: blob.type || "video/mp4" });

    onProgress?.(20, "Uploading to AI engine...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", config.language || "en");
    formData.append("start_time", String(config.startTime ?? 0));
    if (config.endTime !== undefined) {
        formData.append("end_time", String(config.endTime));
    }

    onProgress?.(40, "Transcribing speech...");

    const res = await fetch(`${BACKEND_URL}/api/subtitles`, {
        method: "POST",
        body: formData,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Subtitle generation failed");
    }

    onProgress?.(90, "Processing subtitles...");
    const data = await res.json();
    onProgress?.(100, "Done!");

    return data;
}


// ── Health Check ──────────────────────────────────────────────────────

export async function checkBackendHealth(): Promise<{
    status: string;
    engine: string;
    capabilities: string[];
} | null> {
    try {
        const res = await fetch(`${BACKEND_URL}/api/health`);
        if (res.ok) return await res.json();
        return null;
    } catch {
        return null;
    }
}
