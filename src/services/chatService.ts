import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { ChatSession, ChatMessage } from '../types/chat';
import { requestRapidRouterChat, type ChatMessagePayload } from './rapidRouterService';

const DEFAULT_AI_MODEL = 'qwen/qwen3.7-flash';

// Scoped local storage key for each user
function getStorageKey(userId: string): string {
  return `rad_user_chats_${userId.toLowerCase().trim()}`;
}

// Local storage fallback helpers per user
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
  const base = (a.messages?.length || 0) >= (b.messages?.length || 0) ? a : b;
  return {
    ...base,
    messages: mergeMessages(a.messages, b.messages),
    participants: Array.from(
      new Set(
        [...(a.participants || []), ...(b.participants || [])].map((p) => p.toLowerCase().trim())
      )
    ),
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0),
  };
}

async function fetchChatFromFirestore(userKey: string, chatId: string): Promise<ChatSession | null> {
  try {
    const snap = await getDoc(doc(db, 'users', userKey.toLowerCase().trim(), 'chats', chatId));
    if (snap.exists()) {
      return { ...(snap.data() as ChatSession), id: snap.id };
    }
  } catch (e) {
    console.warn(`Could not fetch chat ${chatId} for ${userKey}:`, e);
  }
  return null;
}

async function loadLatestChat(userId: string, chatId: string): Promise<ChatSession | null> {
  const userKey = userId.toLowerCase().trim();
  const local = getLocalChatsForUser(userId).find((c) => c.id === chatId) || null;
  const remote = await fetchChatFromFirestore(userKey, chatId);
  return preferRicherChat(local, remote);
}

async function persistChatForParticipants(chat: ChatSession): Promise<void> {
  const payload = sanitizeChat({
    ...chat,
    participants: Array.from(
      new Set((chat.participants || []).map((p) => p.toLowerCase().trim()).filter(Boolean))
    ),
  });

  for (const p of payload.participants) {
    try {
      const existing = await fetchChatFromFirestore(p, payload.id);
      const merged = preferRicherChat(existing, payload) || payload;
      const chatDocRef = doc(db, 'users', p, 'chats', payload.id);
      await setDoc(chatDocRef, sanitizeChat(merged));
      saveLocalChatsForUser(p, [
        merged,
        ...getLocalChatsForUser(p).filter((c) => c.id !== payload.id),
      ]);
    } catch (err: any) {
      console.warn(`⚠️ [Rad Firestore] Persist notice for ${p}:`, err?.message || err);
    }
  }
}

/**
 * Listens in real-time to a specific user's chats from Firestore (users/{userId}/chats).
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
  let isFirestoreActive = false;

  try {
    const userChatsRef = collection(db, 'users', userKey, 'chats');
    const q = query(userChatsRef, orderBy('updatedAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        isFirestoreActive = true;
        const chats: ChatSession[] = [];
        const localChats = getLocalChatsForUser(userId);
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const remoteChat: ChatSession = {
            id: docSnap.id,
            title: data.title || 'Untitled',
            createdAt: data.createdAt || Date.now(),
            updatedAt: data.updatedAt || Date.now(),
            model: data.model || DEFAULT_AI_MODEL,
            messages: data.messages || [],
            creator: data.creator || userId,
            participants: data.participants || [userKey],
          };
          const localChat = localChats.find((c) => c.id === docSnap.id);
          chats.push(preferRicherChat(localChat, remoteChat) || remoteChat);
        });

        // If Firestore has no chats yet for this user, but local cache does, backfill to Firestore!
        if (chats.length === 0) {
          const localChats = getLocalChatsForUser(userId);
          if (localChats.length > 0) {
            localChats.forEach(async (chat) => {
              try {
                await setDoc(doc(db, 'users', userKey, 'chats', chat.id), chat);
              } catch (e) {
                console.warn('Could not sync chat to Firestore:', e);
              }
            });
            onUpdate(localChats);
            return;
          }
        }

        // Mirror to local cache for this user
        saveLocalChatsForUser(userId, chats);
        onUpdate(chats);
      },
      (error) => {
        console.warn(`Firestore chats subscription notice for user ${userId}:`, error.message);
        if (!isFirestoreActive) {
          onUpdate(getLocalChatsForUser(userId));
        }
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn(`Firestore user chats query fallback for ${userId}:`, err);
    onUpdate(getLocalChatsForUser(userId));
    return () => {};
  }
}

/**
 * Creates a new chat session for a specific user.
 * Supports text and attached images with non-blocking instant creation.
 */
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

  console.log('🚀 [Rad Chat] createNewChat initiated:', {
    userId,
    chatId,
    initialPromptLength: initialPrompt.length,
    modelName,
    imageCount: images?.length || 0,
    hasStreamHandler: Boolean(onStreamUpdate),
  });

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

  // 1. Immediately save initial session to user's local storage
  const current = getLocalChatsForUser(userId);
  saveLocalChatsForUser(userId, [newSession, ...current]);
  console.log('💾 [Rad Storage] Initial session saved to local cache:', chatId);

  await persistChatForParticipants(newSession);
  console.log('☁️ [Rad Firestore] Initial session synced to Firestore:', chatId);

  // 3. Asynchronously request AI response with real-time token streaming via RapidRouter
  (async () => {
    try {
      console.log('🤖 [Rad AI] Requesting RapidRouter Qwen 3.7 Flash streaming response for new chat...', { modelName });
      const aiContent = await requestRapidRouterChat(
        [{ role: 'user', content: initialPrompt, images: images && images.length > 0 ? images : undefined }],
        'qwen/qwen3.7-flash',
        (accumulated) => {
          if (onStreamUpdate) {
            onStreamUpdate(accumulated);
          }
        }
      );

      console.log('✨ [Rad AI] Streaming response completed for new chat, length:', aiContent.length);

      const latest = (await loadLatestChat(userId, chatId)) || newSession;
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

      await persistChatForParticipants(sessionToUpdate);
      console.log('☁️ [Rad Firestore] Final assistant response persisted to Firestore for chat:', chatId);
    } catch (err: any) {
      console.error('❌ [Rad AI] Background AI request error for new chat:', err);
    }
  })();

  return chatId;
}

