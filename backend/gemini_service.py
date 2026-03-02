
"""
Lumina AI — Gemini Integration Service
Uses Google Gemini REST API to provide intelligent responses and parse complex commands
that the rule-based engine cannot handle. No SDK dependency — uses httpx directly.
"""

import json
import os
import re
from typing import Optional
import httpx

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"]


# The system prompt that teaches Gemini about Lumina's capabilities
SYSTEM_PROMPT = """You are Lumina AI, a smart video editing assistant built into the Lumina video editor.
You help users edit their videos using natural language commands.

You have two responsibilities:
1. Answer general questions about video editing, the app, or anything the user asks — give concise, helpful answers.
2. When the user gives a video editing instruction, return structured JSON actions that the editor can execute.

Available actions you can return:
- set_speed: {action: "set_speed", parameters: {value: <number>}}  — e.g., 0.5 for slow-mo, 2.0 for 2x speed
- set_volume: {action: "set_volume", parameters: {value: <number 0-1>}}  — e.g., 0.5 for 50%
- apply_filter: {action: "apply_filter", parameters: {value: "<filter>"}}  — filters: grayscale, sepia, vintage, cyberpunk, warm, invert, blur, dramatic, noir, technicolor
- set_transition: {action: "set_transition", parameters: {value: "<transition>"}}  — transitions: fade, slide-left, slide-right, zoom-in, zoom-out, blur-dissolve
- trim_clip: {action: "trim_clip", parameters: {targetClipId: "<id>", startOffset: <seconds>, endOffset: <seconds>}}
- split_clip: {action: "split_clip", parameters: {timestamp: <seconds>, targetClipId: "<id>"}}
- remove_clip: {action: "remove_clip", parameters: {targetClipId: "<id>"}}
- seek_to: {action: "seek_to", parameters: {timestamp: <seconds>}}
- add_subtitles: {action: "add_subtitles", parameters: {}}
- enhance_audio: {action: "enhance_audio", parameters: {}}

RESPONSE FORMAT — you MUST respond with valid JSON in this exact structure:
{
  "actions": [... array of action objects, or empty [] if just answering a question],
  "reply": "Your conversational reply to the user"
}

Rules:
- If the user asks a question (not an editing command), return empty actions [] and answer in "reply".
- If the user gives an editing command, return the appropriate actions AND a friendly reply explaining what you did.
- Always be concise, helpful, and friendly. Keep replies under 3 sentences.
- Never mention that you're using JSON or structured actions — just talk naturally.
- If the user's project has clips, use their actual clip IDs when returning actions.
- You are an expert at video editing, color grading, pacing, transitions, and storytelling.
"""


def ask_gemini(
    prompt: str,
    project_manifest: dict,
    api_key: Optional[str] = None,
    current_frame_base64: Optional[str] = None,
) -> Optional[dict]:
    """
    Send a prompt to Gemini REST API and get structured actions + reply.
    Returns None if Gemini is unavailable.
    Returns {"actions": [...], "reply": "..."} on success.
    """
    key = api_key or os.environ.get("GEMINI_API_KEY", "")
    if not key:
        return None

    # Build context about the current project
    clips_info = project_manifest.get("clips", [])
    clips_desc = ""
    if clips_info:
        clips_desc = "Current timeline clips:\n"
        for c in clips_info:
            clips_desc += f"  - ID: {c.get('id')}, Name: {c.get('name')}, Start: {c.get('start')}s, Duration: {c.get('duration')}s, Filter: {c.get('filter', 'none')}\n"
    else:
        clips_desc = "No clips on the timeline yet."

    current_time = project_manifest.get("currentTime", 0)

    user_message = f"""Project context:
{clips_desc}
Current playback position: {current_time}s

User says: "{prompt}"

Respond with JSON only. No markdown, no code fences, just raw JSON."""

    # Build the Gemini REST API request
    request_body = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": SYSTEM_PROMPT}]
            },
            {
                "role": "model",
                "parts": [{"text": '{"actions": [], "reply": "I\'m Lumina AI, ready to help you edit your video! What would you like to do?"}'}]
            },
            {
                "role": "user",
                "parts": [{"text": user_message}]
            }
        ],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 1024,
        }
    }

    try:
        # Try each model until one succeeds
        last_error = None
        response = None
        for model_name in GEMINI_MODELS:
            url = f"{GEMINI_API_BASE}/{model_name}:generateContent?key={key}"
            try:
                response = httpx.post(
                    url,
                    json=request_body,
                    headers={"Content-Type": "application/json"},
                    timeout=30.0,
                )
                if response.status_code == 200:
                    break
                elif response.status_code == 429:
                    print(f"[Gemini] Rate limited on {model_name}, trying next model...")
                    last_error = f"Rate limited on {model_name}"
                    continue
                else:
                    print(f"[Gemini] API error {response.status_code} on {model_name}: {response.text[:200]}")
                    last_error = f"API error {response.status_code}"
                    continue
            except httpx.TimeoutException:
                print(f"[Gemini] Timeout on {model_name}, trying next...")
                last_error = "Timeout"
                continue

        if response is None or response.status_code != 200:
            print(f"[Gemini] All models failed. Last error: {last_error}")
            return None

        data = response.json()

        # Extract text from Gemini response
        text = ""
        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except (KeyError, IndexError):
            print(f"[Gemini] Unexpected response structure: {json.dumps(data)[:300]}")
            return None

        # Clean up response — remove markdown code fences if present
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()

        result = json.loads(text)

        # Validate structure
        if "actions" not in result:
            result["actions"] = []
        if "reply" not in result:
            result["reply"] = "Done!"

        # Ensure actions is a list
        if not isinstance(result["actions"], list):
            result["actions"] = []

        # Validate each action
        valid_actions = []
        valid_action_types = {
            "set_speed", "set_volume", "apply_filter", "set_custom_filter",
            "set_transition", "trim_clip", "remove_clip", "split_clip",
            "seek_to", "add_subtitles", "enhance_audio", "focus_object",
            "keep_only_highlights",
        }
        for action in result["actions"]:
            if isinstance(action, dict) and action.get("action") in valid_action_types:
                valid_actions.append(action)

        result["actions"] = valid_actions
        return result

    except json.JSONDecodeError as e:
        print(f"[Gemini] JSON parse error: {e}")
        # Try to return just the raw text as a reply
        try:
            return {"actions": [], "reply": text[:500]}
        except:
            return {"actions": [], "reply": "I had trouble processing that. Could you rephrase?"}
    except Exception as e:
        print(f"[Gemini] Error: {e}")
        return None


