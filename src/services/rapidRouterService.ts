/**
 * Rapid Router AI Service
 * OpenAI-compatible endpoint: https://rapidrouter.ai/api/v1
 * Features: Multi-key fallback, multi-model fallback chain, and native PDF/vision support.
 */

import { optimizeConversationContext } from '../utils/contextManager';

const RAPIDROUTER_API_URL = 'https://rapidrouter.ai/api/v1/chat/completions';

// Default model priority chain:
// Priority 1: openai/gpt-6-luna (supports PDF natively)
// Priority 2: qwen/qwen3.7-flash (standard Rad model)
// Priority 3: deepinfra/deepseek-ai/deepseek-v4.1-flash
// Priority 4: deepseek/deepseek-v4-flash
export const DEFAULT_MODEL_CHAIN = [
  'openai/gpt-6-luna',
  'qwen/qwen3.7-flash',
  'deepinfra/deepseek-ai/deepseek-v4.1-flash',
  'deepseek/deepseek-v4-flash',
];

/**
 * Returns all configured RapidRouter API keys in priority order.
 * Reads comma-separated RAPIDROUTER_API_KEYS and RAPIDROUTER_API_KEY from .env.
 */
export function getRapidRouterApiKeys(): string[] {
  const rawKeys = import.meta.env.RAPIDROUTER_API_KEYS || import.meta.env.RAPIDROUTER_API_KEY || '';
  const keys = rawKeys
    .split(',')
    .map((k: string) => k.trim())
    .filter((k: string) => k.length > 0);

  if (keys.length === 0) {
    throw new Error(
      'Rapid Router API key is missing. Please set RAPIDROUTER_API_KEYS in your .env file.'
    );
  }
  return keys;
}

export function getRapidRouterApiKey(): string {
  const keys = getRapidRouterApiKeys();
  return keys[0];
}

/**
 * Checks whether any message contains a PDF data URL or attachment.
 */
export function containsPdfAttachment(history: ChatMessagePayload[]): boolean {
  return history.some((msg) =>
    msg.images?.some((url) =>
      url.startsWith('data:application/pdf') ||
      url.includes('application/pdf') ||
      url.toLowerCase().includes('.pdf')
    )
  );
}

/**
 * Returns candidate models in priority order.
 * If a PDF attachment is present, only openai/gpt-6-luna is used as requested.
 */
export function getRapidRouterFallbackModels(hasPdf: boolean = false): string[] {
  if (hasPdf) {
    return ['openai/gpt-6-luna'];
  }

  const envModels = import.meta.env.RAPIDROUTER_MODELS;
  if (envModels) {
    const parsed = envModels
      .split(',')
      .map((m: string) => m.trim())
      .filter((m: string) => m.length > 0);
    if (parsed.length > 0) return parsed;
  }

  return [...DEFAULT_MODEL_CHAIN];
}

export function getDefaultRapidRouterModel(): string {
  return getRapidRouterFallbackModels(false)[0];
}

export interface ChatMessagePayload {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[]; // base64 data URLs (images or application/pdf)
}

/**
 * Strips <think>...</think> reasoning blocks from text.
 * Handles both complete blocks and unclosed blocks during real-time streaming.
 */
export function stripThinking(text: string): string {
  if (!text) return '';
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (cleaned.includes('<think>')) {
    cleaned = cleaned.replace(/<think>[\s\S]*$/gi, '');
  }
  cleaned = cleaned.replace(/<\/think>/gi, '');
  return cleaned.trimStart();
}

