import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';

export interface PeerMessage {
  id: string;
  sender: string;
  content: string;
  createdAt: number;
}

function getLocalPeerKey(chatId: string): string {
  return `rad_peer_msgs_${chatId}`;
}

function getLocalPeerMessages(chatId: string): PeerMessage[] {
  try {
    const raw = localStorage.getItem(getLocalPeerKey(chatId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalPeerMessages(chatId: string, msgs: PeerMessage[]) {
  try {
    localStorage.setItem(getLocalPeerKey(chatId), JSON.stringify(msgs));
  } catch {
    // ignore
  }
}

/**
 * Real-time listener for direct peer messages between collaborators in a shared chat session.
 */
export function subscribeToPeerMessages(
  chatId: string,
  onUpdate: (messages: PeerMessage[]) => void
): () => void {
  if (!chatId) {
    onUpdate([]);
    return () => {};
  }

  // 1. Initial emission from local storage cache for instant rendering
  const cached = getLocalPeerMessages(chatId);
  if (cached.length > 0) {
    onUpdate(cached);
  }

  // 2. Real-time Firestore subscription to subcollection: chats/{chatId}/peer_messages
  const collRef = collection(db, 'chats', chatId, 'peer_messages');
  const q = query(collRef, orderBy('createdAt', 'asc'), limit(150));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const messages: PeerMessage[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        messages.push({
          id: d.id,
          sender: data.sender || 'Unknown',
          content: data.content || '',
          createdAt: data.createdAt || Date.now(),
        });
      });

      // Merge with any local cache in case of recent offline sends
      const map = new Map<string, PeerMessage>();
      cached.forEach((m) => map.set(m.id, m));
      messages.forEach((m) => map.set(m.id, m));
      const merged = Array.from(map.values()).sort((a, b) => a.createdAt - b.createdAt);

      saveLocalPeerMessages(chatId, merged);
      onUpdate(merged);
    },
    (err) => {
      console.warn(`[PEER_CHAT] Firestore listener notice for ${chatId}:`, err);
      // Fall back to local cache
      onUpdate(getLocalPeerMessages(chatId));
    }
  );

  return unsubscribe;
}

/**
 * Send a new peer message in the shared chat session.
 */
export async function sendPeerMessage(
  chatId: string,
  sender: string,
  content: string
): Promise<PeerMessage> {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('Message cannot be empty');
  }

  const messageId = `peer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newMsg: PeerMessage = {
    id: messageId,
    sender,
    content: trimmed,
    createdAt: Date.now(),
  };

  // Optimistic local update
  const current = getLocalPeerMessages(chatId);
  saveLocalPeerMessages(chatId, [...current, newMsg]);

  // Persist to Firestore
  try {
    const docRef = doc(db, 'chats', chatId, 'peer_messages', messageId);
    await setDoc(docRef, newMsg);
  } catch (err) {
    console.warn(`[PEER_CHAT] Failed to persist message to Firestore for ${chatId}:`, err);
  }

  return newMsg;
}
