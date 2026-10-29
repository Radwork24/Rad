import {
  collection,
  doc,
  getDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { ChatSession, ChatMessage } from '../types/chat';
import { requestRapidRouterChat, type ChatMessagePayload } from './rapidRouterService';

const DEFAULT_AI_MODEL = 'Rad 1.1 Flash';

function getStorageKey(userId: string): string {
  return `rad_user_chats_${userId.toLowerCase().trim()}`;
}

function getLocalChatsForUser(userId: string): ChatSession[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn(`Failed to read local chats for ${userId}:`, e);
    return [];
  }
}

function saveLocalChatsForUser(userId: string, chats: ChatSession[]) {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(chats));
  } catch (e) {
    console.warn(`Failed to save local chats for ${userId}:`, e);
  }
}

function sanitizeChat(chat: ChatSession): ChatSession {
  return JSON.parse(JSON.stringify(chat)) as ChatSession;
}

function uniqueParticipants(...lists: Array<string[] | undefined>): string[] {
  return Array.from(
    new Set(
      lists
        .flat()
        .filter(Boolean)
        .map((p) => p!.toLowerCase().trim())
    )
  );
}

function mergeMessages(a: ChatMessage[] = [], b: ChatMessage[] = []): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  [...a, ...b].forEach((msg) => {
    if (!msg?.id) return;
    const existing = byId.get(msg.id);
    if (!existing || (msg.content || '').length >= (existing.content || '').length) {
      byId.set(msg.id, msg);
    }
  });
  return Array.from(byId.values()).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
}

function preferRicherChat(a: ChatSession | null | undefined, b: ChatSession | null | undefined): ChatSession | null {
  if (!a) return b || null;
  if (!b) return a;
  const base = (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b;
  return {
    ...base,
    messages: mergeMessages(a.messages, b.messages),
    participants: uniqueParticipants(a.participants, b.participants),
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0),
    title: (a.messages?.length || 0) >= (b.messages?.length || 0) ? a.title : b.title,
  };
}

