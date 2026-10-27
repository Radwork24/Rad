import { GoogleGenAI } from '@google/genai';
import type { Interactions } from '@google/genai';

export const GEMINI_API_KEY =
  import.meta.env.VITE_GEMINI_API_KEY || '';

export const DEFAULT_GEMINI_MODEL =
  import.meta.env.VITE_GEMINI_MODEL || 'models/gemini-3.8-flash';

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});

const tools: Interactions.Tool[] = [
  {
    type: 'google_search',
  },
];

const generationConfig: any = {
  max_output_tokens: 65536,
  thinking_level: 'medium',
};

export interface ChatMessagePayload {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[];
}

export function getDefaultGeminiModel(): string {
  return DEFAULT_GEMINI_MODEL;
}

import { optimizeConversationContext } from '../utils/contextManager';

/**
 * Requests chat interaction from Google Gemini 3.8 Flash using @google/genai SDK.
 * Supports text and multimodal image inputs.
 * Automatically falls back to Groq Qwen (qwen/qwen3.8-27b) if Gemini fails or returns empty.
 */
export async function requestGeminiChat(
  history: ChatMessagePayload[],
  modelOverride?: string
): Promise<string> {
  const model = modelOverride || DEFAULT_GEMINI_MODEL;

  const optimizedHistory = optimizeConversationContext(history, {
    maxRecentMessages: 8,
    preserveFirstMessage: true,
  });

  // Skip Gemini entirely if no valid key is configured — go straight to fallback
  if (!GEMINI_API_KEY || GEMINI_API_KEY.startsWith('AQ.')) {
    console.warn('⚠️ [Gemini] No valid API key — skipping to Groq fallback immediately.');
    try {
      return await tryGroqFallback(optimizedHistory);
    } catch (groqErr: any) {
      return `⚠️ **AI Error**: No valid Gemini key and Groq fallback also failed: ${groqErr?.message}`;
    }
  }

  let inputText = '';
  if (optimizedHistory.length === 1) {
    inputText = optimizedHistory[0].content;
  } else {
    inputText = optimizedHistory
      .map((msg) => {
        const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'system' ? 'Context' : 'Assistant';
        return `${roleLabel}: ${msg.content}`;
      })
      .join('\n\n');
    inputText += '\n\nAssistant:';
  }

  // Check if any user message has attached images (the latest query)
  const lastUserMessage = [...history].reverse().find((m) => m.role === 'user');
  const attachedImages = lastUserMessage?.images || [];

  let inputPayload: any;
  if (attachedImages.length > 0) {
    const parts: any[] = [];
    attachedImages.forEach((img) => {
      const matches = img.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      const mimeType = matches ? matches[1] : 'image/jpeg';
      const base64Data = matches ? matches[2] : img;
      parts.push({
        type: 'image',
        mime_type: mimeType,
        data: base64Data,
      });
    });
    parts.push({
      type: 'text',
      text: inputText.trim() || 'Please analyze this attached image.',
    });
    inputPayload = parts;
  } else {
    inputPayload = inputText;
  }

  try {
    console.log('🤖 [Gemini] Sending request to', model, '...');
    const interaction = await ai.interactions.create({
      model,
      input: inputPayload,
      tools,
      generation_config: generationConfig,
    });

    // Extract the generated response text from interaction
    if (interaction.output_text && interaction.output_text.trim()) {
      return interaction.output_text.trim();
    }

    if (interaction.steps && interaction.steps.length > 0) {
      const lastStep: any = interaction.steps[interaction.steps.length - 1];
      if (lastStep?.content && Array.isArray(lastStep.content)) {
        const text = lastStep.content
          .flatMap((c: any) => c.parts || [])
          .map((p: any) => p.text || '')
          .join('');
        if (text.trim()) return text.trim();
      }

      for (let i = interaction.steps.length - 1; i >= 0; i--) {
        const step: any = interaction.steps[i];
        if (step?.type === 'model_output' && step.content) {
          const text = step.content
            .flatMap((c: any) => c.parts || [])
            .map((p: any) => p.text || '')
            .join('');
          if (text.trim()) return text.trim();
        }
      }
    }

    // Gemini returned no usable text — try Groq fallback
    console.warn('⚠️ [Gemini] Empty response received, falling back to Groq Qwen...');
    return await tryGroqFallback(history);
  } catch (err: any) {
    console.warn('⚠️ [Gemini] Request failed, falling back to Groq Qwen:', err?.message || err);
    try {
      return await tryGroqFallback(history);
    } catch (groqErr: any) {
      console.error('❌ [Groq Fallback] Also failed:', groqErr?.message || groqErr);
      return `⚠️ **AI Error**: Both Gemini and Groq failed to respond.\n\n- *Gemini:* ${err?.message || 'Unknown error'}\n- *Groq fallback:* ${groqErr?.message || 'Unknown error'}`;
    }
  }
}

/**
 * Groq fallback — called automatically when Gemini is unavailable or over quota.
 * Uses llama-3.1-8b-instant (20k OTPM free tier) for reliable fallback.
 * Strips image data since Groq models are text-only.
 */
async function tryGroqFallback(history: ChatMessagePayload[]): Promise<string> {
  const { requestGroqChat } = await import('./groqService');
  // qwen/qwen3.7-flash supports vision — pass full history including images
  console.log('🔄 [AI Fallback] Gemini unavailable, switching to Rapid Router qwen/qwen3.7-flash (with vision)...');
  const result = await requestGroqChat(history, 'qwen/qwen3.7-flash');
  console.log('✅ [AI Fallback] Got response from Rapid Router qwen/qwen3.7-flash.');
  return result;
}
