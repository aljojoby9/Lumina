"""
Lumina AI — Subtitle / Speech Transcription Engine (Python)
Uses OpenAI Whisper (via faster-whisper) for accurate, multilingual,
fully offline speech recognition with auto language detection.
Falls back to OpenCV-based visual captioning when audio is unavailable.
No third-party AI APIs. Everything runs locally.
"""

import os
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

# faster-whisper — CTranslate2 optimized Whisper
try:
    from faster_whisper import WhisperModel
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False

# Keep backward compat for health check
VOSK_AVAILABLE = WHISPER_AVAILABLE


# ── Data structures ─────────────────────────────────────────────────────

@dataclass
class Subtitle:
    id: str
    text: str
    start: float
    duration: float


@dataclass
class SubtitleConfig:
    language: str = "auto"
    chunk_duration: float = 30.0
    start_time: float = 0.0
    end_time: Optional[float] = None


# ── Audio extraction (FFmpeg) ───────────────────────────────────────────

def _extract_audio_wav(video_path: str, output_path: str, sample_rate: int = 16000) -> bool:
    """Extract audio from video as mono 16kHz WAV using FFmpeg."""
    try:
        cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vn",                    # no video
            "-acodec", "pcm_s16le",   # 16-bit PCM
            "-ar", str(sample_rate),  # 16kHz
            "-ac", "1",               # mono
            output_path
        ]
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=120
        )
        return result.returncode == 0 and os.path.exists(output_path)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


# ── Whisper speech recognition ──────────────────────────────────────────

# Cache the model so it's loaded once
_whisper_model: Optional[object] = None


def _get_whisper_model() -> Optional["WhisperModel"]:
    """Load the Whisper model (cached). Auto-downloads on first use (~150MB)."""
    global _whisper_model

    if not WHISPER_AVAILABLE:
        return None

    if _whisper_model is not None:
        return _whisper_model

    try:
        # "base" is a good balance of accuracy and speed
        # Use "small" for better accuracy if the machine can handle it
        _whisper_model = WhisperModel(
            "base",
            device="cpu",
            compute_type="int8",  # Fastest on CPU
        )
        print("[Lumina] Whisper model loaded (base, CPU, int8)")
        return _whisper_model
    except Exception as e:
        print(f"[Lumina] Failed to load Whisper model: {e}")
        return None


# Backward compat alias for health check
def _get_vosk_model():
    return _get_whisper_model()


def transcribe_with_whisper(
    video_path: str,
    language: str = "auto",
    start_time: float = 0.0,
    end_time: Optional[float] = None,
) -> tuple[list[dict], str]:
    """
    Transcribe speech from a video file using Whisper (fully offline).
    Returns (segments, detected_language).
    Each segment: {"text": str, "start": float, "duration": float}
    """
    model = _get_whisper_model()
    if model is None:
        raise RuntimeError("Whisper model not available")

    # Extract audio to temp WAV
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = tmp.name

    try:
        if not _extract_audio_wav(video_path, wav_path):
            raise RuntimeError("Failed to extract audio (FFmpeg required)")

        # Transcribe with Whisper
        transcribe_kwargs = {
            "word_timestamps": True,
            "vad_filter": True,       # Filter out non-speech
            "vad_parameters": {
                "min_silence_duration_ms": 500,
            },
        }

        # Auto-detect language or use specified
        if language and language != "auto":
            transcribe_kwargs["language"] = language

        segments_gen, info = model.transcribe(wav_path, **transcribe_kwargs)
        detected_lang = info.language
        print(f"[Lumina] Detected language: {detected_lang} (probability: {info.language_probability:.2f})")

        segments: list[dict] = []
        for segment in segments_gen:
            seg_start = segment.start
            seg_end = segment.end
            text = segment.text.strip()

            if not text:
                continue

            # Apply time range filter
            if end_time and seg_start > end_time:
                break
            if seg_start < start_time:
                continue

            segments.append({
                "text": text,
                "start": round(seg_start, 2),
                "duration": round(max(0.5, seg_end - seg_start), 2),
            })

        return segments, detected_lang

    finally:
        if os.path.exists(wav_path):
            os.unlink(wav_path)


# ── Visual captioning fallback (OpenCV) ─────────────────────────────────

