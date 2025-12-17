/// <reference types="vite/client" />
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AIEngineResponse } from "../types";

// Initialize Gemini Client
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
  console.error("VITE_GEMINI_API_KEY is not set in .env.local");
}
const ai = new GoogleGenAI({ apiKey: apiKey || "" });

const SYSTEM_INSTRUCTION = `
You are Lumina AI, an expert video editing assistant. Your goal is to help users edit videos by interpreting their natural language requests into structured commands.

You can control the following aspects of the video editor:
1. Speed (playback rate): Normal is 1.0. High speed > 1.0. Slow motion < 1.0.
2. Volume: 0.0 to 1.0.
3. Filters: 'grayscale', 'sepia', 'vintage', 'cyberpunk', 'warm', 'none'.
4. Custom Filters: You can create ANY visual effect using CSS filter strings.
   - Example: "Make it look like a dream" -> action: "set_custom_filter", value: "blur(4px) brightness(1.2) saturate(1.5)"
   - Example: "High contrast and cold" -> action: "set_custom_filter", value: "contrast(150%) hue-rotate(180deg)"
5. Transitions: You can fade the video in or out.
   - Example: "Fade in for 2 seconds" -> action: "set_transition", value: "in:2"
   - Example: "Fade out over 5 seconds" -> action: "set_transition", value: "out:5"
   - Example: "Add a 3 second fade to start and end" -> action: "set_transition", value: "both:3"
6. Mood Analysis: Analyzing the content of the video.

When the user asks to "analyze" or "what is happening", providing a creative description based on the visual input is your priority.

Output JSON strictly matching the schema provided.
`;

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    action: {
      type: Type.STRING,
      enum: ['set_speed', 'set_volume', 'apply_filter', 'set_custom_filter', 'set_transition', 'trim', 'analyze_mood', 'unknown'],
      description: "The specific editing action to take based on the user prompt."
    },
    parameters: {
      type: Type.OBJECT,
      properties: {
        value: {
            type: Type.STRING, // Using string to accommodate mixed types, we parse manually if needed or keep simple
            description: "The value for the action (e.g., '1.5', 'blur(5px)', 'in:2')."
        },
        description: {
            type: Type.STRING,
            description: "A short text summary of what is being done or the analysis result."
        }
      }
    },
    reply: {
      type: Type.STRING,
      description: "A conversational response to the user explaining what you did."
    }
  },
  required: ['action', 'reply']
};

export const processUserCommand = async (
  prompt: string, 
  currentFrameBase64?: string
): Promise<AIEngineResponse> => {
  try {
    const parts: any[] = [{ text: prompt }];

    // If we have a frame, attach it for multimodal analysis
    if (currentFrameBase64) {
      // Remove header if present (data:image/jpeg;base64,)
      const cleanBase64 = currentFrameBase64.split(',')[1] || currentFrameBase64;
      parts.unshift({
        inlineData: {
          mimeType: 'image/jpeg',
          data: cleanBase64
        }
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        role: 'user',
        parts: parts
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const parsed: AIEngineResponse = JSON.parse(text);
    return parsed;

  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      action: 'unknown',
      reply: "I'm having trouble connecting to the AI brain right now. Please try again."
    };
  }
};