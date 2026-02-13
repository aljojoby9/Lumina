"""
Lumina AI — FastAPI Backend Server
Serves the custom AI engine over HTTP for the React frontend.
All processing is local — no third-party AI APIs.

Endpoints:
  POST /api/command                          — NL command → edit actions
  POST /api/analyze                          — Video file → best moments
  POST /api/subtitles                        — Video file → speech transcription
  GET  /api/health                           — Server health check
  POST /api/files/upload                     — Upload a media file
  GET  /api/files/{user_id}/{project_id}/{file_id} — Download / stream a media file
  DELETE /api/files/{user_id}/{project_id}/{file_id} — Delete a media file
  POST /api/files/export                     — Upload an exported video
  GET  /api/exports/{project_id}/{filename}  — Download an exported video
"""

import glob
import os
import shutil
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from command_engine import process_user_command
from video_analysis import extract_best_moments, analyze_frames_for_highlights, extract_keyframes
from subtitle_engine import generate_subtitles

app = FastAPI(
    title="Lumina AI Engine",
    description="Custom-built video editing AI — no third-party AI dependencies",
    version="1.0.0",
)

# CORS — allow the Vite dev server and any localhost frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://0.0.0.0:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Persistent media storage directory ──────────────────────────────────

MEDIA_DIR = Path(__file__).resolve().parent / "media"
MEDIA_DIR.mkdir(exist_ok=True)
EXPORTS_DIR = MEDIA_DIR / "exports"
EXPORTS_DIR.mkdir(exist_ok=True)


# ── Request / Response models ───────────────────────────────────────────

class CommandRequest(BaseModel):
    prompt: str
    project_manifest: dict
    current_frame_base64: Optional[str] = None


class CommandResponse(BaseModel):
    actions: list[dict]
    reply: str


class AnalysisResponse(BaseModel):
    moments: list[dict]
    actions: list[dict]
    summary: str


class SubtitleResponse(BaseModel):
    subtitles: list[dict]
    summary: str


class HealthResponse(BaseModel):
    status: str
    engine: str
    version: str
    capabilities: list[str]


# ── Helper: save uploaded file temporarily ──────────────────────────────

def _save_upload(file: UploadFile) -> str:
    suffix = os.path.splitext(file.filename or "video.mp4")[1] or ".mp4"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    shutil.copyfileobj(file.file, tmp)
    tmp.close()
    return tmp.name


# ── Routes ──────────────────────────────────────────────────────────────

@app.get("/api/health", response_model=HealthResponse)
async def health():
    """Check server status and list available capabilities."""
    caps = ["command_processing", "video_analysis", "best_moments"]

    # Check if Vosk is available for speech recognition
    try:
        from subtitle_engine import VOSK_AVAILABLE, _get_vosk_model
        if VOSK_AVAILABLE and _get_vosk_model() is not None:
            caps.append("speech_transcription")
        else:
            caps.append("visual_captioning_only")
    except Exception:
        caps.append("visual_captioning_only")

    return HealthResponse(
        status="ok",
        engine="Lumina AI Engine (Python)",
        version="1.0.0",
        capabilities=caps,
    )


@app.post("/api/command", response_model=CommandResponse)
async def command(req: CommandRequest):
    """
    Process a natural language editing command.
    Input: user prompt + project manifest (clips, state, etc.)
    Output: structured actions + reply text.
    """
    try:
        result = process_user_command(
            prompt=req.prompt,
            project_manifest=req.project_manifest,
            current_frame_base64=req.current_frame_base64,
        )
        return CommandResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze", response_model=AnalysisResponse)
async def analyze_video(
    file: UploadFile = File(...),
    target_duration: float = Form(30.0),
    sampling_interval: float = Form(30.0),
    min_clip_length: float = Form(2.0),
    max_clip_length: float = Form(6.0),
):
    """
    Analyze a video file for best moments / highlight reel.
    Upload the video file. Returns scored moments + edit actions.
    """
    video_path = _save_upload(file)
    try:
        config = {
            "target_duration": target_duration,
            "sampling_interval": sampling_interval,
            "min_clip_length": min_clip_length,
            "max_clip_length": max_clip_length,
        }
        result = extract_best_moments(video_path, config)
        return AnalysisResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(video_path):
            os.unlink(video_path)


