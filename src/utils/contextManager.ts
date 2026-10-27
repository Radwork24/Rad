export interface ContextMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[];
}

export interface ContextOptimizationOptions {
  /** Maximum number of recent messages to preserve verbatim. Default: 8 */
  maxRecentMessages?: number;
  /** Keep the very first user message to preserve the initial chat goal. Default: true */
  preserveFirstMessage?: boolean;
}

/**
 * Prepares and compacts conversation history for ultra-low latency while
 * preserving full conversational memory for follow-up queries.
 *
 * 1. Image Pruning: Base64 images are only retained on the most recent user turn.
 *    Past turns replace heavy base64 strings with a tiny placeholder '[Attached document/image]',
 *    saving megabytes of network transfer on every follow-up.
 * 2. Sliding Window with Anchor:
 *    - Preserves Turn 0 (the original topic/problem the user asked).
 *    - Summarizes/anchors the intermediate turns into a concise context note.
 *    - Keeps the latest N messages verbatim so shorthand follow-ups ("what about that?",
 *      "explain the 2nd point", "why?") have 100% precision.
 */
export function optimizeConversationContext(
  history: ContextMessage[],
  options: ContextOptimizationOptions = {}
): ContextMessage[] {
  if (!history || history.length === 0) return [];

  const maxRecent = options.maxRecentMessages ?? 8;
  const preserveFirst = options.preserveFirstMessage ?? true;

  // Filter out any empty messages
  const cleanHistory = history.filter(
    (msg) => (msg.content && msg.content.trim().length > 0) || (msg.images && msg.images.length > 0)
  );

  if (cleanHistory.length === 0) return [];

  // Find the index of the latest message that carries images
  let lastImageIdx = -1;
  for (let i = cleanHistory.length - 1; i >= 0; i--) {
    if (cleanHistory[i].images && cleanHistory[i].images!.length > 0) {
      lastImageIdx = i;
      break;
    }
  }

  // 1. Strip heavy base64 images from historical turns (keep ONLY on the latest active image turn)
  const prunedHistory: ContextMessage[] = cleanHistory.map((msg, idx) => {
    if (!msg.images || msg.images.length === 0) {
      return msg;
    }

    if (idx === lastImageIdx) {
      // Keep images on the active image message
      return msg;
    }

    // Replace historical heavy images with lightweight reference
    const note = `[User previously provided ${msg.images.length} attached document/image page(s)]`;
    const updatedContent = msg.content ? `${msg.content}\n${note}` : note;
    return {
      role: msg.role,
      content: updatedContent,
      // images removed to prevent re-uploading megabytes of base64 data
    };
  });

  // If total messages is within the threshold, return the pruned history directly
  if (prunedHistory.length <= maxRecent + 1) {
    return prunedHistory;
  }

  // 2. Sliding Window with Anchor
  const recentMessages = prunedHistory.slice(-maxRecent);
  const olderMessages = prunedHistory.slice(0, -maxRecent);

  const result: ContextMessage[] = [];

  // Anchor the very first message if requested
  if (preserveFirst && olderMessages.length > 0) {
    const firstMsg = olderMessages[0];
    result.push({
      role: firstMsg.role,
      content: firstMsg.content,
    });

    // If there were intermediate turns between message 0 and the recent window,
    // generate a concise context recap so the model remembers the evolution
    if (olderMessages.length > 1) {
      const intermediateTurns = olderMessages.slice(1);
      const summaryBulletPoints: string[] = [];

      intermediateTurns.forEach((m) => {
        if (m.role === 'user') {
          // Truncate to first 120 chars for quick topic recognition
          const preview = m.content.replace(/\s+/g, ' ').trim().slice(0, 120);
          summaryBulletPoints.push(`- User asked about: "${preview}..."`);
        }
      });

      if (summaryBulletPoints.length > 0) {
        result.push({
          role: 'system',
          content: `[Context Memory: In earlier messages of this chat, the following topics were covered:\n${summaryBulletPoints.join('\n')}\nMaintain continuity with these topics.]`,
        });
      }
    }
  }

  // Append recent messages intact
  result.push(...recentMessages);

  return result;
}
