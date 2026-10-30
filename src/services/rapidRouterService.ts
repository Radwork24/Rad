/**
 * Rad AI Service (Powered Exclusively by LithosAI)
 * Endpoint: https://api.lithosai.cloud/v1
 * Primary Model: deepseek-ai/DeepSeek-V4.1-Flash-ultra-chat
 * Features: Native streaming, ultra-low latency, vision, and document analysis.
 */

import { optimizeConversationContext } from '../utils/contextManager';
import { logToTerminal } from '../utils/terminalLogger';

// LithosAI Endpoint — use local Vite proxy in dev to bypass CORS
const LITHOSAI_API_URL =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? '/api/lithos/chat'
    : 'https://api.lithosai.cloud/v1/chat/completions';

// Default LithosAI Model Chain — ordered by actual benchmark speed
// Flash: 1.57s ✅ | Flash-fast: 2.05s | Flash-ultra: ~2s | Flash-ultra-chat: slow
export const DEFAULT_MODEL_CHAIN = [
  'deepseek-ai/DeepSeek-V4.1-Flash',       // ← FASTEST (benchmarked)
  'deepseek-ai/DeepSeek-V4.1-Flash-ultra', // fallback
  'deepseek-ai/DeepSeek-V4.1-Flash-fast',  // fallback
  'deepseek-ai/DeepSeek-V4.1-Flash-ultra-chat', // last resort
];

/**
 * Returns LithosAI API Key from environment.
 */
export function getLithosAiApiKey(): string {
  const key =
    import.meta.env.LITHOSAI_API_KEY ||
    'lith_sk_LXzERRubHDuwFvw7UQYoRvdZvd7HzrOrpXAurYez3RM2FMggS';
  return key.trim();
}

/**
 * Returns configured LithosAI models in priority order.
 */
export function getLithosAiModels(): string[] {
  const envModels = import.meta.env.LITHOSAI_MODELS;
  if (envModels) {
    const parsed = envModels
      .split(',')
      .map((m: string) => m.trim())
      .filter((m: string) => m.length > 0);
    if (parsed.length > 0) return parsed;
  }
  return [...DEFAULT_MODEL_CHAIN];
}

// Backward-compatible helpers
export function getRapidRouterFallbackModels(_hasPdf: boolean = false): string[] {
  return getLithosAiModels();
}

export function getDefaultRapidRouterModel(): string {
  return getLithosAiModels()[0];
}

export function getRapidRouterApiKey(): string {
  return getLithosAiApiKey();
}

