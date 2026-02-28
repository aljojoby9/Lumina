
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
