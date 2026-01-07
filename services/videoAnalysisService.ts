import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from "@google/generative-ai";
import { MomentAnalysis, FrameData, BestMomentsConfig, BestMomentsResult, AIAction } from "../types";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

const DEFAULT_CONFIG: BestMomentsConfig = {
    targetDuration: 30,
    samplingInterval: 30, // Sample every 30 seconds
    minClipLength: 2,
    maxClipLength: 6,
};

const ANALYSIS_SYSTEM_INSTRUCTION = `
You are an expert video editor AI analyzing video frames to identify the BEST MOMENTS for a highlight reel.

For each frame, evaluate:
1. Visual Interest: Action, movement, dramatic composition
2. Emotional Impact: Expressions, reactions, key events
3. Scene Quality: Lighting, framing, visual appeal
4. Story Value: Important events, transitions, climaxes

Score each moment from 1-10:
- 1-3: Boring, static, low quality
- 4-6: Decent but not highlight-worthy
- 7-8: Good moment, should consider for highlights
- 9-10: Exceptional moment, must include

Be SELECTIVE. A 1-hour video should have only 5-10 truly great moments.
`;

const MOMENTS_RESPONSE_SCHEMA: ResponseSchema = {
    type: SchemaType.OBJECT,
    properties: {
        moments: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    timestamp: { type: SchemaType.NUMBER },
                    interestScore: { type: SchemaType.NUMBER },
                    reason: { type: SchemaType.STRING },
                    suggestedDuration: { type: SchemaType.NUMBER }
                },
                required: ['timestamp', 'interestScore', 'reason', 'suggestedDuration']
            }
        },
        summary: { type: SchemaType.STRING }
    },
    required: ['moments', 'summary']
};

/**
 * Extract keyframes from a video element at regular intervals
 */
export async function extractKeyframes(
    videoElement: HTMLVideoElement,
    intervalSeconds: number = 30,
    onProgress?: (progress: number) => void
): Promise<FrameData[]> {
    const frames: FrameData[] = [];
    const duration = videoElement.duration;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) throw new Error("Could not create canvas context");

    // Set canvas size (smaller for API efficiency)
    canvas.width = 640;
    canvas.height = 360;

    const timestamps: number[] = [];
    for (let t = 0; t < duration; t += intervalSeconds) {
        timestamps.push(t);
    }

    for (let i = 0; i < timestamps.length; i++) {
        const timestamp = timestamps[i];

        // Seek to timestamp
        videoElement.currentTime = timestamp;
        await new Promise<void>((resolve) => {
            const handler = () => {
                videoElement.removeEventListener('seeked', handler);
                resolve();
            };
            videoElement.addEventListener('seeked', handler);
        });

        // Capture frame
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        const imageBase64 = canvas.toDataURL('image/jpeg', 0.7);

        frames.push({
            timestamp,
            imageBase64: imageBase64.split(',')[1] // Remove data URL prefix
        });

        if (onProgress) {
            onProgress((i + 1) / timestamps.length * 50); // First 50% is frame extraction
        }
    }

    return frames;
}

/**
 * Analyze frames using Gemini AI to identify best moments
 */
export async function analyzeFramesForHighlights(
    frames: FrameData[],
    videoDuration: number,
    onProgress?: (progress: number) => void
): Promise<MomentAnalysis[]> {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key is not configured");
    }

    const client = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = client.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
        systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION
    });

    // Process frames in batches to avoid API limits
    const BATCH_SIZE = 10;
    const allMoments: MomentAnalysis[] = [];

    for (let i = 0; i < frames.length; i += BATCH_SIZE) {
        const batch = frames.slice(i, i + BATCH_SIZE);

        const parts: any[] = [
            {
                text: `Analyze these ${batch.length} frames from a ${Math.round(videoDuration / 60)} minute video. 
               Timestamps: ${batch.map(f => `${f.timestamp.toFixed(1)}s`).join(', ')}.
               Rate each moment and suggest how long (2-6 seconds) it should appear in a highlight reel.`
            }
        ];

        // Add images
        for (const frame of batch) {
            parts.push({
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: frame.imageBase64
                }
            });
        }

        try {
            const result = await model.generateContent({
                contents: [{ role: 'user', parts }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: MOMENTS_RESPONSE_SCHEMA
                }
            });

            const responseText = result.response.text();
            const parsed = JSON.parse(responseText);

            if (parsed.moments && Array.isArray(parsed.moments)) {
                allMoments.push(...parsed.moments);
            }
        } catch (error) {
            console.error(`Error analyzing batch ${i / BATCH_SIZE + 1}:`, error);
            // Continue with other batches
        }

        if (onProgress) {
            const batchProgress = ((i + BATCH_SIZE) / frames.length) * 50;
            onProgress(50 + batchProgress); // Second 50% is AI analysis
        }

        // Rate limiting delay between batches
        if (i + BATCH_SIZE < frames.length) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    return allMoments;
}