def is_gemini_available(api_key: Optional[str] = None) -> bool:
    """Check if Gemini can be used."""
    key = api_key or os.environ.get("GEMINI_API_KEY", "")
    return bool(key)


# ── Thumbnail Selection ─────────────────────────────────────────────────

def select_best_thumbnail(
    candidates: list[dict],
    video_context: str = "",
    api_key: Optional[str] = None,
) -> dict:
    """
    Use Gemini Vision to choose the most engaging thumbnail frame from candidates.

    Each candidate must contain:
      - 'image_small_base64': base64-encoded JPEG (640×360) for Gemini
      - 'timestamp', 'score', 'reason': metadata from OpenCV analysis

    Returns the winning candidate dict with extra keys:
      - 'gemini_reason' : Gemini's explanation for the choice
      - 'gemini_selected_index' : 0-based index into candidates
    """
    if not candidates:
        raise ValueError("No candidates provided")

    key = api_key or os.environ.get("GEMINI_API_KEY", "")
    if not key:
        # No Gemini key — fall back to the highest-scored candidate
        best = max(candidates, key=lambda c: c["score"])
        return {**best, "gemini_reason": "Selected by visual quality score (no Gemini key)", "gemini_selected_index": candidates.index(best)}

    context_line = f" Video context: {video_context}." if video_context else ""

    instruction = (
        f"You are an expert YouTube thumbnail designer.{context_line}\n\n"
        f"I am showing you {len(candidates)} candidate frames extracted from a video. "
        "Pick the single frame that would make the MOST compelling, click-worthy thumbnail.\n\n"
        "Evaluate each frame on:\n"
        "  1. Visual sharpness and clarity — not blurry, not mid-transition, not black/white flash.\n"
        "  2. Emotional impact — faces with strong expression, dramatic action, exciting moment.\n"
        "  3. Color vibrancy — bright, well-lit, saturated. Avoid dull, dark, or washed-out frames.\n"
        "  4. Composition — subject is prominent and well-framed, occupies meaningful screen space.\n"
        "  5. Storytelling — captures the essence or a peak moment of the video.\n\n"
        "Each frame is labelled Frame 1, Frame 2, … in order.\n"
        "Respond with ONLY a JSON object, no markdown, no explanation outside JSON:\n"
        '{"selected": <1-based frame number>, "reason": "<one sentence why this frame wins>"}'
    )

    parts: list[dict] = [{"text": instruction}]
    for i, candidate in enumerate(candidates):
        parts.append({
            "text": (
                f"Frame {i + 1} — timestamp {candidate['timestamp']}s, "
                f"OpenCV quality score {candidate['score']}/10 ({candidate.get('reason', '')}):"
            )
        })
        parts.append({
            "inline_data": {
                "mime_type": "image/jpeg",
                "data": candidate["image_small_base64"],
            }
        })

    request_body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 256,
        },
    }

    vision_models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]

    try:
        response = None
        for model_name in vision_models:
            url = f"{GEMINI_API_BASE}/{model_name}:generateContent?key={key}"
            try:
                response = httpx.post(
                    url,
                    json=request_body,
                    headers={"Content-Type": "application/json"},
                    timeout=60.0,
                )
                if response.status_code == 200:
                    break
                print(f"[Gemini Thumbnail] {response.status_code} on {model_name}: {response.text[:120]}")
            except httpx.TimeoutException:
                print(f"[Gemini Thumbnail] Timeout on {model_name}")

        if response is None or response.status_code != 200:
            best = max(candidates, key=lambda c: c["score"])
            return {**best, "gemini_reason": "Gemini unavailable — using top-scored frame", "gemini_selected_index": candidates.index(best)}

        data = response.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()

        # Strip markdown fences if present
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()

        parsed = json.loads(text)
        idx = max(0, min(int(parsed.get("selected", 1)) - 1, len(candidates) - 1))
        reason = parsed.get("reason", "Selected by Gemini AI")

        print(f"[Gemini Thumbnail] Selected Frame {idx + 1} at {candidates[idx]['timestamp']}s — {reason}")
        return {**candidates[idx], "gemini_reason": reason, "gemini_selected_index": idx}

    except json.JSONDecodeError as e:
        print(f"[Gemini Thumbnail] JSON parse error: {e} | raw: {text[:200]}")
        best = max(candidates, key=lambda c: c["score"])
        return {**best, "gemini_reason": "Parse error — using top-scored frame", "gemini_selected_index": candidates.index(best)}
    except Exception as e:
        print(f"[Gemini Thumbnail] Error: {e}")
        best = max(candidates, key=lambda c: c["score"])
        return {**best, "gemini_reason": f"Error fallback: {e}", "gemini_selected_index": candidates.index(best)}
