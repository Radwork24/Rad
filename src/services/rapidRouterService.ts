/**
 * Rad AI Service (Powered by Tri-Engine Speculative Racing)
 * Engines:
 *   1. Groq (LPU Ultra-Fast Engine) → ~250-350ms TTFT
 *   2. Cerebras (Wafer-Scale Engine) → ~350-500ms TTFT
 *   3. LithosAI (DeepSeek/GLM Engine) → Multimodal & Fallback
 * Features: Sub-second first-token race, real-time SSE streaming, zero-downtime hedging.
 */

import { optimizeConversationContext } from '../utils/contextManager';
import { logToTerminal } from '../utils/terminalLogger';

// Proxied Endpoints — routed through local Vite proxy or Vercel Edge functions to bypass CORS
const LITHOSAI_API_URL = '/api/lithos/chat';
const GROQ_API_URL = '/api/groq/chat';
const CEREBRAS_API_URL = '/api/cerebras/chat';

// Default LithosAI Model Chain
export const DEFAULT_MODEL_CHAIN = [
  'deepseek-ai/DeepSeek-V4.1-Flash-fast',
  'deepseek-ai/DeepSeek-V4.1-Flash',
  'deepseek-ai/DeepSeek-V4.1-Flash-ultra',
  'zai-org/GLM-5.3-Flash-ultra',
];

/**
 * Returns API keys from environment
 */
export function getLithosAiApiKey(): string {
  return (import.meta.env.LITHOSAI_API_KEY || '').trim();
}

export function getGroqApiKey(): string {
  return (import.meta.env.GROQ_API_KEY || '').trim();
}

export function getCerebrasApiKey(): string {
  return (import.meta.env.CEREBRAS_API_KEY || '').trim();
}

export function getGroqModel(): string {
  return import.meta.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
}

export function getCerebrasModel(): string {
  return import.meta.env.CEREBRAS_MODEL || 'qwen-3.8-27b';
}

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
  return 'Rad 1.1 Flash (Tri-Engine)';
}

export function getRapidRouterApiKey(): string {
  return getLithosAiApiKey();
}