/**
 * Generate edit actions to create a highlight reel from analyzed moments
 * Returns a single action that keeps only the highlight portions
 */
export function generateBestMomentsEdit(
    moments: MomentAnalysis[],
    config: BestMomentsConfig = DEFAULT_CONFIG
): AIAction[] {
    // Sort by interest score (highest first)
    const sortedMoments = [...moments]
        .filter(m => m.interestScore >= 7) // Only use good moments
        .sort((a, b) => b.interestScore - a.interestScore);

    // Select moments that fit within target duration
    const selectedMoments: MomentAnalysis[] = [];
    let totalDuration = 0;

    for (const moment of sortedMoments) {
        const clipDuration = Math.min(
            Math.max(moment.suggestedDuration, config.minClipLength),
            config.maxClipLength
        );

        if (totalDuration + clipDuration <= config.targetDuration) {
            selectedMoments.push({ ...moment, suggestedDuration: clipDuration });
            totalDuration += clipDuration;
        }

        if (totalDuration >= config.targetDuration) break;
    }

    // Sort selected moments by timestamp for chronological order
    selectedMoments.sort((a, b) => a.timestamp - b.timestamp);

    // Create highlight ranges (start and end times for each highlight)
    const highlightRanges = selectedMoments.map(m => ({
        start: Math.max(0, m.timestamp - 0.5), // Start half second before peak
        end: m.timestamp + m.suggestedDuration,
        score: m.interestScore,
        reason: m.reason
    }));

    // Merge overlapping ranges
    const mergedRanges: { start: number; end: number }[] = [];
    for (const range of highlightRanges) {
        if (mergedRanges.length === 0) {
            mergedRanges.push({ start: range.start, end: range.end });
        } else {
            const last = mergedRanges[mergedRanges.length - 1];
            if (range.start <= last.end + 0.5) { // Merge if within 0.5s
                last.end = Math.max(last.end, range.end);
            } else {
                mergedRanges.push({ start: range.start, end: range.end });
            }
        }
    }

    const actions: AIAction[] = [];

    // Main action: keep only the highlight portions
    actions.push({
        action: 'keep_only_highlights',
        parameters: {
            ranges: mergedRanges,
            transition: 'fade',
            filter: 'dramatic'
        }
    });

    return actions;
}

/**
 * Main function to extract best moments from a video
 */
export async function extractBestMoments(
    videoElement: HTMLVideoElement,
    config: Partial<BestMomentsConfig> = {},
    onProgress?: (progress: number, status: string) => void
): Promise<BestMomentsResult> {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const duration = videoElement.duration;

    // Adjust sampling interval for very long videos
    if (duration > 3600) { // > 1 hour
        finalConfig.samplingInterval = 60; // Sample every minute
    } else if (duration > 7200) { // > 2 hours
        finalConfig.samplingInterval = 120; // Sample every 2 minutes
    }

    onProgress?.(0, "Extracting keyframes...");

    // Step 1: Extract keyframes
    const frames = await extractKeyframes(
        videoElement,
        finalConfig.samplingInterval,
        (p) => onProgress?.(p * 0.5, "Extracting keyframes...")
    );

    onProgress?.(50, "Analyzing moments with AI...");

    // Step 2: Analyze with AI
    const moments = await analyzeFramesForHighlights(
        frames,
        duration,
        (p) => onProgress?.(50 + p * 0.4, "Analyzing moments with AI...")
    );

    onProgress?.(90, "Generating highlight reel...");

    // Step 3: Generate edit actions
    const actions = generateBestMomentsEdit(moments, finalConfig);

    // Create summary
    const topMoments = moments
        .filter(m => m.interestScore >= 7)
        .sort((a, b) => b.interestScore - a.interestScore)
        .slice(0, 5);

    const summary = topMoments.length > 0
        ? `Found ${topMoments.length} great moments! Top highlights: ${topMoments.map(m => m.reason).join(', ')}`
        : "Couldn't find enough standout moments. Try a video with more action or variety.";

    onProgress?.(100, "Done!");

    return { moments, actions, summary };
}