export function getRapidRouterApiKeys(): string[] {
  return [getLithosAiApiKey()];
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

/**
 * Lightweight version of stripThinking for real-time streaming:
 * Only suppresses content while inside an open <think> block.
 * Does NOT run heavy regex on the full accumulated string every chunk.
 */
function liveStripThinking(accumulated: string): string {
  if (!accumulated.includes('<think>')) return accumulated;
  let cleaned = accumulated.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (cleaned.includes('<think>')) {
    cleaned = cleaned.replace(/<think>[\s\S]*$/i, '');
  }
  return cleaned.trimStart();
}

const SYSTEM_INSTRUCTION = `You are Rad 1.1 Flash, an AI assistant created by Rad. Respond in clear, well-structured markdown.

RULES:
1. IDENTITY: You are Rad 1.1 Flash by Rad. Never mention DeepSeek, OpenAI, LithosAI, or any underlying model/provider.
2. BREVITY: Match response length to the query. Simple questions (greetings, facts, quick math) → 1-3 sentences max. Detailed guides only when explicitly asked.
3. NO THINKING TAGS: Never output <think> or </think>. Give only the final answer.
4. CONTINUITY: Reference prior messages for follow-ups without asking the user to repeat themselves.
5. FORMATTING: Use GFM tables (no blank lines between rows). Inline LaTeX: $E=mc^2$. Block LaTeX: $$ \frac{a}{b} $$. Use ### headings and bullets only when helpful.`;

function buildMessages(history: ChatMessagePayload[]): any[] {
  const optimizedHistory = optimizeConversationContext(history, {
    maxRecentMessages: 6,
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

// Temporary cooldown tracker for models that hit rate limits or temporary capacity
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

function markCooldown(id: string, durationMs: number = 30000) {
  failureCooldowns.set(id, Date.now() + durationMs);
}

/**
 * Executes a streaming chat completion with LithosAI.
 */
async function executeLithosStreamAttempt(
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
    temperature: 0.6,
  };

  logToTerminal('info', 'RAD_AI', `▶ [LithosAI] Sending request → model: ${model}`);
  const t0 = Date.now();

  const response = await fetch(LITHOSAI_API_URL, {
    method: 'POST',
    headers: {
      // In dev, the Vite proxy injects the key server-side.
      // In production, this header is sent directly to LithosAI.
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      errorData?.error?.message ||
      errorData?.message ||
      `Request failed with status ${response.status}: ${response.statusText}`;
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error('ReadableStream not supported or empty response body received.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  logToTerminal('info', 'RAD_AI', `⚡ [LithosAI] Connected! First byte in ${Date.now() - t0}ms — streaming started`);
  let accumulated = '';
  let buffer = '';
  let inThinkBlock = false;
  let ttftDelivered = false;
  const t1 = Date.now(); // time of first byte

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

          // Check if the API returned an error object inside the SSE stream
          if (parsed.error) {
            const errMsg = parsed.error?.message || 'Unknown stream error';
            throw new Error(errMsg);
          }

          const choice = parsed.choices?.[0];
          const delta = choice?.delta;
          const finishReason = choice?.finish_reason;

          // Skip empty deltas (finish_reason-only frames)
          if (!delta) continue;

          const chunk = delta.content ?? '';
          if (chunk) {
            accumulated += chunk;

            if (chunk.includes('<think>')) inThinkBlock = true;
            if (chunk.includes('</think>')) inThinkBlock = false;

            if (!inThinkBlock && onChunk) {
              const visibleText = accumulated.includes('<think>')
                ? liveStripThinking(accumulated)
                : accumulated;

              if (!ttftDelivered && (visibleText.trim() || chunk.trim())) {
                ttftDelivered = true;
                logToTerminal(
                  'success',
                  'RAD_AI',
                  `🚀 [LithosAI] FIRST TOKEN in ${Date.now() - t0}ms (connection: ${t1 - t0}ms + model: ${Date.now() - t1}ms) — model: ${model}`
                );
              }

              // Always call onChunk for every non-empty chunk — real streaming
              if (visibleText) {
                onChunk(visibleText, chunk);
              }
            }
          }

          // Gracefully handle stop without content (tool_calls frame, etc.)
          if (finishReason === 'stop' && !accumulated.trim()) {
            throw new Error('Empty response: model output must contain either output text or tool calls.');
          }
        } catch (sseErr: any) {
          const sseMsg = sseErr?.message || '';
          // Re-throw real errors (not JSON parse errors)
          if (
            sseMsg.includes('output text') ||
            sseMsg.includes('tool calls') ||
            sseMsg.includes('stream error') ||
            sseMsg.includes('capacity') ||
            sseMsg.includes('overloaded') ||
            sseMsg.includes('rate')
          ) {
            throw sseErr;
          }
          // Otherwise ignore (incomplete JSON in SSE buffer)
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const finalResult = stripThinking(accumulated);
  if (!finalResult.trim()) {
    throw new Error('Empty response received from LithosAI.');
  }

  logToTerminal(
    'success',
    'RAD_AI',
    `✨ [LithosAI] completed answering (${finalResult.length} chars generated)`
  );

  return finalResult;
}

/**
 * Executes chat generation using LithosAI exclusively.
 * Never throws raw errors to the user UI.
 */
export async function requestRapidRouterChat(
  history: ChatMessagePayload[],
  modelOverride?: string,
  onChunk?: StreamChunkCallback
): Promise<string> {
  const lithosApiKey = getLithosAiApiKey();
  const hasPdf = containsPdfAttachment(history);

  // Candidate LithosAI models
  let candidateModels: string[];
  if (
    modelOverride &&
    modelOverride !== 'Rad 1.1 Flash' &&
    !modelOverride.startsWith('deepinfra/') &&
    !modelOverride.startsWith('qwen/') &&
    !modelOverride.startsWith('openai/')
  ) {
    candidateModels = [modelOverride, ...getLithosAiModels().filter((m) => m !== modelOverride)];
  } else {
    candidateModels = getLithosAiModels();
  }

  const messages = buildMessages(history);

  console.log('🤖 [Rad AI Lithos Engine] Initiating request:', {
    provider: 'LithosAI',
    models: candidateModels,
    hasPdf,
    messagesCount: messages.length,
  });

  // Sort candidate models so non-cooldown models are tried first
  const sortedModels = [...candidateModels].sort((a, b) => {
    const aCool = isCooldownActive(a) ? 1 : 0;
    const bCool = isCooldownActive(b) ? 1 : 0;
    return aCool - bCool;
  });

  // Try LithosAI models in priority order
  for (let mIdx = 0; mIdx < sortedModels.length; mIdx++) {
    const model = sortedModels[mIdx];
    const keyShort = lithosApiKey.slice(-6);

    try {
      console.log(`▶ [Rad AI - LithosAI] Attempting model: ${model} [..${keyShort}]`);
      const result = await executeLithosStreamAttempt(model, lithosApiKey, messages, onChunk);
      console.log(`✅ [Rad AI - LithosAI] Success via model: ${model}`);
      return result;
    } catch (attemptErr: any) {
      const errorMsg = attemptErr?.message || String(attemptErr);
      logToTerminal(
        'warn',
        'RAD_AI',
        `⚠️ [LithosAI] Model ${model} is busy/unavailable (${errorMsg}). Trying next model...`
      );

      // If at capacity, rate-limited, or empty output — put on cooldown
      if (
        errorMsg.includes('capacity') ||
        errorMsg.includes('overloaded') ||
        errorMsg.includes('429') ||
        errorMsg.includes('rate') ||
        errorMsg.includes('output text') ||
        errorMsg.includes('tool calls') ||
        errorMsg.includes('Empty response')
      ) {
        markCooldown(model, 45000);
      }

      if (onChunk) {
        onChunk('', '');
      }
    }
  }

  // Graceful fallback response if all models are busy (never show raw error)
  logToTerminal('error', 'RAD_AI', '❌ [LithosAI] All models are currently busy.');
  const gracefulMessage = "I'm temporarily experiencing high demand. Please try sending your message again in a moment.";
  if (onChunk) {
    onChunk(gracefulMessage, gracefulMessage);
  }
  return gracefulMessage;
}

// Alias for semantic clarity
export const requestLithosAiChat = requestRapidRouterChat;