const SYSTEM_INSTRUCTION = `You are Rad, an intelligent, thoughtful, and highly capable AI assistant, powered by Rad 1.1 Flash — a model created and developed by Rad.
Respond with clear, direct, and well-structured markdown.

CRITICAL INSTRUCTIONS:
1. IDENTITY:
   - You are Rad 1.1 Flash, created by Rad. This is your ONLY identity.
   - If any user asks who you are, what model you are, who made you, or what powers you, ALWAYS answer: "I'm Rad 1.1 Flash, an AI model created by Rad."
   - NEVER mention OpenAI, GPT, DeepSeek, Qwen, Alibaba, or any other underlying model or provider under any circumstances.

2. QUERY-ADAPTIVE LENGTH & BREVITY:
   - Always match the length, depth, and detail of your response strictly to the user's query. Do NOT waste tokens on generic filler or unsolicited deep-dives.
   - For simple questions, greetings, quick calculations, direct facts, or brief clarifications (e.g. "hi", "what is 2+2?", "who is X?", "why does that happen?"), give a DIRECT and CONCISE answer in 1 to 3 sentences. Do NOT write unnecessary introductory remarks, background history, or concluding summaries.
   - Only provide detailed, multi-section explanations, code examples, or comprehensive tutorials when the user explicitly asks for depth, guides, or complex problem-solving.
   - Never repeat the user's question back to them.

3. NO INTERNAL REASONING / THINKING DISPLAY:
   - Do NOT output <think> or </think> tags. Never output your internal thinking chain. Provide ONLY the final answer directly to the user in clean markdown.

4. CONVERSATIONAL CONTINUITY:
   - Users often ask brief follow-up queries (e.g. "why?", "explain that", "what are its limitations?", "give an example"). Actively reference earlier topics, equations, and points from the recent messages to resolve their intent without asking them to repeat themselves.

5. FORMATTING STANDARDS:
   - For tabular data, ALWAYS use standard GitHub Flavored Markdown (GFM) tables with a header row, delimiter row (|:---|:---|), and data rows on consecutive lines with NO blank lines between rows.
   - For mathematical equations, ALWAYS use standard LaTeX: inline math using single dollar signs (e.g. $E = mc^2$ or $\\delta$) and display/block equations using double dollar signs on their own lines (e.g. $$ \\frac{a}{b} $$).
   - Use bold headings (### Section) and bullet points only when helpful for readability.`;

function buildMessages(history: ChatMessagePayload[]): any[] {
  const optimizedHistory = optimizeConversationContext(history, {
    maxRecentMessages: 8,
    preserveFirstMessage: true,
  });

  return [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    ...optimizedHistory.map((msg) => {
      if (msg.role === 'user' && msg.images && msg.images.length > 0) {
        const contentParts: any[] = [];

        contentParts.push({
          type: 'text',
          text: msg.content?.trim() || 'Please analyze this attached file.',
        });

        msg.images.forEach((mediaDataUrl) => {
          contentParts.push({
            type: 'image_url',
            image_url: {
              url: mediaDataUrl,
            },
          });
        });

        return { role: 'user', content: contentParts };
      }

      return { role: msg.role, content: msg.content };
    }),
  ];
}

export type StreamChunkCallback = (accumulatedText: string, newChunk: string) => void;

// Temporary cooldown tracker for keys/models that hit rate limits or downtime
const failureCooldowns = new Map<string, number>();

function isCooldownActive(id: string): boolean {
  const expiry = failureCooldowns.get(id);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    failureCooldowns.delete(id);
    return false;
  }
  return true;
}

function markCooldown(id: string, durationMs: number = 25000) {
  failureCooldowns.set(id, Date.now() + durationMs);
}

/**
 * Attempts a single streaming chat completion with a specific model and API key.
 */