export function mergeChatLists(local: ChatSession[], remote: ChatSession[]): ChatSession[] {
  const ids = new Set([...local.map((c) => c.id), ...remote.map((c) => c.id)]);
  const result: ChatSession[] = [];
  ids.forEach((id) => {
    const merged = preferRicherChat(
      local.find((c) => c.id === id),
      remote.find((c) => c.id === id)
    );
    if (merged) result.push(merged);
  });
  return result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function sharedChatRef(chatId: string) {
  return doc(db, 'chats', chatId);
}

function legacyChatRef(userKey: string, chatId: string) {
  return doc(db, 'users', userKey.toLowerCase().trim(), 'chats', chatId);
}

function toSession(id: string, data: Record<string, unknown>, fallbackUser?: string): ChatSession {
  return {
    id,
    title: (data.title as string) || 'Untitled',
    createdAt: (data.createdAt as number) || Date.now(),
    updatedAt: (data.updatedAt as number) || Date.now(),
    model: (data.model as string) || DEFAULT_AI_MODEL,
    messages: (data.messages as ChatMessage[]) || [],
    creator: (data.creator as string) || fallbackUser,
    participants: uniqueParticipants(data.participants as string[] | undefined, fallbackUser ? [fallbackUser] : []),
  };
}

async function fetchSharedChat(chatId: string): Promise<ChatSession | null> {
  try {
    const snap = await getDoc(sharedChatRef(chatId));
    if (snap.exists()) {
      return toSession(snap.id, snap.data() as Record<string, unknown>);
    }
  } catch (e) {
    console.warn(`Could not fetch shared chat ${chatId}:`, e);
  }
  return null;
}

async function fetchLegacyChat(userKey: string, chatId: string): Promise<ChatSession | null> {
  try {
    const snap = await getDoc(legacyChatRef(userKey, chatId));
    if (snap.exists()) {
      return toSession(snap.id, snap.data() as Record<string, unknown>, userKey);
    }
  } catch (e) {
    console.warn(`Could not fetch legacy chat ${chatId} for ${userKey}:`, e);
  }
  return null;
}

async function loadCanonicalChat(chatId: string, userId?: string): Promise<ChatSession | null> {
  const shared = await fetchSharedChat(chatId);
  const local = userId ? getLocalChatsForUser(userId).find((c) => c.id === chatId) || null : null;
  const legacy = userId ? await fetchLegacyChat(userId, chatId) : null;
  return preferRicherChat(preferRicherChat(shared, legacy), local);
}

async function persistSharedChat(chat: ChatSession): Promise<ChatSession> {
  const incoming = sanitizeChat({
    ...chat,
    participants: uniqueParticipants(chat.participants),
  });

  const saved = await runTransaction(db, async (tx) => {
    const ref = sharedChatRef(incoming.id);
    const snap = await tx.get(ref);
    const existing = snap.exists()
      ? toSession(snap.id, snap.data() as Record<string, unknown>)
      : null;
    const merged = preferRicherChat(existing, incoming) || incoming;
    const payload = sanitizeChat({
      ...merged,
      participants: uniqueParticipants(existing?.participants, incoming.participants),
      updatedAt: Math.max(merged.updatedAt || 0, Date.now()),
    });
    tx.set(ref, payload);
    return payload;
  });

  return saved;
}

async function migrateLegacyChatIfNeeded(userKey: string, chat: ChatSession): Promise<void> {
  try {
    const shared = await fetchSharedChat(chat.id);
    const merged = preferRicherChat(shared, {
      ...chat,
      participants: uniqueParticipants(chat.participants, [userKey], shared?.participants),
    });
    if (!merged) return;
    if (
      !shared ||
      (merged.messages?.length || 0) > (shared.messages?.length || 0) ||
      !(shared.participants || []).includes(userKey)
    ) {
      await persistSharedChat(merged);
    }
  } catch (err) {
    console.warn('Legacy chat migrate notice:', err);
  }
}

/**
 * All participants listen to the same `chats/{chatId}` documents.
 */
export function subscribeToChats(
  userId: string,
  onUpdate: (chats: ChatSession[]) => void
): () => void {
  if (!userId) {
    onUpdate([]);
    return () => {};
  }

  const userKey = userId.toLowerCase().trim();
  let sharedList: ChatSession[] = [];
  let didReceiveShared = false;
  let didReceiveLegacy = false;

  const emit = () => {
    const merged = mergeChatLists(getLocalChatsForUser(userId), sharedList);
    saveLocalChatsForUser(userId, merged);
    onUpdate(merged);
  };

  const sharedQuery = query(
    collection(db, 'chats'),
    where('participants', 'array-contains', userKey)
  );

  const unsubShared = onSnapshot(
    sharedQuery,
    (snapshot) => {
      didReceiveShared = true;
      sharedList = [];
      snapshot.forEach((docSnap) => {
        sharedList.push(toSession(docSnap.id, docSnap.data() as Record<string, unknown>, userKey));
      });
      emit();
    },
    (error) => {
      console.warn(`Shared chats subscription notice for ${userId}:`, error.message);
      if (!didReceiveShared) {
        onUpdate(getLocalChatsForUser(userId));
      }
    }
  );

  const legacyQuery = collection(db, 'users', userKey, 'chats');
  const unsubLegacy = onSnapshot(
    legacyQuery,
    (snapshot) => {
      didReceiveLegacy = true;
      snapshot.forEach((docSnap) => {
        const legacy = toSession(docSnap.id, docSnap.data() as Record<string, unknown>, userKey);
        void migrateLegacyChatIfNeeded(userKey, legacy);
      });
      if (!didReceiveShared && snapshot.size > 0) {
        const legacyChats: ChatSession[] = [];
        snapshot.forEach((docSnap) => {
          legacyChats.push(toSession(docSnap.id, docSnap.data() as Record<string, unknown>, userKey));
        });
        sharedList = mergeChatLists(sharedList, legacyChats);
        emit();
      }
    },
    (error) => {
      console.warn(`Legacy chats subscription notice for ${userId}:`, error.message);
      if (!didReceiveLegacy && !didReceiveShared) {
        onUpdate(getLocalChatsForUser(userId));
      }
    }
  );

  return () => {
    unsubShared();
    unsubLegacy();
  };
}

export async function createNewChat(
  userId: string,
  initialPrompt: string,
  modelName: string = DEFAULT_AI_MODEL,
  images?: string[],
  chatIdOverride?: string,
  onStreamUpdate?: (streamedText: string) => void,
  assistantMsgId?: string
): Promise<string> {
  const userKey = userId.toLowerCase().trim();
  const chatId = chatIdOverride || ('chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
  const now = Date.now();
  const finalAiMsgId = assistantMsgId || ('msg_ai_' + (now + 1));

  let title = initialPrompt.trim();
  if (!title && images && images.length > 0) {
    title = 'Image analysis';
  } else if (title.length > 36) {
    title = title.substring(0, 36) + '...';
  }

  const userMsg: ChatMessage = {
    id: 'msg_' + now,
    role: 'user',
    content: initialPrompt,
    createdAt: now,
    sender: userId,
    ...(images && images.length > 0 ? { images } : {}),
  };

  const initialAiMsg: ChatMessage = {
    id: finalAiMsgId,
    role: 'assistant',
    content: '',
    createdAt: now + 1,
    sender: 'Rad AI',
    replyToUser: userId,
  };

  const newSession: ChatSession = {
    id: chatId,
    title,
    createdAt: now,
    updatedAt: now,
    model: modelName,
    messages: [userMsg, initialAiMsg],
    creator: userId,
    participants: [userKey],
  };

  saveLocalChatsForUser(userId, [newSession, ...getLocalChatsForUser(userId)]);
  await persistSharedChat(newSession);

  void (async () => {
    try {
      const aiContent = await requestRapidRouterChat(
        [{ role: 'user', content: initialPrompt, images: images && images.length > 0 ? images : undefined }],
        undefined,
        (accumulated) => {
          onStreamUpdate?.(accumulated);
        }
      );

      const latest = (await loadCanonicalChat(chatId, userId)) || newSession;
      const sessionToUpdate: ChatSession = {
        ...latest,
        messages: mergeMessages(latest.messages, newSession.messages).map((m) =>
          m.id === finalAiMsgId ? { ...m, content: aiContent } : m
        ),
        updatedAt: Date.now(),
      };
      if (!sessionToUpdate.messages.some((m) => m.id === finalAiMsgId)) {
        sessionToUpdate.messages.push({
          id: finalAiMsgId,
          role: 'assistant',
          content: aiContent,
          createdAt: Date.now(),
          sender: 'Rad AI',
          replyToUser: userId,
        });
      }

      saveLocalChatsForUser(userId, [
        sessionToUpdate,
        ...getLocalChatsForUser(userId).filter((c) => c.id !== chatId),
      ]);
      await persistSharedChat(sessionToUpdate);
    } catch (err: any) {
      console.error('❌ [Rad AI] Background AI request error for new chat:', err);
    }
  })();

  return chatId;
}

export async function inviteUserToChat(
  inviterUsername: string,
  inviteeUsername: string,
  chatId: string
): Promise<ChatSession | null> {
  const inviterKey = inviterUsername.toLowerCase().trim();
  const inviteeKey = inviteeUsername.toLowerCase().trim();

  const fromShared = await fetchSharedChat(chatId);
  const fromInviter = await loadCanonicalChat(chatId, inviterUsername);
  const fromInvitee = await loadCanonicalChat(chatId, inviteeUsername);
  const inviterLegacy = await fetchLegacyChat(inviterKey, chatId);
  const inviteeLegacy = await fetchLegacyChat(inviteeKey, chatId);
  let target = preferRicherChat(
    preferRicherChat(preferRicherChat(fromShared, fromInviter), fromInvitee),
    preferRicherChat(inviterLegacy, inviteeLegacy)
  );

  if (!target) {
    console.error('❌ [Rad Chat] Shared chat not found to join:', chatId);
    return null;
  }

  const alreadyJoined = uniqueParticipants(target.participants).includes(inviteeKey);
  const now = Date.now();
  const inviteSystemMsg: ChatMessage = {
    id: 'msg_invite_' + now,
    role: 'assistant',
    content: `🤝 **${inviteeUsername}** accepted **${inviterUsername}**'s invite. Both collaborators can now see this conversation and ask questions together with Rad AI!`,
    createdAt: now,
    sender: 'system',
  };

  target = {
    ...target,
    participants: uniqueParticipants(target.participants, [inviterKey, inviteeKey]),
    messages: alreadyJoined ? target.messages : mergeMessages(target.messages, [inviteSystemMsg]),
    updatedAt: now,
  };

  const saved = await persistSharedChat(target);
  if (!uniqueParticipants(saved.participants).includes(inviteeKey)) {
    saved.participants = uniqueParticipants(saved.participants, [inviteeKey]);
    await persistSharedChat(saved);
  }

  saveLocalChatsForUser(inviteeUsername, [
    saved,
    ...getLocalChatsForUser(inviteeUsername).filter((c) => c.id !== chatId),
  ]);
  saveLocalChatsForUser(inviterUsername, [
    saved,
    ...getLocalChatsForUser(inviterUsername).filter((c) => c.id !== chatId),
  ]);
  return saved;
}

export async function createSharedChatWithUser(
  inviterUsername: string,
  inviteeUsername: string,
  modelName: string = DEFAULT_AI_MODEL
): Promise<string> {
  const inviterKey = inviterUsername.toLowerCase().trim();
  const chatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const now = Date.now();

  const welcomeMsg: ChatMessage = {
    id: 'msg_' + now,
    role: 'assistant',
    content: `👋 Invite sent to **${inviteeUsername}**. This chat will be shared once they accept from their notifications.`,
    createdAt: now,
    sender: 'system',
  };

  const newSession: ChatSession = {
    id: chatId,
    title: `Chat with ${inviteeUsername}`,
    createdAt: now,
    updatedAt: now,
    model: modelName,
    messages: [welcomeMsg],
    creator: inviterUsername,
    participants: [inviterKey],
  };

  saveLocalChatsForUser(inviterUsername, [newSession, ...getLocalChatsForUser(inviterUsername)]);
  await persistSharedChat(newSession);
  return chatId;
}

export async function sendChatMessage(
  userId: string,
  chatId: string,
  userPrompt: string,
  modelName: string = DEFAULT_AI_MODEL,
  images?: string[],
  onStreamUpdate?: (streamedText: string) => void,
  assistantMsgId?: string
): Promise<void> {
  const userKey = userId.toLowerCase().trim();
  const now = Date.now();
  const finalAiMsgId = assistantMsgId || ('msg_ai_' + (now + 1));

  const userMsg: ChatMessage = {
    id: 'msg_' + now,
    role: 'user',
    content: userPrompt,
    createdAt: now,
    sender: userId,
    ...(images && images.length > 0 ? { images } : {}),
  };

  const placeholderAi: ChatMessage = {
    id: finalAiMsgId,
    role: 'assistant',
    content: '',
    createdAt: now + 1,
    sender: 'Rad AI',
    replyToUser: userId,
  };

  const latest = await loadCanonicalChat(chatId, userId);
  if (!latest) {
    console.error('❌ [Rad Chat] Target chat session not found for id:', chatId);
    return;
  }

  const withUserMsg: ChatSession = {
    ...latest,
    model: modelName || latest.model,
    participants: uniqueParticipants(latest.participants, [userKey]),
    messages: mergeMessages(latest.messages, [userMsg, placeholderAi]),
    updatedAt: now,
  };

  saveLocalChatsForUser(userId, [
    withUserMsg,
    ...getLocalChatsForUser(userId).filter((c) => c.id !== chatId),
  ]);
  await persistSharedChat(withUserMsg);

  const historyPayloads: ChatMessagePayload[] = withUserMsg.messages
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role,
      content: m.content,
      images: m.images,
    }));

  let aiContent = '';
  try {
    aiContent = await requestRapidRouterChat(historyPayloads, undefined, (accumulated) => {
      onStreamUpdate?.(accumulated);
    });
  } catch (err: any) {
    console.error('❌ [Rad AI] Generation error caught:', err);
    aiContent = "I'm temporarily experiencing high demand. Please try sending your message again in a moment.";
    onStreamUpdate?.(aiContent);
  }

  const assistantMsg: ChatMessage = {
    id: finalAiMsgId,
    role: 'assistant',
    content: aiContent,
    createdAt: Date.now(),
    sender: 'Rad AI',
    replyToUser: userId,
  };

  const afterStream = (await loadCanonicalChat(chatId, userId)) || withUserMsg;
  const completed: ChatSession = {
    ...afterStream,
    participants: uniqueParticipants(afterStream.participants, [userKey]),
    messages: mergeMessages(afterStream.messages, [userMsg, assistantMsg]),
    updatedAt: Date.now(),
  };

  saveLocalChatsForUser(userId, [
    completed,
    ...getLocalChatsForUser(userId).filter((c) => c.id !== chatId),
  ]);
  await persistSharedChat(completed);
}

export async function deleteChatSession(userId: string, chatId: string): Promise<void> {
  const userKey = userId.toLowerCase().trim();
  const remaining = getLocalChatsForUser(userId).filter((c) => c.id !== chatId);
  saveLocalChatsForUser(userId, remaining);

  try {
    const shared = await loadCanonicalChat(chatId, userId);
    if (!shared) {
      await deleteDoc(legacyChatRef(userKey, chatId)).catch(() => undefined);
      return;
    }

    const nextParticipants = uniqueParticipants(shared.participants).filter((p) => p !== userKey);
    if (nextParticipants.length === 0) {
      await deleteDoc(sharedChatRef(chatId));
    } else {
      await persistSharedChat({
        ...shared,
        participants: nextParticipants,
        updatedAt: Date.now(),
      });
    }
    await deleteDoc(legacyChatRef(userKey, chatId)).catch(() => undefined);
  } catch (err) {
    console.warn(`Firestore delete for ${chatId} notice:`, err);
  }
}