/**
 * Invites a user into an existing chat session.
 * Syncs the session to both users' Firestore subcollections and appends a system invite message.
 */
export async function inviteUserToChat(
  inviterUsername: string,
  inviteeUsername: string,
  chatId: string
): Promise<ChatSession | null> {
  const inviterKey = inviterUsername.toLowerCase().trim();
  const inviteeKey = inviteeUsername.toLowerCase().trim();

  const fromInviter = await loadLatestChat(inviterUsername, chatId);
  const fromInvitee = await loadLatestChat(inviteeUsername, chatId);
  const fromInviterRemote = await fetchChatFromFirestore(inviterKey, chatId);
  let target = preferRicherChat(
    preferRicherChat(fromInviter, fromInviterRemote),
    fromInvitee
  );

  if (!target) return null;

  const currentParticipants = (target.participants || [inviterKey]).map((p) => p.toLowerCase().trim());
  const updatedParticipants = currentParticipants.includes(inviteeKey)
    ? currentParticipants
    : [...currentParticipants, inviteeKey];

  const now = Date.now();
  const alreadyJoined = currentParticipants.includes(inviteeKey);
  const inviteSystemMsg: ChatMessage = {
    id: 'msg_invite_' + now,
    role: 'assistant',
    content: `🤝 **${inviteeUsername}** accepted **${inviterUsername}**'s invite. Both collaborators can now see this conversation and ask questions together with Rad AI!`,
    createdAt: now,
    sender: 'system',
  };

  target = {
    ...target,
    participants: updatedParticipants,
    messages: alreadyJoined
      ? target.messages
      : mergeMessages(target.messages, [inviteSystemMsg]),
    updatedAt: now,
  };

  await persistChatForParticipants(target);
  return target;
}

/**
 * Starts a new chat on the inviter's side only.
 * The invitee receives the session after they accept the invite.
 */
export async function createSharedChatWithUser(
  inviterUsername: string,
  inviteeUsername: string,
  modelName: string = DEFAULT_AI_MODEL
): Promise<string> {
  const inviterKey = inviterUsername.toLowerCase().trim();
  const chatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const now = Date.now();
  const title = `Chat with ${inviteeUsername}`;

  const welcomeMsg: ChatMessage = {
    id: 'msg_' + now,
    role: 'assistant',
    content: `👋 Invite sent to **${inviteeUsername}**. This chat will be shared once they accept from their notifications.`,
    createdAt: now,
    sender: 'system',
  };

  const newSession: ChatSession = {
    id: chatId,
    title,
    createdAt: now,
    updatedAt: now,
    model: modelName,
    messages: [welcomeMsg],
    creator: inviterUsername,
    participants: [inviterKey],
  };

  const inviterChats = getLocalChatsForUser(inviterUsername);
  saveLocalChatsForUser(inviterUsername, [newSession, ...inviterChats]);
  await persistChatForParticipants(newSession);

  return chatId;
}

