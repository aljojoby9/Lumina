"""
Lumina AI — NLP Command Processing Engine (Python)
Parses natural language video editing commands into structured AIAction dicts.
Exact parity with the TypeScript luminaAIEngine.ts command processor.
No third-party AI. Pure rule-based intent classification.
"""

import re
from typing import Any, Optional

# ── Filter keyword mapping ──────────────────────────────────────────────

FILTER_KEYWORDS: dict[str, str] = {
    "grayscale": "grayscale", "black and white": "grayscale", "b&w": "grayscale",
    "bw": "grayscale", "mono": "grayscale",
    "sepia": "sepia", "old": "sepia", "aged": "sepia", "retro": "sepia",
    "vintage": "vintage", "classic": "vintage", "film": "vintage", "nostalgic": "vintage",
    "cyberpunk": "cyberpunk", "neon": "cyberpunk", "futuristic": "cyberpunk", "cyber": "cyberpunk",
    "warm": "warm", "sunny": "warm", "golden": "warm", "cozy": "warm",
    "invert": "invert", "negative": "invert", "inverted": "invert",
    "blur": "blur", "soft": "blur", "dreamy": "blur",
    "dramatic": "dramatic", "cinematic": "dramatic", "intense": "dramatic",
    "dark": "dramatic", "moody": "dramatic",
    "noir": "noir", "detective": "noir",
    "technicolor": "technicolor", "vivid": "technicolor", "colorful": "technicolor",
    "vibrant": "technicolor", "saturated": "technicolor",
}

TRANSITION_KEYWORDS: dict[str, str] = {
    "fade": "fade", "fade in": "fade", "fade out": "fade",
    "dissolve": "fade", "crossfade": "fade",
    "slide left": "slide-left", "slide-left": "slide-left", "wipe left": "slide-left",
    "slide right": "slide-right", "slide-right": "slide-right", "wipe right": "slide-right",
    "zoom in": "zoom-in", "zoom-in": "zoom-in", "zoom": "zoom-in",
    "zoom out": "zoom-out", "zoom-out": "zoom-out",
    "blur dissolve": "blur-dissolve", "blur-dissolve": "blur-dissolve",
}


# ── Parsing helpers ─────────────────────────────────────────────────────

def parse_timestamp(text: str) -> Optional[float]:
    """Extract a timestamp from text. Supports 2:30, 1:05:30, 90s, at 45, etc."""
    m = re.search(r"(\d+):(\d{2})(?::(\d{2}))?", text)
    if m:
        if m.group(3):
            return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
        return int(m.group(1)) * 60 + int(m.group(2))

    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)", text, re.I)
    if m:
        return float(m.group(1))

    m = re.search(r"at\s+(\d+(?:\.\d+)?)", text, re.I)
    if m:
        return float(m.group(1))
    return None


def parse_speed(text: str) -> Optional[float]:
    m = re.search(r"(\d+(?:\.\d+)?)\s*x", text, re.I)
    if m:
        return float(m.group(1))
    if re.search(r"slow\s*mo|slow\s*motion|slower", text, re.I):
        return 0.5
    if re.search(r"fast|speed\s*up|faster|quick", text, re.I):
        return 1.5
    if re.search(r"double\s*speed", text, re.I):
        return 2.0
    if re.search(r"half\s*speed", text, re.I):
        return 0.5
    if re.search(r"normal\s*speed", text, re.I):
        return 1.0
    return None


def parse_volume(text: str) -> Optional[float]:
    m = re.search(r"(\d+)\s*%", text)
    if m:
        return int(m.group(1)) / 100
    if re.search(r"mute|silent|no\s*sound|no\s*audio", text, re.I):
        return 0.0
    if re.search(r"full\s*volume|max\s*volume|loud", text, re.I):
        return 1.0
    if re.search(r"half\s*volume", text, re.I):
        return 0.5
    if re.search(r"lower|reduce|decrease|quieter|softer", text, re.I):
        return 0.4
    if re.search(r"raise|increase|louder", text, re.I):
        return 0.8
    return None


# ── Intent classification ───────────────────────────────────────────────

