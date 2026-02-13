"""
Lumina AI — Video Analysis Engine (Python + OpenCV)
Extracts keyframes, computes frame statistics, scores moments, generates highlight reels.
Uses OpenCV for superior computer vision — Sobel edges, optical-flow motion, HSV colorfulness.
No third-party AI. Pure algorithmic analysis.
"""

import math
import base64
import tempfile
import os
from dataclasses import dataclass, asdict
from typing import Optional

import cv2
import numpy as np


# ── Data structures ─────────────────────────────────────────────────────

@dataclass
class FrameStats:
    brightness: float      # 0-255
    contrast: float        # std dev of luma
    colorfulness: float    # HSV saturation metric
    edge_density: float    # Sobel edge magnitude
    motion_score: float    # inter-frame optical flow magnitude


@dataclass
class MomentAnalysis:
    timestamp: float
    interest_score: int    # 1-10
    reason: str
    suggested_duration: float


@dataclass
class BestMomentsConfig:
    target_duration: float = 30.0
    sampling_interval: float = 30.0
    min_clip_length: float = 2.0
    max_clip_length: float = 6.0


@dataclass
class FrameData:
    timestamp: float
    image_base64: str      # JPEG base64 (no data-url prefix)


# ── Frame statistics (OpenCV) ───────────────────────────────────────────

def compute_frame_stats(
    frame: np.ndarray,
    prev_gray: Optional[np.ndarray] = None
) -> FrameStats:
    """Compute visual statistics for a single BGR frame using OpenCV."""
    h, w = frame.shape[:2]

    # Convert to grayscale for brightness/contrast
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))

    # Colorfulness via HSV saturation channel
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    saturation = hsv[:, :, 1].astype(np.float32)
    colorfulness = float(np.mean(saturation))

    # Edge density via Sobel operator (much better than pixel-diff)
    sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    edge_mag = np.sqrt(sobel_x ** 2 + sobel_y ** 2)
    edge_density = float(np.mean(edge_mag))

    # Motion via dense optical flow (Farneback)
    motion_score = 0.0
    if prev_gray is not None:
        flow = cv2.calcOpticalFlowFarneback(
            prev_gray, gray, None,
            pyr_scale=0.5, levels=3, winsize=15,
            iterations=3, poly_n=5, poly_sigma=1.2, flags=0
        )
        mag, _ = cv2.cartToPolar(flow[..., 0], flow[..., 1])
        motion_score = float(np.mean(mag))

    return FrameStats(
        brightness=brightness,
        contrast=contrast,
        colorfulness=colorfulness,
        edge_density=edge_density,
        motion_score=motion_score,
    )


def score_frame(stats: FrameStats) -> int:
    """Score a frame 1-10 based on visual metrics."""
    score = 0.0

    # Good brightness (not too dark/bright) — target 80-180
    penalty = abs(stats.brightness - 130) / 130
    score += (1 - penalty) * 2.0  # 0-2

    # High contrast is interesting
    score += min(stats.contrast / 40, 2.5)  # 0-2.5

    # Colorful frames are more interesting
    score += min(stats.colorfulness / 80, 2.0)  # 0-2

    # Edge density = visual complexity
    score += min(stats.edge_density / 30, 1.5)  # 0-1.5

    # Motion = action
    score += min(stats.motion_score / 3.0, 2.0)  # 0-2 (optical flow scale is different)

    return max(1, min(10, round(score)))


def describe_frame(stats: FrameStats, score: int) -> str:
    """Generate a human-readable description of a frame."""
    parts: list[str] = []

    if stats.motion_score > 3.0:
        parts.append("high action/movement")
    elif stats.motion_score > 1.5:
        parts.append("moderate activity")
    else:
        parts.append("static scene")

    if stats.brightness > 180:
        parts.append("bright/well-lit")
    elif stats.brightness < 60:
        parts.append("dark/moody")

    if stats.contrast > 50:
        parts.append("high contrast")
    if stats.colorfulness > 80:
        parts.append("vibrant colors")
    if stats.edge_density > 25:
        parts.append("visually complex")

    if score >= 9:
        parts.insert(0, "exceptional moment")
    elif score >= 7:
        parts.insert(0, "strong moment")
    elif score >= 5:
        parts.insert(0, "decent moment")

    return ", ".join(parts)


# ── Keyframe extraction ────────────────────────────────────────────────

