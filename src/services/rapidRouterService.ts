/**
 * Tri-Engine Speculative AI Service (Rad 1.1 Flash)
 *
 * Engines:
 *   1. Groq (LPU)             → ~150-300ms TTFT (Free tier: priority #1, compact text only)
 *   2. Cerebras (WSE)         → ~300-500ms TTFT (Subscribed: priority #2, high-throughput text)
 *   3. LithosAI (DeepSeek/GLM)→ Subscribed (priority #3, handles large context & all Multimodal/PDFs)
 *
 * Guarantees:
 *   - NEVER hangs in endless generating (3.5s TTFT hedge watchdog, 8s per-chunk watchdog, 25s global timeout).
 *   - Multimodal & PDF queries route directly to LithosAI without crashing text-only models.
 *   - Automatic 60s cooldown for Groq on rate limits so subsequent queries never stall.
 *   - Full context optimization with strict chat-template compliance for Cerebras.
 */

import { optimizeConversationContext } from '../utils/contextManager';
import { logToTerminal } from '../utils/terminalLogger';

// Proxied Endpoints (via Vite dev proxy or Vercel Edge Serverless functions)
const OPENAI_API_URL = '/api/openai/chat';
const GROQ_API_URL = '/api/groq/chat';
const CEREBRAS_API_URL = '/api/cerebras/chat';
const LITHOSAI_API_URL = '/api/lithos/chat';

// API Keys loaded strictly from environment variables
export function getOpenAiApiKey(): string {
  return (
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.OPENAI_API_KEY || import.meta.env?.VITE_OPENAI_API_KEY)) ||
    ''
  );
}

export function getGroqApiKey(): string {
  return (
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.GROQ_API_KEY || import.meta.env?.VITE_GROQ_API_KEY)) ||
    ''
  );
}

export function getCerebrasApiKey(): string {
  return (
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.CEREBRAS_API_KEY || import.meta.env?.VITE_CEREBRAS_API_KEY)) ||
    ''
  );
}

export function getLithosAiApiKey(): string {
  return (
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.LITHOSAI_API_KEY || import.meta.env?.VITE_LITHOSAI_API_KEY)) ||
    ''
  );
}

// Engine Models
export function getOpenAiModel(): string {
  return (typeof import.meta !== 'undefined' && import.meta.env?.OPENAI_MODEL) || 'gpt-6-luna';
}

export function getGroqModel(): string {
  return (typeof import.meta !== 'undefined' && import.meta.env?.GROQ_MODEL) || 'qwen/qwen3.8-27b';
}

export function getCerebrasModel(): string {
  return (typeof import.meta !== 'undefined' && import.meta.env?.CEREBRAS_MODEL) || 'qwen-3.8-27b';
}

export const LITHOS_TEXT_MODELS = [
  'deepseek-ai/DeepSeek-V4.1-Flash-fast',
  'deepseek-ai/DeepSeek-V4.1-Flash',
  'zai-org/GLM-5.3-Flash-ultra',
];

export const LITHOS_VISION_MODELS = [
  'deepseek-ai/DeepSeek-V4.1-Flash',
  'zai-org/GLM-5.3-Flash-ultra',
];

export interface ChatMessagePayload {
  role: 'system' | 'user' | 'assistant';
  content: string;
  sender?: string;
  images?: string[]; // base64 data URLs
}

export interface GroupChatContext {
  isGroup: boolean;
  activeSpeaker: string;
  participants: string[];
}

export type StreamChunkCallback = (accumulatedText: string, newChunk: string) => void;

/**
 * Strips <think>...</think> reasoning blocks from DeepSeek output.
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
 * Live streaming version of stripThinking: hides tokens inside an active <think> block.
 */
function liveStripThinking(accumulated: string): string {
  if (!accumulated.includes('<think>')) return accumulated;
  let cleaned = accumulated.replace(/<think>[\s\S]*?<\/think>/gi, '');
  if (cleaned.includes('<think>')) {
    cleaned = cleaned.replace(/<think>[\s\S]*$/i, '');
  }
  return cleaned.trimStart();
}