/**
 * Appends a message and AI response for a specific user's chat.
 * Supports text and attached images.
 */
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

  console.log('🚀 [Rad Chat] sendChatMessage called:', {
    userId,
    chatId,
    userPromptLength: userPrompt.length,
    modelName,
    imageCount: images?.length || 0,
    hasStreamHandler: Boolean(onStreamUpdate),
  });

  const userMsg: ChatMessage = {
    id: 'msg_' + now,
    role: 'user',
    content: userPrompt,
    createdAt: now,
    sender: userId,
    ...(images && images.length > 0 ? { images } : {}),
  };

  let target = await loadLatestChat(userId, chatId);

  if (!target) {
    console.error('❌ [Rad Chat] Target chat session not found for id:', chatId);
    return;
  }

  const participantKeys = Array.from(
    new Set((target.participants || [userKey]).map((p) => p.toLowerCase().trim()))
  );
  for (const p of participantKeys) {
    const otherCopy = await fetchChatFromFirestore(p, chatId);
    target = preferRicherChat(target, otherCopy) || target;
  }

  target = {
    ...target,
    messages: mergeMessages(target.messages, [userMsg]),
    updatedAt: now,
    model: modelName || target.model,
    participants: participantKeys,
  };
  saveLocalChatsForUser(userId, [
    target,
    ...getLocalChatsForUser(userId).filter((c) => c.id !== chatId),
  ]);
  console.log('💾 [Rad Storage] User message saved to local cache for chat:', chatId);

  await persistChatForParticipants(target);
  const participants = target.participants || [userKey];

  // 2. Request AI response from RapidRouter Qwen 3.7 Flash
  const historyPayloads: ChatMessagePayload[] = target.messages
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role,
      content: m.content,
      images: m.images,
    }));

  console.log('🤖 [Rad AI] Requesting RapidRouter streaming inference for chat...', {
    model: 'qwen/qwen3.7-flash',
    historyCount: historyPayloads.length,
    hasImages: historyPayloads.some((h) => h.images && h.images.length > 0),
  });

  let aiContent = '';
  try {
    aiContent = await requestRapidRouterChat(historyPayloads, 'qwen/qwen3.7-flash', (accumulated) => {
      if (onStreamUpdate) {
        onStreamUpdate(accumulated);
      }
    });
    console.log('✨ [Rad AI] RapidRouter streaming response completed for chat, length:', aiContent.length);
  } catch (err: any) {
    console.error('❌ [Rad AI] RapidRouter AI generation error:', err);
    aiContent = `⚠️ **AI Generation Error**: ${err?.message || 'Failed to generate response.'}`;
    if (onStreamUpdate) {
      onStreamUpdate(aiContent);
    }
  }

  const assistantMsg: ChatMessage = {
    id: finalAiMsgId,
    role: 'assistant',
    content: aiContent,
    createdAt: Date.now(),
    sender: 'Rad AI',
    replyToUser: userId,
  };

  const latestBeforeAi = (await loadLatestChat(userId, chatId)) || target;
  target = {
    ...latestBeforeAi,
    participants,
    messages: mergeMessages(latestBeforeAi.messages, target.messages).map((m) =>
      m.id === finalAiMsgId ? assistantMsg : m
    ),
    updatedAt: Date.now(),
  };
  if (!target.messages.some((m) => m.id === finalAiMsgId)) {
    target.messages = mergeMessages(target.messages, [assistantMsg]);
  }
  saveLocalChatsForUser(userId, [
    target,
    ...getLocalChatsForUser(userId).filter((c) => c.id !== chatId),
  ]);

  await persistChatForParticipants(target);
}

/**
 * Deletes a chat session for a user from both local cache and Firebase Firestore.
 */
export async function deleteChatSession(userId: string, chatId: string): Promise<void> {
  const userKey = userId.toLowerCase().trim();
  const currentChats = getLocalChatsForUser(userId);
  const target = currentChats.find((c) => c.id === chatId);
  const remaining = currentChats.filter((c) => c.id !== chatId);
  saveLocalChatsForUser(userId, remaining);

  const participants = target?.participants || [userKey];
  for (const p of participants) {
    try {
      const pKey = p.toLowerCase().trim();
      const pRemaining = getLocalChatsForUser(pKey).filter((c) => c.id !== chatId);
      saveLocalChatsForUser(pKey, pRemaining);

      const chatDocRef = doc(db, 'users', pKey, 'chats', chatId);
      await deleteDoc(chatDocRef);
    } catch (err) {
      console.warn(`Firestore delete for ${p} notice:`, err);
    }
  }
}
