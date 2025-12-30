
import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from "@google/generative-ai";
import { AIEngineResponse } from "../types";

// WARNING: Never hardcode API keys in client-side code!
// For now, we'll use an environment variable. In production, use a backend proxy.
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

const SYSTEM_INSTRUCTION = `
You are Lumina AI, an elite professional video editor. Your goal is to turn raw footage into human-quality first drafts.

CAPABILITIES:
1. "seek_to" (timestamp): Navigate the timeline.
2. "apply_filter" (preset): grayscale, sepia, vintage, cyberpunk, warm, invert, blur, dramatic, noir, technicolor.
3. "set_speed" (0.25 to 3.0): Adjust pacing.
4. "set_volume" (0.0 to 1.0): Level audio.
5. "add_subtitles": Generate or add text overlays.
6. "set_transition" (preset): fade, slide-left, slide-right, zoom-in, zoom-out, blur-dissolve.
7. "split_clip" (timestamp): Cut the raw footage at specific interesting points.
8. "remove_clip" (targetClipId): Delete boring segments of the timeline.
9. "trim_clip" (targetClipId, startOffset, endOffset): Shorten a specific clip to the best parts.

AUTO-DRAFT LOGIC:
When generating a "first draft":
- Analyze the timeline. If there is one long raw clip, use 'split_clip' multiple times to isolate the best moments.
- Use 'remove_clip' to discard the parts in between (long silences, static backgrounds).
- Apply a professional 'apply_filter' (like 'vintage' or 'dramatic') across the whole project.
- Add 'set_transition' (like 'fade' or 'blur-dissolve') between clips.
- ALWAYS respond with a structured sequence of actions.

Output strict JSON. Be a decisive editor.
`;

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    actions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          action: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ['set_speed', 'set_volume', 'apply_filter', 'set_custom_filter', 'set_transition', 'trim_clip', 'remove_clip', 'split_clip', 'seek_to', 'add_subtitles', 'enhance_audio', 'focus_object', 'unknown']
          },
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              value: { type: SchemaType.STRING },
              timestamp: { type: SchemaType.NUMBER },
              targetClipId: { type: SchemaType.STRING },
              startOffset: { type: SchemaType.NUMBER },
              endOffset: { type: SchemaType.NUMBER },
              subtitles: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    text: { type: SchemaType.STRING },
                    start: { type: SchemaType.NUMBER },
                    duration: { type: SchemaType.NUMBER }
                  }
                }
              }
            }
          }
        },
        required: ['action']
      }
    },
    reply: { type: SchemaType.STRING }
  },
  required: ['actions', 'reply']
};

export const processUserCommand = async (
  prompt: string,
  projectManifest: any,
  currentFrameBase64?: string
): Promise<AIEngineResponse> => {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error("Gemini API key is not configured. Please set the VITE_GEMINI_API_KEY environment variable.");
    }

    console.log("Starting AI request with Gemini SDK");

    const client = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = client.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      systemInstruction: SYSTEM_INSTRUCTION
    });

    const contextPrompt = `
      Current Project State: ${JSON.stringify(projectManifest)}
      User Directive: ${prompt}
      
      Generate a professional first draft if requested. Ensure you use split_clip and remove_clip to actually edit the footage.
    `;

    const parts: any[] = [{ text: contextPrompt }];

    // Add image if provided
    if (currentFrameBase64) {
      const imageData = currentFrameBase64.split(',')[1] || currentFrameBase64;
      parts.unshift({
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageData
        }
      });
    }

    console.log("Calling Gemini API with structured output");

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    });

    const responseText = result.response.text();
    console.log("API Response:", responseText.substring(0, 200));

    const parsed = JSON.parse(responseText) as AIEngineResponse;

    // Validate response structure
    if (!parsed.actions || !Array.isArray(parsed.actions)) {
      console.error("Invalid response structure:", parsed);
      throw new Error("Invalid response structure from AI");
    }

    return parsed;
  } catch (error: any) {
    console.error("AI Service Error Details:", {
      message: error?.message,
      stack: error?.stack,
      error: error
    });

    let errorMessage = "I encountered an error while processing your request. Please try again.";

    // Check for specific error types with more detail
    const errorMsg = error?.message?.toLowerCase() || "";
    const errorStr = JSON.stringify(error).toLowerCase();

    if (errorMsg.includes("api_key") || errorMsg.includes("api key") || errorStr.includes("api_key") || errorMsg.includes("401") || errorMsg.includes("unauthorized")) {
      errorMessage = "The Gemini API key is missing or invalid. Please check your API key configuration in the .env file.";
    } else if (errorMsg.includes("quota") || errorMsg.includes("rate limit") || errorMsg.includes("429")) {
      errorMessage = "I've hit a rate limit. Please wait a moment and try again.";
    } else if (errorMsg.includes("network") || errorMsg.includes("fetch") || errorMsg.includes("failed to fetch")) {
      errorMessage = "Network error. Please check your connection and try again.";
    } else if (errorMsg.includes("json") || errorMsg.includes("parse") || errorMsg.includes("syntax")) {
      errorMessage = "I had trouble understanding the response. Let me try a different approach - can you rephrase your request?";
    } else if (errorMsg.includes("403") || errorMsg.includes("forbidden")) {
      errorMessage = "Access forbidden. Please check your API key has the necessary permissions.";
    } else if (errorMsg.includes("cors")) {
      errorMessage = "CORS error - this usually means the API configuration is incorrect. Check your API key and permissions.";
    } else {
      // Include the actual error message for debugging
      errorMessage = `Error: ${error?.message || "Unknown error occurred"}. Please check the console for details.`;
    }

    return {
      actions: [],
      reply: errorMessage
    };
  }
};