def extract_keyframes(
    video_path: str,
    interval_seconds: float = 30.0,
) -> list[FrameData]:
    """Extract JPEG keyframes from a video file at regular intervals."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0

    frames: list[FrameData] = []
    t = 0.0
    while t < duration:
        frame_no = int(t * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
        ret, frame = cap.read()
        if not ret:
            break

        # Resize to 640x360 for consistency
        frame_resized = cv2.resize(frame, (640, 360))
        _, buf = cv2.imencode(".jpg", frame_resized, [cv2.IMWRITE_JPEG_QUALITY, 70])
        b64 = base64.b64encode(buf).decode("utf-8")

        frames.append(FrameData(timestamp=round(t, 2), image_base64=b64))
        t += interval_seconds

    cap.release()
    return frames


# ── Frame analysis ──────────────────────────────────────────────────────

def analyze_frames_for_highlights(
    video_path: str,
    interval_seconds: float = 30.0,
) -> list[MomentAnalysis]:
    """Analyze a video file frame-by-frame and return scored moments."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0

    moments: list[MomentAnalysis] = []
    prev_gray: Optional[np.ndarray] = None
    t = 0.0

    while t < duration:
        frame_no = int(t * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
        ret, frame = cap.read()
        if not ret:
            break

        frame_resized = cv2.resize(frame, (640, 360))
        gray = cv2.cvtColor(frame_resized, cv2.COLOR_BGR2GRAY)

        stats = compute_frame_stats(frame_resized, prev_gray)
        sc = score_frame(stats)
        reason = describe_frame(stats, sc)

        suggested = 5.0 if sc >= 9 else 4.0 if sc >= 7 else 3.0 if sc >= 5 else 2.0

        moments.append(MomentAnalysis(
            timestamp=round(t, 2),
            interest_score=sc,
            reason=reason,
            suggested_duration=suggested,
        ))

        prev_gray = gray
        t += interval_seconds

    cap.release()
    return moments


# ── Best moments orchestrator ───────────────────────────────────────────

def generate_best_moments_edit(
    moments: list[MomentAnalysis],
    config: BestMomentsConfig | None = None,
) -> list[dict]:
    """Select top moments and generate a keep_only_highlights action."""
    cfg = config or BestMomentsConfig()

    sorted_moments = sorted(
        [m for m in moments if m.interest_score >= 7],
        key=lambda m: m.interest_score,
        reverse=True,
    )

    selected: list[MomentAnalysis] = []
    total_dur = 0.0

    for m in sorted_moments:
        clip_dur = min(max(m.suggested_duration, cfg.min_clip_length), cfg.max_clip_length)
        if total_dur + clip_dur <= cfg.target_duration:
            selected.append(MomentAnalysis(
                timestamp=m.timestamp,
                interest_score=m.interest_score,
                reason=m.reason,
                suggested_duration=clip_dur,
            ))
            total_dur += clip_dur
        if total_dur >= cfg.target_duration:
            break

    selected.sort(key=lambda m: m.timestamp)

    # Build highlight ranges
    ranges_raw = [
        {"start": max(0, m.timestamp - 0.5), "end": m.timestamp + m.suggested_duration}
        for m in selected
    ]

    # Merge overlapping ranges
    merged: list[dict] = []
    for r in ranges_raw:
        if not merged:
            merged.append(dict(r))
        else:
            last = merged[-1]
            if r["start"] <= last["end"] + 0.5:
                last["end"] = max(last["end"], r["end"])
            else:
                merged.append(dict(r))

    return [{
        "action": "keep_only_highlights",
        "parameters": {
            "ranges": merged,
            "transition": "fade",
            "filter": "dramatic",
        }
    }]


def extract_best_moments(
    video_path: str,
    config: dict | None = None,
) -> dict:
    """
    Full best-moments pipeline: extract → analyze → select.
    Returns: {"moments": [...], "actions": [...], "summary": "..."}
    """
    cfg = BestMomentsConfig(**(config or {}))

    # Get video duration
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    cap.release()

    # Adjust interval for long videos
    if duration > 7200:
        cfg.sampling_interval = 120
    elif duration > 3600:
        cfg.sampling_interval = 60

    moments = analyze_frames_for_highlights(video_path, cfg.sampling_interval)
    actions = generate_best_moments_edit(moments, cfg)

    top = sorted(
        [m for m in moments if m.interest_score >= 7],
        key=lambda m: m.interest_score,
        reverse=True,
    )[:5]

    summary = (
        f"Found {len(top)} great moments! Top highlights: {', '.join(m.reason for m in top)}"
        if top
        else "Couldn't find enough standout moments. Try a video with more action or variety."
    )

    return {
        "moments": [asdict(m) for m in moments],
        "actions": actions,
        "summary": summary,
    }