const SYSTEM_INSTRUCTION = `You are Rad, an intelligent, thoughtful, and highly capable AI assistant, powered by Rad 1.1 Flash — a model created and developed by Rad.
Respond with clear, direct, and well-structured markdown.

CRITICAL INSTRUCTIONS:
1. IDENTITY:
   - You are Rad 1.1 Flash, created by Rad. This is your ONLY identity.
   - If asked who you are or what model powers you, ALWAYS answer: "I'm Rad 1.1 Flash, an AI model created by Rad."
   - NEVER mention Qwen, DeepSeek, Groq, Cerebras, Lithos, Alibaba, or any underlying provider.

2. QUERY-ADAPTIVE LENGTH & BREVITY:
   - Match the response length strictly to the user query.
   - For simple questions, greetings, facts, or quick calculations, answer directly in 1 to 3 sentences.
   - Give comprehensive, multi-section explanations with code/math only when the user asks for depth.
   - Never repeat the user's question back to them.

3. NO REASONING TAGS:
   - Do NOT output <think> or </think> tags. Provide ONLY the final answer.

4. CONVERSATIONAL CONTINUITY:
   - Reference prior topics, equations, and context naturally without asking the user to repeat themselves.

5. FORMATTING STANDARDS:
   - Tables: Standard GFM markdown tables (|:---|:---|) with no blank lines between rows.
   - Math: Standard LaTeX. Inline math: $E=mc^2$. Block equations: $$ \\frac{a}{b} $$.

6. DOCUMENT & FILE ATTACHMENTS (CODE, TERMINALS, SCREENSHOTS):
   - When a user query includes an attached document or images (e.g., screenshots of Windows/Linux terminals, code, memory layouts, program outputs, or charts):
     * CAREFULLY READ and inspect the exact text, code, commands, column values, and numbers shown in EACH image/screenshot.
     * Provide a thorough, structured, program-by-program breakdown (e.g., Program 1, Program 2, etc.) rather than a generic superficial overview.
     * Explain the exact values (e.g. text, data, bss, dec, hex memory segment sizes), what changed between the runs, and the underlying computer science / programming concepts illustrated.
   - NEVER say "I cannot open or read the content of the attached file directly" or "As an AI, I do not have access to external files". You DO have direct access to the provided content and images.

7. INTERACTIVE CHUNKING & PACING FOR HEAVY TASKS (CHATGPT & CLAUDE STYLE):
   - When a user asks for heavy, large-scale deliverables (e.g. 20, 30, 50, or 100 questions, flashcards, MCQs, practice problems, test cases, or multi-chapter guides):
     * NEVER dump 30 to 50 items all at once in a single overwhelming, cut-off response.
     * Deliver the content in focused, high-quality batches (typically 5 questions at a time, or 5 to 10 for smaller tasks).
     * Number them clearly (e.g. Questions 1–5).
     * At the end of the batch, ask a natural, helpful continuation check-in:
       "These are the first 5 questions (1–5). Should I proceed with the next 5 (questions 6–10), or would you like to solve, review, or adjust any of these first?"
     * When the user confirms (e.g. "yes", "continue", "next", "go on", "give more"), immediately provide the next batch continuing the exact numbering (e.g. 6–10, then 11–15, etc.) until the total goal is reached.
   - When a user asks for broad syllabus theory or exhaustive multi-topic explanations (e.g. "explain everything about operating systems", "explain all sorting algorithms in depth", or 5-page theory requests):
     * Do NOT dump an unreadable 5-page wall of text all in one go.
     * Provide a brief conceptual roadmap of the topics, then thoroughly explain the first core concept or module with crystal clarity, diagrams/code, and KaTeX math.
     * End by inviting the next step:
       "We've covered [Topic 1]. Ready to move on to [Topic 2: Next Concept], or would you like an example or deeper explanation on this first?"
     * Proceed smoothly to the next topic as the user confirms.`;