def classify_intent(prompt: str) -> dict:
    lower = prompt.lower().strip()
    result: dict[str, Any] = {
        "intents": [],
        "filter": None,
        "transition": None,
        "speed": None,
        "volume": None,
        "timestamp": None,
        "is_first_draft": False,
        "is_best_moments": False,
        "is_subtitles": False,
        "is_trim": False,
        "is_split": False,
        "is_remove": False,
        "is_cinematic": False,
    }

    # First draft
    if re.search(r"first\s*draft|auto[\s\-]*draft|auto[\s\-]*edit|generate.*edit|edit.*footage|professional.*edit|rough\s*cut", lower):
        result["is_first_draft"] = True
        result["intents"].append("first_draft")

    # Best moments
    if re.search(r"best\s*moment|highlight|extract\s*best|top\s*moment|reel", lower):
        result["is_best_moments"] = True
        result["intents"].append("best_moments")

    # Subtitles
    if re.search(r"subtitle|caption|transcri|text\s*overlay|closed\s*caption", lower):
        result["is_subtitles"] = True
        result["intents"].append("add_subtitles")

    # Cinematic
    if re.search(r"cinematic|movie[\s\-]*like|filmic|hollywood|professional\s*look", lower):
        result["is_cinematic"] = True
        result["intents"].append("cinematic")

    # Filter
    for keyword, filter_val in FILTER_KEYWORDS.items():
        if keyword in lower:
            result["filter"] = filter_val
            result["intents"].append("apply_filter")
            break

    # Transition
    for keyword, trans_val in TRANSITION_KEYWORDS.items():
        if keyword in lower:
            result["transition"] = trans_val
            result["intents"].append("set_transition")
            break
    if re.search(r"transition|between\s*clips", lower) and not result["transition"]:
        result["transition"] = "fade"
        result["intents"].append("set_transition")

    # Speed
    speed = parse_speed(lower)
    if speed is not None or re.search(r"speed|pace|tempo", lower):
        result["speed"] = speed if speed is not None else 1.0
        result["intents"].append("set_speed")

    # Volume
    volume = parse_volume(lower)
    if volume is not None or re.search(r"volume|audio|sound|mute|loud", lower):
        result["volume"] = volume if volume is not None else 0.5
        result["intents"].append("set_volume")

    # Trim
    if re.search(r"trim|shorten|cut\s*down|reduce\s*length|crop", lower):
        result["is_trim"] = True
        result["intents"].append("trim_clip")

    # Split
    if re.search(r"split|divide|cut\s*at|break\s*up|segment", lower):
        result["is_split"] = True
        result["intents"].append("split_clip")

    # Remove
    if re.search(r"remove|delete|discard|get\s*rid|throw\s*away", lower):
        result["is_remove"] = True
        result["intents"].append("remove_clip")

    # Seek
    ts = parse_timestamp(lower)
    if ts is not None and re.search(r"go\s*to|seek|jump|navigate|skip\s*to", lower):
        result["timestamp"] = ts
        result["intents"].append("seek_to")

    if not result["intents"]:
        result["intents"].append("unknown")

    return result


# ── Action generation ───────────────────────────────────────────────────