@app.post("/api/subtitles", response_model=SubtitleResponse)
async def subtitles(
    file: UploadFile = File(...),
    language: str = Form("en"),
    start_time: float = Form(0.0),
    end_time: Optional[float] = Form(None),
):
    """
    Generate subtitles / transcription for a video file.
    Uses Vosk offline speech recognition or visual captioning fallback.
    """
    video_path = _save_upload(file)
    try:
        config = {
            "language": language,
            "start_time": start_time,
        }
        if end_time is not None:
            config["end_time"] = end_time

        result = generate_subtitles(video_path, config)
        return SubtitleResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(video_path):
            os.unlink(video_path)


# ── File Storage Routes ─────────────────────────────────────────────────

class UploadResponse(BaseModel):
    url: str
    file_id: str
    size: int


@app.post("/api/files/upload", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    project_id: str = Form(...),
    file_id: str = Form(...),
):
    """
    Upload a media file (raw video, image, audio).
    Stored persistently at media/{user_id}/{project_id}/{file_id}.{ext}
    """
    ext = os.path.splitext(file.filename or "video.mp4")[1] or ".mp4"
    dest_dir = MEDIA_DIR / user_id / project_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / f"{file_id}{ext}"

    try:
        with open(dest_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        file_size = dest_path.stat().st_size
        download_url = f"/api/files/{user_id}/{project_id}/{file_id}"

        return UploadResponse(url=download_url, file_id=file_id, size=file_size)
    except Exception as e:
        if dest_path.exists():
            dest_path.unlink()
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")


@app.get("/api/files/{user_id}/{project_id}/{file_id}")
async def download_file(user_id: str, project_id: str, file_id: str):
    """
    Serve a stored media file. Supports range requests for video streaming.
    """
    dest_dir = MEDIA_DIR / user_id / project_id
    # Find the file — it could have any extension
    matches = list(dest_dir.glob(f"{file_id}.*")) if dest_dir.exists() else []

    if not matches:
        raise HTTPException(status_code=404, detail=f"File not found: {file_id}")

    file_path = matches[0]

    # Determine media type from extension
    ext = file_path.suffix.lower()
    media_types = {
        ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
        ".avi": "video/x-msvideo", ".mkv": "video/x-matroska",
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".gif": "image/gif", ".webp": "image/webp",
        ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=file_path.name,
    )


@app.delete("/api/files/{user_id}/{project_id}/{file_id}")
async def delete_file(user_id: str, project_id: str, file_id: str):
    """
    Delete a stored media file.
    """
    dest_dir = MEDIA_DIR / user_id / project_id
    matches = list(dest_dir.glob(f"{file_id}.*")) if dest_dir.exists() else []

    if not matches:
        raise HTTPException(status_code=404, detail=f"File not found: {file_id}")

    for f in matches:
        f.unlink()

    # Clean up empty directories
    if dest_dir.exists() and not any(dest_dir.iterdir()):
        dest_dir.rmdir()
        parent = MEDIA_DIR / user_id
        if parent.exists() and not any(parent.iterdir()):
            parent.rmdir()

    return {"status": "deleted", "file_id": file_id}


@app.post("/api/files/export", response_model=UploadResponse)
async def upload_export(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    filename: str = Form("export.webm"),
):
    """
    Upload an exported / rendered video.
    Stored at media/exports/{project_id}/{filename}
    """
    dest_dir = EXPORTS_DIR / project_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / filename

    try:
        with open(dest_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        file_size = dest_path.stat().st_size
        download_url = f"/api/exports/{project_id}/{filename}"

        return UploadResponse(url=download_url, file_id=filename, size=file_size)
    except Exception as e:
        if dest_path.exists():
            dest_path.unlink()
        raise HTTPException(status_code=500, detail=f"Export upload failed: {e}")


@app.get("/api/exports/{project_id}/{filename}")
async def download_export(project_id: str, filename: str):
    """
    Serve an exported video file.
    """
    file_path = EXPORTS_DIR / project_id / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Export not found: {filename}")

    return FileResponse(
        path=str(file_path),
        media_type="video/webm",
        filename=filename,
    )


# ── Entry point ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("  Lumina AI Engine — Python Backend")
    print("  No third-party AI. All processing is local.")
    print(f"  Media storage: {MEDIA_DIR}")
    print("=" * 60)
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