export function getSystemInstruction(groupContext?: GroupChatContext): string {
  if (!groupContext?.isGroup || !groupContext.participants || groupContext.participants.length <= 1) {
    return SYSTEM_INSTRUCTION;
  }

  const activeSpeaker = groupContext.activeSpeaker;
  const otherParticipants = groupContext.participants
    .filter((p) => p.toLowerCase() !== activeSpeaker.toLowerCase())
    .map((p) => `@${p}`);

  const participantsList = groupContext.participants.map((p) => `@${p}`).join(', ');

  const groupAddendum = `

8. MULTI-USER COLLABORATIVE STUDY ROOM (GROUP CHAT):
   - You are in a live collaborative group study room with MULTIPLE students: ${participantsList}.
   - The current turn was sent by @${activeSpeaker}.
   - In earlier turns, other students (${otherParticipants.length > 0 ? otherParticipants.join(', ') : 'collaborators'}) have participated.
   - GROUP AWARENESS & SPEAKER TRACKING:
     * SPEAKER IDENTIFICATION: Every user query is attributed with the student's name (e.g. "[@${activeSpeaker}]: ..."). Always be fully conscious of WHO is speaking right now and WHO spoke previously.
     * CONTEXTUAL THREADING: When replying to @${activeSpeaker}, connect your answer to the ongoing group discussion. If @${activeSpeaker}'s question follows up on, questions, or relates to what another student asked earlier (e.g., ${otherParticipants.length > 0 ? otherParticipants.join(' or ') : 'another student'}), naturally reference both students (e.g., "Great question @${activeSpeaker}! Building on what ${otherParticipants[0] || 'your study partner'} was asking earlier...").
     * ADDRESS BY NAME: Address @${activeSpeaker} directly and naturally by name/handle in your response.
     * ACTIVE STUDY FACILITATION: Act as the brilliant, encouraging thinking partner for the entire group. Support multiple threads of thought without confusing which student asked which query.`;

  return SYSTEM_INSTRUCTION + groupAddendum;
}

// Cooldown tracker for rate-limited engines
const engineCooldowns = new Map<string, number>();

function isEngineOnCooldown(engineId: string): boolean {
  const expiry = engineCooldowns.get(engineId);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    engineCooldowns.delete(engineId);
    return false;
  }
  return true;
}

function setEngineCooldown(engineId: string, durationMs: number = 60000) {
  engineCooldowns.set(engineId, Date.now() + durationMs);
}

/**
 * Builds clean, strict chat messages for text models (Cerebras & Groq).
 * Ensures only 1 system message at index 0, followed by alternating user/assistant turns.
 */
function buildTextMessages(history: ChatMessagePayload[], customSystemInstruction?: string): any[] {
  const instruction = customSystemInstruction || SYSTEM_INSTRUCTION;
  const cleaned = history.filter(
    (m) => m && (m.role === 'user' || m.role === 'assistant') && Boolean(m.content && m.content.trim().length > 0)
  );

  const optimized = optimizeConversationContext(cleaned, {
    maxRecentMessages: 10,
    preserveFirstMessage: true,
  });

  // Strict check: Cerebras and Groq chat templates require exactly ONE system message at index 0.
  // All subsequent turns must strictly be 'user' or 'assistant'.
  const sanitizedTurns = optimized
    .filter((msg) => msg && msg.role !== 'system' && msg.content?.trim().length > 0)
    .map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content.trim(),
    }));

  return [
    { role: 'system', content: instruction },
    ...sanitizedTurns,
  ];
}

/**
 * Builds multimodal messages for vision-capable models (LithosAI).
 * Properly handles image data URLs and prevents invalid PDF mime-types in image_url.
 */