async function executeStreamAttempt(
  model: string,
  apiKey: string,
  messages: any[],
  onChunk?: StreamChunkCallback
): Promise<string> {
  const payload: any = {
    model,
    messages,
    max_tokens: 4096,
    stream: true,
  };

  // Modern reasoning models (such as GPT-6 Luna and OpenAI o-series) strictly reject custom temperature with HTTP 400.
  // Only include temperature for standard models (Qwen, DeepSeek, etc.)
  if (
    !model.includes('luna') &&
    !model.includes('gpt-6') &&
    !model.includes('o1') &&
    !model.includes('o3') &&
    !model.includes('o4')
  ) {
    payload.temperature = 0.6;
  }

  const response = await fetch(RAPIDROUTER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      errorData?.error?.message ||
      `Request failed with status ${response.status}: ${response.statusText}`;
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error('ReadableStream not supported or empty response body received.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let accumulated = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data:')) continue;
        const dataStr = line.slice(5).trim();

        if (dataStr === '[DONE]') {
          break;
        }

        try {
          const parsed = JSON.parse(dataStr);
          const delta = parsed.choices?.[0]?.delta;
          if (delta) {
            // Specifically ignore reasoning_content from deepseek models
            const chunk = delta.content || '';
            if (chunk) {
              accumulated += chunk;
              const cleaned = stripThinking(accumulated);
              if (onChunk) {
                onChunk(cleaned, chunk);
              }
            }
          }
        } catch {
          // Ignore incomplete SSE chunk json parse error
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const finalResult = stripThinking(accumulated);
  if (!finalResult.trim()) {
    throw new Error('Empty response received.');
  }

  return finalResult;
}

/**
 * Executes chat generation with robust multi-model and multi-key fallback.
 * Never throws raw errors to the user UI.
 */
export async function requestRapidRouterChat(
  history: ChatMessagePayload[],
  modelOverride?: string,
  onChunk?: StreamChunkCallback
): Promise<string> {
  const keys = getRapidRouterApiKeys();
  const hasPdf = containsPdfAttachment(history);

  // Determine model fallback sequence
  let candidateModels: string[];
  if (hasPdf) {
    // PDF upload is only supported on gpt-6-luna
    candidateModels = ['openai/gpt-6-luna'];
  } else if (modelOverride && modelOverride !== 'Rad 1.1 Flash' && !modelOverride.includes('qwen')) {
    candidateModels = [modelOverride, ...getRapidRouterFallbackModels(false).filter((m) => m !== modelOverride)];
  } else {
    candidateModels = getRapidRouterFallbackModels(false);
  }

  const messages = buildMessages(history);

  console.log('🤖 [Rad AI Fallback Engine] Initiating request:', {
    models: candidateModels,
    availableKeysCount: keys.length,
    hasPdf,
    messagesCount: messages.length,
  });

  // Sort keys so non-cooldown keys are tried first
  const sortedKeys = [...keys].sort((a, b) => {
    const aCool = isCooldownActive(a) ? 1 : 0;
    const bCool = isCooldownActive(b) ? 1 : 0;
    return aCool - bCool;
  });

  // Try each model in priority order
  for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
    const model = candidateModels[mIdx];

    // Try each API key for this model
    for (let kIdx = 0; kIdx < sortedKeys.length; kIdx++) {
      const apiKey = sortedKeys[kIdx];
      const keyShort = apiKey.slice(-6);

      try {
        console.log(`▶ [Rad AI] Attempting model: ${model} with key: [..${keyShort}]`);
        const result = await executeStreamAttempt(model, apiKey, messages, onChunk);
        console.log(`✅ [Rad AI] Success via model: ${model} with key: [..${keyShort}]`);
        return result;
      } catch (attemptErr: any) {
        const errorMsg = attemptErr?.message || String(attemptErr);
        console.warn(
          `⚠️ [Rad AI Fallback] Attempt failed for model ${model} (key: ..${keyShort}): ${errorMsg}. Switching to next key/model...`
        );

        // Mark key or model on cooldown if it looks like a rate limit or route failure
        if (errorMsg.includes('rate') || errorMsg.includes('429')) {
          markCooldown(apiKey, 35000);
        } else if (errorMsg.includes('all_providers_failed') || errorMsg.includes('not available')) {
          markCooldown(model, 45000);
        }

        // Reset streamed chunk for clean UI transition on next attempt
        if (onChunk) {
          onChunk('', '');
        }
      }
    }
  }

  // Graceful fallback response if all models and keys fail (never show raw error)
  console.error('❌ [Rad AI Fallback Engine] All model & key combinations were exhausted.');
  const gracefulMessage = "I'm temporarily experiencing high demand. Please try sending your message again in a moment.";
  if (onChunk) {
    onChunk(gracefulMessage, gracefulMessage);
  }
  return gracefulMessage;
}
