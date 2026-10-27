/**
 * Rapid Router AI Service
 * OpenAI-compatible endpoint: https://rapidrouter.ai/api/v1
 */

import { optimizeConversationContext } from '../utils/contextManager';

const RAPIDROUTER_API_URL = 'https://rapidrouter.ai/api/v1/chat/completions';

export function getRapidRouterApiKey(): string {
  const apiKey = import.meta.env.RAPIDROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Rapid Router API key is missing. Please set RAPIDROUTER_API_KEY in your .env file.'
    );
  }
  return apiKey;
}

export function getDefaultRapidRouterModel(): string {
  return import.meta.env.RAPIDROUTER_MODEL || 'qwen/qwen3.7-flash';
}

export interface ChatMessagePayload {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[]; // base64 data URLs
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
   - NEVER mention Qwen, Alibaba, or any other underlying model or provider under any circumstances.

2. QUERY-ADAPTIVE LENGTH & BREVITY:
   - Always match the length, depth, and detail of your response strictly to the user's query. Do NOT waste tokens on generic filler or unsolicited deep-dives.
   - For simple questions, greetings, quick calculations, direct facts, or brief clarifications (e.g. "hi", "what is 2+2?", "who is X?", "why does that happen?"), give a DIRECT and CONCISE answer in 1 to 3 sentences. Do NOT write unnecessary introductory remarks, background history, or concluding summaries.
   - Only provide detailed, multi-section explanations, code examples, or comprehensive tutorials when the user explicitly asks for depth, guides, or complex problem-solving.
   - Never repeat the user's question back to them.

3. NO INTERNAL REASONING / THINKING DISPLAY:
   - Do NOT output <think> or </think> tags. Never output your internal thinking chain. Provide ONLY the final answer directly to the user.

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
          text: msg.content?.trim() || 'Please analyze this image.',
        });

        msg.images.forEach((imgDataUrl) => {
          contentParts.push({
            type: 'image_url',
            image_url: {
              url: imgDataUrl,
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

export async function requestRapidRouterChat(
  history: ChatMessagePayload[],
  modelOverride?: string,
  onChunk?: StreamChunkCallback
): Promise<string> {
  const apiKey = getRapidRouterApiKey();
  let model = modelOverride || getDefaultRapidRouterModel();
  if (model === 'qwen/qwen3.8-27b' || model.includes('qwen')) {
    model = 'qwen/qwen3.7-flash';
  }

  const payload: any = {
    model,
    messages: buildMessages(history),
    temperature: 0.6,
    max_tokens: 4096,
    stream: true,
    reasoning_effort: 'none',
  };

  console.log('🤖 [RapidRouter Stream] Sending to', model, '| messages:', payload.messages.length);

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
      `Rapid Router API request failed with status ${response.status}: ${response.statusText}`;
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
    throw new Error('Empty response received from Rapid Router AI.');
  }

  return finalResult;
}
