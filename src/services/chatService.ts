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
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          chats.push({
            id: docSnap.id,
            title: data.title || 'Untitled',
            createdAt: data.createdAt || Date.now(),
            updatedAt: data.updatedAt || Date.now(),
            model: data.model || DEFAULT_AI_MODEL,
            messages: data.messages || [],
            creator: data.creator || userId,
            participants: data.participants || [userKey],
          });
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
    images: images && images.length > 0 ? images : undefined,
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

  // 2. Persist initial session to Firestore
  try {
    const chatDocRef = doc(db, 'users', userKey, 'chats', chatId);
    await setDoc(chatDocRef, newSession);
    console.log('☁️ [Rad Firestore] Initial session synced to Firestore:', chatId);
  } catch (err: any) {
    console.warn('⚠️ [Rad Firestore] Initial Firestore chat save notice:', err.message);
  }

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

      const updatedChats = getLocalChatsForUser(userId);
      const sessionToUpdate = updatedChats.find((c) => c.id === chatId) || newSession;
      const targetAiMsg = sessionToUpdate.messages.find((m) => m.id === finalAiMsgId);
      if (targetAiMsg) {
        targetAiMsg.content = aiContent;
      } else {
        sessionToUpdate.messages.push({
          id: finalAiMsgId,
          role: 'assistant',
          content: aiContent,
          createdAt: Date.now(),
          sender: 'Rad AI',
          replyToUser: userId,
        });
      }
      sessionToUpdate.updatedAt = Date.now();

      saveLocalChatsForUser(userId, [
        sessionToUpdate,
        ...updatedChats.filter((c) => c.id !== chatId),
      ]);

      const chatDocRef = doc(db, 'users', userKey, 'chats', chatId);
      await setDoc(chatDocRef, sessionToUpdate);
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

  // 1. Get current chats (try local cache, fallback to Firestore if needed)
  const localChats = getLocalChatsForUser(inviterUsername);
  let target = localChats.find((c) => c.id === chatId);

  if (!target) {
    try {
      const snap = await getDoc(doc(db, 'users', inviterKey, 'chats', chatId));
      if (snap.exists()) {
        target = snap.data() as ChatSession;
      }
    } catch (e) {
      console.warn('Error retrieving chat for invite:', e);
    }
  }

  if (!target) return null;

  // 2. Check if already invited
  const currentParticipants = (target.participants || [inviterKey]).map((p) => p.toLowerCase().trim());
  if (currentParticipants.includes(inviteeKey)) {
    return target;
  }

  const updatedParticipants = [...currentParticipants, inviteeKey];
  const now = Date.now();

  const inviteSystemMsg: ChatMessage = {
    id: 'msg_invite_' + now,
    role: 'assistant',
    content: `🤝 **${inviteeUsername}** accepted **${inviterUsername}**'s invite. Both collaborators can now see this conversation and ask questions together with Rad AI!`,
    createdAt: now,
    sender: 'system',
  };

  target.participants = updatedParticipants;
  target.messages.push(inviteSystemMsg);
  target.updatedAt = now;

  // 3. Save to inviter's local storage
  saveLocalChatsForUser(inviterUsername, [
    target,
    ...localChats.filter((c) => c.id !== chatId),
  ]);

  // 4. Save to invitee's local storage
  const inviteeLocal = getLocalChatsForUser(inviteeUsername);
  saveLocalChatsForUser(inviteeUsername, [
    target,
    ...inviteeLocal.filter((c) => c.id !== chatId),
  ]);

  // 5. Persist to Firestore for ALL participants
  for (const p of updatedParticipants) {
    try {
      const chatDocRef = doc(db, 'users', p.toLowerCase().trim(), 'chats', chatId);
      await setDoc(chatDocRef, target);
    } catch (err) {
      console.warn(`Firestore invite save for ${p}:`, err);
    }
  }

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

  try {
    await setDoc(doc(db, 'users', inviterKey, 'chats', chatId), newSession);
  } catch (err) {
    console.warn('Firestore shared chat creation warning:', err);
  }

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
    images: images && images.length > 0 ? images : undefined,
  };

  // 1. Update user's local cache
  const chats = getLocalChatsForUser(userId);
  let target = chats.find((c) => c.id === chatId);

  if (!target) {
    try {
      const snap = await getDoc(doc(db, 'users', userKey, 'chats', chatId));
      if (snap.exists()) {
        target = snap.data() as ChatSession;
      }
    } catch (e) {
      console.warn('⚠️ [Rad Firestore] Could not fetch chat in sendChatMessage:', e);
    }
  }

  if (!target) {
    console.error('❌ [Rad Chat] Target chat session not found for id:', chatId);
    return;
  }

  // Check if assistant message placeholder was already added in React optimistic state
  target.messages.push(userMsg);
  target.updatedAt = now;
  if (modelName) target.model = modelName;
  saveLocalChatsForUser(userId, [
    target,
    ...chats.filter((c) => c.id !== chatId),
  ]);
  console.log('💾 [Rad Storage] User message saved to local cache for chat:', chatId);

  // Sync to all participants in Firestore
  const participants = target.participants || [userKey];
  for (const p of participants) {
    try {
      const chatDocRef = doc(db, 'users', p.toLowerCase().trim(), 'chats', chatId);
      await setDoc(chatDocRef, target);
      console.log(`☁️ [Rad Firestore] User message synced to Firestore for participant: ${p}`);
    } catch (err: any) {
      console.warn(`⚠️ [Rad Firestore] Firestore message sync notice for ${p}:`, err.message);
    }
  }

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

  // 3. Update with final AI response
  const existingAiIdx = target.messages.findIndex((m) => m.id === finalAiMsgId);
  if (existingAiIdx >= 0) {
    target.messages[existingAiIdx] = assistantMsg;
  } else {
    target.messages.push(assistantMsg);
  }
  target.updatedAt = Date.now();
  saveLocalChatsForUser(userId, [
    target,
    ...chats.filter((c) => c.id !== chatId),
  ]);

  for (const p of participants) {
    try {
      const chatDocRef = doc(db, 'users', p.toLowerCase().trim(), 'chats', chatId);
      await setDoc(chatDocRef, target);
      console.log(`☁️ [Rad Firestore] Assistant response synced to Firestore for: ${p}`);
    } catch (err: any) {
      console.warn(`⚠️ [Rad Firestore] Assistant sync notice for ${p}:`, err.message);
    }
  }
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