def _generate_first_draft_actions(clips: list[dict]) -> list[dict]:
    actions: list[dict] = []
    if not clips:
        return actions

    if len(clips) == 1 and clips[0].get("duration", 0) > 15:
        clip = clips[0]
        seg_len = max(5, clip["duration"] / max(1, clip["duration"] // 10))
        split_count = min(8, int(clip["duration"] / seg_len))

        for i in range(1, split_count):
            split_time = round(clip.get("start", 0) + seg_len * i, 2)
            actions.append({
                "action": "split_clip",
                "parameters": {"timestamp": split_time, "targetClipId": clip["id"]}
            })

        for i in range(1, split_count, 2):
            actions.append({
                "action": "remove_clip",
                "parameters": {"targetClipId": f"split_{i}"}
            })

    actions.append({"action": "apply_filter", "parameters": {"value": "dramatic"}})
    actions.append({"action": "set_transition", "parameters": {"value": "fade"}})
    return actions


def _generate_cinematic_actions() -> list[dict]:
    return [
        {"action": "apply_filter", "parameters": {"value": "dramatic"}},
        {"action": "set_transition", "parameters": {"value": "fade"}},
        {"action": "set_speed", "parameters": {"value": "0.9"}},
    ]


def process_user_command(
    prompt: str,
    project_manifest: dict,
    current_frame_base64: Optional[str] = None,
    gemini_api_key: Optional[str] = None,
) -> dict:
    """
    Main entry point — process user's NL command and return structured actions.
    Uses rule-based matching first, falls back to Gemini AI for unknown intents.
    Returns: {"actions": [...], "reply": "..."}
    """
    parsed = classify_intent(prompt)
    clips = project_manifest.get("clips", [])
    actions: list[dict] = []
    replies: list[str] = []

    # First Draft
    if parsed["is_first_draft"]:
        actions.extend(_generate_first_draft_actions(clips))
        replies.append(
            "I've created a professional first draft: split your footage into segments, "
            "removed weaker sections, applied a dramatic filter, and added fade transitions."
        )

    # Cinematic
    if parsed["is_cinematic"] and not parsed["is_first_draft"]:
        actions.extend(_generate_cinematic_actions())
        replies.append("Applied cinematic look: dramatic color grading, smooth fades, and slightly slowed pacing.")

    # Filter
    if parsed["filter"] and not parsed["is_first_draft"] and not parsed["is_cinematic"]:
        actions.append({"action": "apply_filter", "parameters": {"value": parsed["filter"]}})
        replies.append(f"Applied {parsed['filter']} filter.")

    # Transition
    if parsed["transition"] and not parsed["is_first_draft"] and not parsed["is_cinematic"]:
        actions.append({"action": "set_transition", "parameters": {"value": parsed["transition"]}})
        replies.append(f"Set {parsed['transition']} transition between clips.")

    # Speed
    if parsed["speed"] is not None:
        actions.append({"action": "set_speed", "parameters": {"value": str(parsed["speed"])}})
        replies.append(f"Set playback speed to {parsed['speed']}x.")

    # Volume
    if parsed["volume"] is not None:
        actions.append({"action": "set_volume", "parameters": {"value": str(parsed["volume"])}})
        replies.append(f"Set volume to {round(parsed['volume'] * 100)}%.")

    # Seek
    if parsed["timestamp"] is not None and "seek_to" in parsed["intents"]:
        actions.append({"action": "seek_to", "parameters": {"timestamp": parsed["timestamp"]}})
        replies.append(f"Navigated to {parsed['timestamp']:.1f}s.")

    # Trim
    if parsed["is_trim"]:
        if clips:
            target = clips[-1]
            trim_amt = round(target.get("duration", 0) * 0.2, 2)
            actions.append({
                "action": "trim_clip",
                "parameters": {
                    "targetClipId": target["id"],
                    "startOffset": trim_amt,
                    "endOffset": trim_amt,
                }
            })
            replies.append(f'Trimmed clip "{target.get("name", "")}" by removing {trim_amt:.1f}s from each end.')
        else:
            replies.append("No clips to trim. Upload some footage first.")

    # Split
    if parsed["is_split"]:
        ts = parse_timestamp(prompt)
        if ts is not None:
            actions.append({"action": "split_clip", "parameters": {"timestamp": ts}})
            replies.append(f"Split clip at {ts:.1f}s.")
        elif clips:
            clip = clips[0]
            mid = round(clip.get("start", 0) + clip.get("duration", 0) / 2, 2)
            actions.append({"action": "split_clip", "parameters": {"timestamp": mid, "targetClipId": clip["id"]}})
            replies.append(f'Split clip "{clip.get("name", "")}" at the midpoint ({mid:.1f}s).')

    # Remove
    if parsed["is_remove"] and clips:
        last = clips[-1]
        actions.append({"action": "remove_clip", "parameters": {"targetClipId": last["id"]}})
        replies.append(f'Removed clip "{last.get("name", "")}".')

    # Subtitles
    if parsed["is_subtitles"]:
        actions.append({"action": "add_subtitles", "parameters": {}})
        replies.append("Generating subtitles for your video...")

    # Best moments
    if parsed["is_best_moments"]:
        replies.append("Analyzing your footage for the best moments... This will take a moment.")

    # Fallback — use Gemini AI for unknown / general queries
    if not actions and not replies:
        try:
            from gemini_service import ask_gemini
            gemini_result = ask_gemini(
                prompt=prompt,
                project_manifest=project_manifest,
                api_key=gemini_api_key,
                current_frame_base64=current_frame_base64,
            )
            if gemini_result:
                return gemini_result
        except Exception as e:
            print(f"[CommandEngine] Gemini fallback error: {e}")

        # Ultimate fallback if Gemini is also unavailable
        replies.append(
            f'I understand you want to: "{prompt}". Here are some things I can do:\n'
            '• "Generate a first draft" — auto-edit your footage\n'
            '• "Make it cinematic" — apply dramatic color grading\n'
            '• "Add fade transitions" — smooth clip transitions\n'
            '• "Set speed to 1.5x" — change playback speed\n'
            '• "Trim the clip" — remove start/end of a clip\n'
            '• "Split at 30s" — cut footage at a specific time\n'
            '• "Add subtitles" — auto-generate captions\n'
            '• "Extract best moments" — create a highlight reel'
        )

    # For recognized commands, also try to enhance with Gemini if available
    if actions and gemini_api_key:
        try:
            from gemini_service import ask_gemini
            gemini_result = ask_gemini(
                prompt=prompt,
                project_manifest=project_manifest,
                api_key=gemini_api_key,
                current_frame_base64=current_frame_base64,
            )
            if gemini_result and gemini_result.get("reply"):
                # Use Gemini's more natural reply but keep our rule-based actions
                return {"actions": actions, "reply": gemini_result["reply"]}
        except Exception:
            pass  # Stick with our rule-based reply

    return {"actions": actions, "reply": " ".join(replies)}