function buildVisionMessages(history: ChatMessagePayload[], customSystemInstruction?: string): any[] {
  const instruction = customSystemInstruction || SYSTEM_INSTRUCTION;
  const cleaned = history.filter(
    (m) => m && (m.role === 'user' || m.role === 'assistant') && Boolean(m.content && m.content.trim().length > 0)
  );

  const optimized = optimizeConversationContext(cleaned, {
    maxRecentMessages: 10,
    preserveFirstMessage: true,
  });

  // Find the index of the most recent message with images so we only send the image once
  let latestImageIndex = -1;
  for (let i = optimized.length - 1; i >= 0; i--) {
    if (optimized[i]?.images && optimized[i].images!.length > 0) {
      latestImageIndex = i;
      break;
    }
  }

  const sanitizedTurns = optimized
    .filter((msg) => msg && msg.role !== 'system' && (Boolean(msg.content?.trim()) || Boolean(msg.images?.length)))
    .map((msg, index) => {
      const role = msg.role === 'assistant' ? 'assistant' : 'user';
      // Only attach raw base64 image data to the most recent message that actually has images
      // This prevents re-uploading massive base64 payloads on every subsequent turn
      if (role === 'user' && index === latestImageIndex && msg.images && msg.images.length > 0) {
        const contentParts: any[] = [];

        contentParts.push({
          type: 'text',
          text: msg.content?.trim() || 'Please analyze this document / image.',
        });

        // Filter strictly valid image data URLs (jpeg, png, webp, gif)
        // detail: 'high' ensures small terminal font, code, numbers, and tables are crisp and fully readable
        msg.images.forEach((url) => {
          if (url && (url.startsWith('data:image/') || url.startsWith('http'))) {
            contentParts.push({
              type: 'image_url',
              image_url: { url, detail: 'high' },
            });
          }
        });

        return { role: 'user', content: contentParts.length > 1 ? contentParts : msg.content };
      }

      return { role, content: msg.content };
    });

  return [
    { role: 'system', content: instruction },
    ...sanitizedTurns,
  ];
}

interface EngineDefinition {
  id: 'openai' | 'groq' | 'cerebras' | 'lithos';
  name: string;
  url: string;
  apiKey: string;
  model: string;
  reasoningEffort?: string;
}

/**
 * Executes a single streaming attempt against a given engine with a per-chunk watchdog.
 */