export function getRapidRouterApiKeys(): string[] {
  return [getLithosAiApiKey(), getGroqApiKey(), getCerebrasApiKey()];
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
 * Suppresses content while inside an open <think> block.
 */
function liveStripThinking(accumulated: string): string {
  if (!accumulated.includes('<think>')) return accumulated;
  let cleaned = accumulated.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (cleaned.includes('<think>')) {
    cleaned = cleaned.replace(/<think>[\s\S]*$/i, '');
  }
  return cleaned.trimStart();
}

const SYSTEM_INSTRUCTION = `You are Rad 1.1 Flash, an AI assistant created by Rad. Respond in clear, beautifully structured markdown.

RULES:
1. IDENTITY: You are Rad 1.1 Flash by Rad. Never mention DeepSeek, Groq, Cerebras, OpenAI, LithosAI, or any underlying model/provider.
2. BREVITY: Match response length to the query. Simple questions (greetings, facts, quick math) → 1-3 sentences max. Detailed guides only when explicitly asked.
3. NO THINKING TAGS: Never output <think> or </think>. Give only the final answer.
4. CONTINUITY: Reference prior messages for follow-ups without asking the user to repeat themselves.
5. FORMATTING: Use clean GitHub Flavored Markdown (GFM). Use bold highlights, code blocks with language tags, and lists. Inline LaTeX: $E=mc^2$. Block LaTeX: $$ \\frac{a}{b} $$.`;

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

// Temporary cooldown tracker
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

interface EngineDefinition {
  id: 'groq' | 'cerebras' | 'lithos';
  name: string;
  url: string;
  apiKey: string;
  model: string;
}

/**
 * Speculative Tri-Engine Race:
 * Fires requests to Groq, Cerebras, and LithosAI simultaneously.
 * Whichever engine outputs the first non-empty text token WINS.
 * The losing engines are immediately aborted to save quota & bandwidth.
 */
async function executeTriEngineRace(
  messages: any[],
  onChunk?: StreamChunkCallback
): Promise<string> {
  const t0 = Date.now();

  const engines: EngineDefinition[] = [
    {
      id: 'groq',
      name: 'Groq (LPU)',
      url: GROQ_API_URL,
      apiKey: getGroqApiKey(),
      model: getGroqModel(),
    },
    {
      id: 'cerebras',
      name: 'Cerebras (WSE)',
      url: CEREBRAS_API_URL,
      apiKey: getCerebrasApiKey(),
      model: getCerebrasModel(),
    },
    {
      id: 'lithos',
      name: 'LithosAI',
      url: LITHOSAI_API_URL,
      apiKey: getLithosAiApiKey(),
      model: getLithosAiModels()[0],
    },
  ];

  logToTerminal('info', 'RAD_AI', '🏁 [Tri-Engine Race] Racing Groq ⚡ Cerebras ⚡ LithosAI in parallel...');

  const controllers = {
    groq: new AbortController(),
    cerebras: new AbortController(),
    lithos: new AbortController(),
  };

  let winnerEngine: EngineDefinition | null = null;
  let finalAccumulated = '';

  const runEngine = async (engine: EngineDefinition): Promise<string> => {
    const controller = controllers[engine.id];
    let engineAccumulated = '';
    let buffer = '';
    let inThinkBlock = false;

    const payload = {
      model: engine.model,
      messages,
      max_tokens: 4096,
      stream: true,
      temperature: 0.6,
    };

    const res = await fetch(engine.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${engine.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`${engine.name} HTTP ${res.status}: ${errText.slice(0, 100)}`);
    }

    if (!res.body) throw new Error(`${engine.name} returned empty body`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');

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
          if (dataStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) throw new Error(parsed.error.message || 'Stream error');

            const choice = parsed.choices?.[0];
            const delta = choice?.delta;
            if (!delta) continue;

            const chunk = delta.content ?? '';
            if (chunk) {
              if (chunk.includes('<think>')) inThinkBlock = true;
              if (chunk.includes('</think>')) inThinkBlock = false;

              if (!inThinkBlock) {
                // If no winner yet, this engine WINS the race!
                if (!winnerEngine) {
                  winnerEngine = engine;
                  const elapsed = Date.now() - t0;
                  logToTerminal(
                    'success',
                    'RAD_AI',
                    `🏆 [Tri-Engine Race] WINNER: ${engine.name} in ${elapsed}ms! Streaming tokens...`
                  );

                  // Immediately abort the slower competitors
                  for (const [id, ctrl] of Object.entries(controllers)) {
                    if (id !== engine.id) {
                      ctrl.abort();
                    }
                  }
                }

                // If this is the winning engine, pipe chunks to the UI
                if (winnerEngine.id === engine.id) {
                  engineAccumulated += chunk;
                  const visible = engineAccumulated.includes('<think>')
                    ? liveStripThinking(engineAccumulated)
                    : engineAccumulated;
                  if (visible && onChunk) {
                    onChunk(visible, chunk);
                  }
                }
              }
            }
          } catch (jsonErr: any) {
            // Ignore incomplete SSE json fragments
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (winnerEngine?.id === engine.id) {
      finalAccumulated = stripThinking(engineAccumulated);
    }
    return engineAccumulated;
  };

  // Run all 3 engines concurrently
  const enginePromises = engines.map(async (eng) => {
    try {
      return await runEngine(eng);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn(`[Tri-Engine] ${eng.name} error:`, err?.message);
      }
      return null;
    }
  });

  await Promise.allSettled(enginePromises);

  if (finalAccumulated.trim()) {
    const winnerName = (winnerEngine as EngineDefinition | null)?.name || 'Fastest Engine';
    logToTerminal(
      'success',
      'RAD_AI',
      `✨ [Tri-Engine] Complete via ${winnerName} in ${Date.now() - t0}ms (${finalAccumulated.length} chars)`
    );
    return finalAccumulated;
  }

  throw new Error('All raced engines failed or were aborted');
}

/**
 * Fallback / Multimodal direct attempt with LithosAI.
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
  let accumulated = '';
  let buffer = '';
  let inThinkBlock = false;
  let ttftDelivered = false;

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
        if (dataStr === '[DONE]') break;

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.error) throw new Error(parsed.error.message || 'Stream error');

          const choice = parsed.choices?.[0];
          const delta = choice?.delta;
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
                  `🚀 [LithosAI] FIRST TOKEN in ${Date.now() - t0}ms — model: ${model}`
                );
              }

              if (visibleText) {
                onChunk(visibleText, chunk);
              }
            }
          }
        } catch (sseErr: any) {
          // Ignore incomplete chunk parse errors
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const finalResult = stripThinking(accumulated);
  if (!finalResult.trim()) throw new Error('Empty response received from LithosAI.');
  return finalResult;
}

/**
 * Executes chat generation using Tri-Engine Speculative Racing.
 * Groq + Cerebras + LithosAI run simultaneously, fastest one wins.
 */
export async function requestRapidRouterChat(
  history: ChatMessagePayload[],
  _modelOverride?: string,
  onChunk?: StreamChunkCallback
): Promise<string> {
  const hasMedia = history.some(
    (msg) => msg.images && msg.images.length > 0
  );
  const messages = buildMessages(history);

  // If user attached images/PDFs, route directly to LithosAI (multimodal capability)
  if (hasMedia) {
    logToTerminal('info', 'RAD_AI', '📎 Media attachment detected — routing to LithosAI multimodal engine...');
    const candidateModels = getLithosAiModels();
    for (const model of candidateModels) {
      try {
        return await executeLithosStreamAttempt(model, getLithosAiApiKey(), messages, onChunk);
      } catch (err: any) {
        logToTerminal('warn', 'RAD_AI', `⚠️ LithosAI ${model} failed, trying next...`);
      }
    }
  }

  // 🏁 Default Text Flow: Tri-Engine Speculative Race!
  try {
    return await executeTriEngineRace(messages, onChunk);
  } catch (raceErr) {
    logToTerminal('warn', 'RAD_AI', '⚠️ Tri-Engine race had no clean winner, falling back to sequential chain...');
  }

  // Fallback sequential execution if the race didn't succeed
  const fallbackModels = getLithosAiModels();
  for (const model of fallbackModels) {
    if (isCooldownActive(model)) continue;
    try {
      const result = await executeLithosStreamAttempt(model, getLithosAiApiKey(), messages, onChunk);
      return result;
    } catch (attemptErr: any) {
      markCooldown(model, 30000);
    }
  }

  // Graceful failure message if everything failed
  const gracefulMessage = "I'm temporarily experiencing high demand. Please try sending your message again in a moment.";
  if (onChunk) onChunk(gracefulMessage, gracefulMessage);
  return gracefulMessage;
}

// Alias for backwards compatibility
export const requestLithosAiChat = requestRapidRouterChat;