def _compute_simple_stats(frame: np.ndarray, prev_gray=None):
    """Lightweight stats for visual captioning."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))

    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    colorfulness = float(np.mean(hsv[:, :, 1]))

    sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    edge_density = float(np.mean(np.sqrt(sobel_x ** 2 + sobel_y ** 2)))

    motion = 0.0
    if prev_gray is not None:
        flow = cv2.calcOpticalFlowFarneback(
            prev_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0
        )
        mag, _ = cv2.cartToPolar(flow[..., 0], flow[..., 1])
        motion = float(np.mean(mag))

    return {
        "brightness": brightness,
        "contrast": contrast,
        "colorfulness": colorfulness,
        "edge_density": edge_density,
        "motion": motion,
    }, gray


def fallback_visual_captioning(video_path: str) -> list[dict]:
    """Generate descriptive captions from video frames when audio/speech is unavailable."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0

    interval = 2 if duration < 30 else 3 if duration < 60 else 5
    captions: list[dict] = []
    prev_gray = None
    t = 0.0

    while t < duration:
        frame_no = int(t * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
        ret, frame = cap.read()
        if not ret:
            break

        frame_resized = cv2.resize(frame, (640, 360))
        stats, gray = _compute_simple_stats(frame_resized, prev_gray)

        # Generate descriptive caption
        caption = ""
        if prev_gray is not None and stats["motion"] > 4.0:
            caption = "Scene change detected"
        elif stats["motion"] > 3.0:
            caption = "Action sequence"
        elif stats["brightness"] > 200:
            caption = "Bright outdoor scene"
        elif stats["brightness"] < 40:
            caption = "Dark/night scene"
        elif stats["colorfulness"] > 100:
            caption = "Colorful visual"
        elif stats["contrast"] > 60:
            caption = "High contrast scene"
        elif stats["motion"] < 0.5 and stats["edge_density"] < 10:
            caption = "Still/quiet moment"
        else:
            caption = "Continuing scene"

        if stats["edge_density"] > 30:
            caption += " — complex visual"
        if stats["colorfulness"] > 60 and stats["brightness"] > 100:
            caption += " — vivid"

        captions.append({"text": caption, "start": round(t, 2), "duration": interval})
        prev_gray = gray
        t += interval

    cap.release()

    # Merge consecutive identical captions
    merged: list[dict] = []
    for cap_item in captions:
        if merged and merged[-1]["text"] == cap_item["text"]:
            merged[-1]["duration"] += cap_item["duration"]
        else:
            merged.append(dict(cap_item))

    return merged


# ── Cleanup ─────────────────────────────────────────────────────────────

def cleanup_subtitles(raw: list[dict]) -> list[dict]:
    """Sort, merge overlaps, filter junk."""
    sorted_subs = sorted(raw, key=lambda s: s["start"])
    cleaned: list[dict] = []

    for i, cur in enumerate(sorted_subs):
        nxt = sorted_subs[i + 1] if i + 1 < len(sorted_subs) else None
        dur = cur["duration"]

        if nxt and cur["start"] + dur > nxt["start"]:
            dur = max(0.5, nxt["start"] - cur["start"] - 0.1)

        text = cur.get("text", "").strip()
        if dur < 0.3 or not text or text == "[...]":
            continue

        cleaned.append({
            "id": uuid.uuid4().hex[:9],
            "text": text,
            "start": max(0, cur["start"]),
            "duration": dur,
        })

    return cleaned


# ── Main entry point ────────────────────────────────────────────────────

def generate_subtitles(
    video_path: str,
    config: dict | None = None,
) -> dict:
    """
    Generate subtitles for a video file.
    Uses Whisper speech recognition (offline, multilingual, auto-detect language).
    Falls back to visual captioning only if audio extraction fails.
    Returns: {"subtitles": [...], "summary": "..."}
    """
    cfg = SubtitleConfig(**(config or {}))

    try:
        # Use Whisper for accurate speech recognition
        segments, detected_lang = transcribe_with_whisper(
            video_path,
            language=cfg.language,
            start_time=cfg.start_time,
            end_time=cfg.end_time,
        )

        if segments:
            cleaned = cleanup_subtitles(segments)

            # Filter by time range
            if cfg.end_time:
                cleaned = [
                    s for s in cleaned
                    if s["start"] < cfg.end_time and s["start"] + s["duration"] > cfg.start_time
                ]

            lang_name = detected_lang.upper() if detected_lang else "unknown"
            return {
                "subtitles": cleaned,
                "summary": f"Transcribed {len(cleaned)} speech segments in {lang_name} using Whisper (offline). Language auto-detected.",
            }

    except Exception as e:
        print(f"[Lumina] Speech recognition failed: {e}")

    # Fallback to visual captioning
    try:
        raw = fallback_visual_captioning(video_path)
        cleaned = cleanup_subtitles(raw)
        return {
            "subtitles": cleaned,
            "summary": f"Generated {len(cleaned)} visual captions (speech recognition was not available).",
        }
    except Exception as e:
        return {
            "subtitles": [],
            "summary": f"Subtitle generation failed: {e}",
        }