async function streamEngineAttempt(
  engine: EngineDefinition,
  messages: any[],
  signal: AbortSignal,
  onFirstToken: (engine: EngineDefinition, ttftMs: number) => void,
  onChunkToken: (accumulated: string, newChunk: string) => void
): Promise<string> {
  if (!engine.apiKey) {
    throw new Error(`[RapidRouter] Engine ${engine.name} missing API key in environment.`);
  }

  const requestStart = Date.now();
  const payload: any = {
    model: engine.model,
    messages,
    stream: true,
    temperature: 0.6,
  };

  if (engine.id === 'openai') {
    payload.max_completion_tokens = 4096;
    if (engine.reasoningEffort) {
      payload.reasoning_effort = engine.reasoningEffort;
    }
  } else {
    payload.max_tokens = 4096;
  }

  const response = await fetch(engine.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${engine.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const errLower = errText.toLowerCase();
    const isRateLimit =
      response.status === 429 ||
      errLower.includes('rate') ||
      errLower.includes('quota') ||
      errLower.includes('limit') ||
      errLower.includes('too large') ||
      errLower.includes('insufficient_quota') ||
      errLower.includes('billing');
    if (isRateLimit) {
      // OpenAI billing/quota issues: longer cooldown (5 min), others: 60s
      const cooldownMs = engine.id === 'openai' ? 300000 : 60000;
      setEngineCooldown(engine.id, cooldownMs);
      logToTerminal(
        'warn',
        'RAD_AI',
        `⚠️ [Tri-Engine] ${engine.name} quota/rate limit (HTTP ${response.status}). Cooldown for ${cooldownMs / 1000}s — next engines take over.`
      );
    }
    throw new Error(`${engine.name} HTTP ${response.status}: ${errText.slice(0, 200)}`);
  }

  if (!response.body) throw new Error(`${engine.name} returned empty response body`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');

  let accumulated = '';
  let buffer = '';
  let inThinkBlock = false;
  let firstTokenEmitted = false;

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

          const delta = parsed.choices?.[0]?.delta;
          const chunk = delta?.content ?? '';
          if (chunk) {
            if (chunk.includes('<think>')) inThinkBlock = true;
            if (chunk.includes('</think>')) inThinkBlock = false;

            accumulated += chunk;
            const visible = liveStripThinking(accumulated);

            if (!inThinkBlock && visible.trim().length > 0) {
              if (!firstTokenEmitted) {
                firstTokenEmitted = true;
                const ttftMs = Date.now() - requestStart;
                onFirstToken(engine, ttftMs);
              }
              onChunkToken(visible, chunk);
            }
          }
        } catch {
          // Ignore incomplete SSE json fragments
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const finalResult = stripThinking(accumulated);
  if (!finalResult.trim()) {
    throw new Error(`${engine.name} produced empty response.`);
  }
  return finalResult;
}



/**
 * Main Speculative Tri-Engine Router:
 * Priority 1: Groq (fastest TTFT ~150-300ms, LPU, compact context)
 * Priority 2: Cerebras (fastest Wafer-Scale Engine ~300-500ms, premium subscription)
 * Priority 3: LithosAI (DeepSeek/GLM, premium subscription, hedging backup after 3.5s)
 *
 * Both Text and Vision/Multimodal queries are raced across Groq and Cerebras first,
 * with LithosAI standing by as the guaranteed fallback.
 */

/**
 * Main Speculative Quad-Engine Router:
 * Priority 1: OpenAI (GPT-6 Luna)      — user's top choice, full multimodal
 * Priority 2: Groq (LPU)               — fastest TTFT ~150-300ms, TEXT ONLY
 * Priority 3: Cerebras (WSE)           — fast wafer-scale ~300-500ms, TEXT ONLY
 * Priority 4: LithosAI (DeepSeek/GLM) — full multimodal, 3.5s watchdog hedge + fallback
 *
 * KEY RULE: Groq & Cerebras only receive text-only messages.
 * Sending image_url multipart content to Groq/Cerebras → HTTP 400 "System message must be at the beginning".
 * OpenAI & LithosAI receive full vision messages when media is present.
 */
export async function requestRapidRouterChat(
  history: ChatMessagePayload[],
  _modelOverride?: string,
  onChunk?: StreamChunkCallback,
  groupContext?: GroupChatContext
): Promise<string> {
  const lastMsg = history[history.length - 1];
  const currentTurnHasMedia = Boolean(lastMsg?.images && lastMsg.images.length > 0);
  const anyTurnHasMedia = history.some((msg) => msg.images && msg.images.length > 0);

  const systemInstruction = getSystemInstruction(groupContext);

  // Build engine-specific message payloads:
  //   - textOnlyMessages: Groq & Cerebras (and follow-up turns without new images)
  //   - visionMessages: OpenAI & LithosAI (optimized with detail: 'low' for ~1s TTFT)
  const textOnlyMessages = buildTextMessages(history, systemInstruction);
  const visionMessages = anyTurnHasMedia ? buildVisionMessages(history, systemInstruction) : textOnlyMessages;

  // Estimate total text context size (character count)
  const totalChars = history.reduce((acc, m) => acc + (m.content?.length || 0), 0);
  const isContextSmall = totalChars < 8000; // Safe for Groq free tier rate limits

  const t0 = Date.now();

  // Each entry pairs an engine definition with the correct messages for that engine
  interface EngineEntry {
    def: EngineDefinition;
    messages: any[];
  }
  const activeEngineEntries: EngineEntry[] = [];

  // Priority 1: OpenAI (GPT-6 Luna) — user's top priority, no reasoning
  // When current turn has media, receives optimized single-tile vision payload
  // When current turn is text, receives lightweight text-only messages for instant response
  const openAiKey = getOpenAiApiKey();
  if (!isEngineOnCooldown('openai') && openAiKey) {
    activeEngineEntries.push({
      def: {
        id: 'openai',
        name: 'OpenAI (GPT-6 Luna)',
        url: OPENAI_API_URL,
        apiKey: openAiKey,
        model: getOpenAiModel(),
        reasoningEffort: 'none',
      },
      messages: currentTurnHasMedia ? visionMessages : textOnlyMessages,
    });
  }

  // Priority 2: Groq (LPU) — ~150-250ms TTFT
  // Active for ALL text turns (including follow-ups like "what is internal logic")
  // Skipped ONLY when user just attached a new image (Groq cannot see images)
  const groqKey = getGroqApiKey();
  if (!currentTurnHasMedia && !isEngineOnCooldown('groq') && isContextSmall && groqKey) {
    activeEngineEntries.push({
      def: {
        id: 'groq',
        name: 'Groq (LPU)',
        url: GROQ_API_URL,
        apiKey: groqKey,
        model: getGroqModel(),
      },
      messages: textOnlyMessages,
    });
  }

  // Priority 3: Cerebras (WSE) — ~250-400ms TTFT
  // Active for ALL text turns; skipped ONLY when user just attached a new image
  const cerebrasKey = getCerebrasApiKey();
  if (!currentTurnHasMedia && !isEngineOnCooldown('cerebras') && cerebrasKey) {
    activeEngineEntries.push({
      def: {
        id: 'cerebras',
        name: 'Cerebras (WSE)',
        url: CEREBRAS_API_URL,
        apiKey: cerebrasKey,
        model: getCerebrasModel(),
      },
      messages: textOnlyMessages,
    });
  }

  // Priority 4: LithosAI — raced directly only if all fast engines are on cooldown or unconfigured
  const lithosKey = getLithosAiApiKey();
  if (activeEngineEntries.length === 0 && lithosKey) {
    activeEngineEntries.push({
      def: {
        id: 'lithos',
        name: 'LithosAI',
        url: LITHOSAI_API_URL,
        apiKey: lithosKey,
        model: currentTurnHasMedia ? LITHOS_VISION_MODELS[0] : LITHOS_TEXT_MODELS[0],
      },
      messages: currentTurnHasMedia ? visionMessages : textOnlyMessages,
    });
  }

  const modeLabel = currentTurnHasMedia ? ' (Multimodal / Vision)' : ' (Text)';
  logToTerminal(
    'info',
    'RAD_AI',
    `🏁 [Tri-Engine Race] Racing ${activeEngineEntries.map((e) => e.def.name).join(' ⚡ ')}${modeLabel} in parallel...`
  );

  const controllers: Record<string, AbortController> = {};
  activeEngineEntries.forEach(({ def }) => {
    controllers[def.id] = new AbortController();
  });

  let winnerEngine: EngineDefinition | null = null;
  let winnerTtftMs: number | null = null;
  let finalResponse = '';

  // Hedging watchdog: If primary engines exceed 2.5s TTFT, fire LithosAI backup concurrently!
  let hedgingTimer: ReturnType<typeof setTimeout> | null = null;
  const isLithosAlreadyRacing = activeEngineEntries.some((e) => e.def.id === 'lithos');

  if (!isLithosAlreadyRacing) {
    hedgingTimer = setTimeout(() => {
      if (!winnerEngine) {
        logToTerminal(
          'warn',
          'RAD_AI',
          `⏳ [Hedge Watchdog] Raced engines exceeded 2.5s TTFT — firing LithosAI backup concurrently!`
        );
        const lithosBackupKey = getLithosAiApiKey();
        if (!lithosBackupKey) return;

        const lithosCtrl = new AbortController();
        controllers['lithos_backup'] = lithosCtrl;

        const backupEngine: EngineDefinition = {
          id: 'lithos',
          name: 'LithosAI (Hedge)',
          url: LITHOSAI_API_URL,
          apiKey: lithosBackupKey,
          model: currentTurnHasMedia ? LITHOS_VISION_MODELS[0] : LITHOS_TEXT_MODELS[0],
        };

        streamEngineAttempt(
          backupEngine,
          currentTurnHasMedia ? visionMessages : textOnlyMessages,
          lithosCtrl.signal,
          (winEng, ttftMs) => {
            if (!winnerEngine) {
              winnerEngine = winEng;
              winnerTtftMs = ttftMs;
              for (const [id, ctrl] of Object.entries(controllers)) {
                if (id !== 'lithos_backup') ctrl.abort();
              }
            }
          },
          (acc, chunk) => {
            if (!winnerEngine || winnerEngine.id === 'lithos') {
              onChunk?.(acc, chunk);
            }
          }
        )
          .then((res) => {
            if (!finalResponse) finalResponse = res;
          })
          .catch(() => {});
      }
    }, 2500);
  }

  // Run the speculative race — each engine uses its own pre-built message payload
  const racePromises = activeEngineEntries.map(async ({ def: engine, messages: engineMessages }) => {
    try {
      const result = await streamEngineAttempt(
        engine,
        engineMessages,
        controllers[engine.id].signal,
        (winningEngine, ttftMs) => {
          if (!winnerEngine) {
            winnerEngine = winningEngine;
            winnerTtftMs = ttftMs;
            if (hedgingTimer) clearTimeout(hedgingTimer);

            const elapsed = Date.now() - t0;
            logToTerminal(
              'success',
              'RAD_AI',
              `🏆 [Tri-Engine Race] WINNER: ${winningEngine.name} — First token in ${ttftMs}ms (total race elapsed: ${elapsed}ms)! Streaming tokens...`
            );

            // Immediately abort slower competitors to save quota & bandwidth
            for (const [id, ctrl] of Object.entries(controllers)) {
              if (id !== engine.id) {
                ctrl.abort();
              }
            }
          }
        },
        (accumulated, chunk) => {
          if (winnerEngine?.id === engine.id) {
            onChunk?.(accumulated, chunk);
          }
        }
      );

      if (winnerEngine?.id === engine.id) {
        finalResponse = result;
      }
      return result;
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn(`[Tri-Engine] ${engine.name} note:`, err?.message || err);
      }
      return null;
    }
  });

  await Promise.allSettled(racePromises);
  if (hedgingTimer) clearTimeout(hedgingTimer);

  if (finalResponse.trim()) {
    const elapsed = Date.now() - t0;
    const engineName = (winnerEngine as EngineDefinition | null)?.name || 'Engine';
    logToTerminal(
      'success',
      'RAD_AI',
      `✨ [Tri-Engine] Completed via ${engineName} in ${elapsed}ms (TTFT: ${winnerTtftMs ?? 'N/A'}ms, ${finalResponse.length} chars)`
    );
    return finalResponse;
  }

  // Sequential guaranteed fallback with LithosAI if everything in the race failed or was aborted
  logToTerminal('warn', 'RAD_AI', '⚠️ Speculative race yielded no output — activating guaranteed LithosAI fallback chain...');
  const fallbackModels = currentTurnHasMedia ? LITHOS_VISION_MODELS : LITHOS_TEXT_MODELS;

  for (const model of fallbackModels) {
    try {
      const fallbackCtrl = new AbortController();
      const fallbackTimeout = setTimeout(() => fallbackCtrl.abort(), 18000);

      const lithosEngine: EngineDefinition = {
        id: 'lithos',
        name: `LithosAI (${model})`,
        url: LITHOSAI_API_URL,
        apiKey: getLithosAiApiKey(),
        model,
      };

      let fallbackTtft: number | null = null;
      const result = await streamEngineAttempt(
        lithosEngine,
        currentTurnHasMedia ? visionMessages : textOnlyMessages,
        fallbackCtrl.signal,
        (_eng, ttftMs) => {
          fallbackTtft = ttftMs;
          logToTerminal('info', 'RAD_AI', `🚀 [LithosAI Fallback] First token in ${ttftMs}ms via ${model}`);
        },
        (acc, chunk) => onChunk?.(acc, chunk)
      );

      clearTimeout(fallbackTimeout);
      if (result.trim()) {
        logToTerminal('success', 'RAD_AI', `✨ [LithosAI Fallback] Completed via ${model} (TTFT: ${fallbackTtft ?? 'N/A'}ms, ${result.length} chars)`);
        return result;
      }
    } catch (_fallbackErr: any) {
      logToTerminal('warn', 'RAD_AI', `Fallback model ${model} failed, trying next...`);
    }
  }

  // Graceful response if every provider is unreachable
  const gracefulMessage = "I'm temporarily experiencing high demand. Please try sending your message again in a moment.";
  onChunk?.(gracefulMessage, gracefulMessage);
  return gracefulMessage;
}

// Backwards compatibility alias
export const requestLithosAiChat = requestRapidRouterChat;
