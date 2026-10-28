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
import { inviteUserToChat, createSharedChatWithUser } from './chatService';
import type { ChatSession } from '../types/chat';

export interface ChatInvite {
  id: string;
  chatId: string;
  chatTitle: string;
  fromUsername: string;
  toUsername: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
}

function userKey(name: string): string {
  return name.toLowerCase().trim();
}

function incomingRef(username: string) {
  return collection(db, 'users', userKey(username), 'invites');
}

function sentRef(username: string) {
  return collection(db, 'users', userKey(username), 'sentInvites');
}

function inviteDocId(chatId: string, fromUsername: string, toUsername: string): string {
  return `${chatId}_${userKey(fromUsername)}_${userKey(toUsername)}`;
}

async function writeInviteCopies(invite: ChatInvite): Promise<void> {
  await setDoc(doc(incomingRef(invite.toUsername), invite.id), invite);
  await setDoc(doc(sentRef(invite.fromUsername), invite.id), invite);
}

/**
 * Sends a pending chat invite. The invitee only sees the chat after accepting.
 */
export async function sendChatInvite(
  inviterUsername: string,
  inviteeUsername: string,
  chatId?: string | null,
  chatTitle?: string
): Promise<ChatInvite> {
  const fromKey = userKey(inviterUsername);
  const toKey = userKey(inviteeUsername);

  if (!fromKey || !toKey || fromKey === toKey) {
    throw new Error('You cannot invite yourself.');
  }

  let resolvedChatId = chatId || '';
  let resolvedTitle = chatTitle || 'Shared chat';

  if (!resolvedChatId) {
    resolvedChatId = await createSharedChatWithUser(inviterUsername, inviteeUsername);
    resolvedTitle = `Chat with ${inviteeUsername}`;
  }

  const id = inviteDocId(resolvedChatId, inviterUsername, inviteeUsername);

  try {
    const existing = await getDoc(doc(incomingRef(inviteeUsername), id));
    if (existing.exists()) {
      const data = existing.data() as ChatInvite;
      if (data.status === 'pending') {
        return data;
      }
    }
  } catch (err) {
    console.warn('Could not check existing invite:', err);
  }

  const invite: ChatInvite = {
    id,
    chatId: resolvedChatId,
    chatTitle: resolvedTitle,
    fromUsername: inviterUsername,
    toUsername: inviteeUsername,
    status: 'pending',
    createdAt: Date.now(),
  };

  try {
    await writeInviteCopies(invite);
  } catch (err) {
    console.warn('Firestore invite write warning:', err);
  }

  return invite;
}

export function subscribeToIncomingInvites(
  username: string,
  onUpdate: (invites: ChatInvite[]) => void
): () => void {
  if (!username) {
    onUpdate([]);
    return () => {};
  }

  try {
    const q = query(incomingRef(username), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => {
        const invites: ChatInvite[] = [];
        snapshot.forEach((snap) => {
          const data = snap.data() as ChatInvite;
          if (data.status === 'pending') {
            invites.push({ ...data, id: snap.id });
          }
        });
        onUpdate(invites);
      },
      (error) => {
        console.warn('Incoming invites subscription notice:', error.message);
        onUpdate([]);
      }
    );
  } catch (err) {
    console.warn('Incoming invites query fallback:', err);
    onUpdate([]);
    return () => {};
  }
}

export function subscribeToSentInvites(
  username: string,
  onUpdate: (invites: ChatInvite[]) => void
): () => void {
  if (!username) {
    onUpdate([]);
    return () => {};
  }

  try {
    const q = query(sentRef(username), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => {
        const invites: ChatInvite[] = [];
        snapshot.forEach((snap) => {
          const data = snap.data() as ChatInvite;
          if (data.status === 'pending') {
            invites.push({ ...data, id: snap.id });
          }
        });
        onUpdate(invites);
      },
      (error) => {
        console.warn('Sent invites subscription notice:', error.message);
        onUpdate([]);
      }
    );
  } catch (err) {
    console.warn('Sent invites query fallback:', err);
    onUpdate([]);
    return () => {};
  }
}

export async function acceptChatInvite(invite: ChatInvite): Promise<ChatSession> {
  const session = await inviteUserToChat(invite.fromUsername, invite.toUsername, invite.chatId);
  if (!session) {
    throw new Error('Shared chat could not be opened. Ask your friend to send the invite again.');
  }

  try {
    await deleteDoc(doc(incomingRef(invite.toUsername), invite.id));
    await deleteDoc(doc(sentRef(invite.fromUsername), invite.id));
  } catch (err) {
    console.warn('Could not clear accepted invite:', err);
  }

  return session;
}

export async function declineChatInvite(invite: ChatInvite): Promise<void> {
  try {
    await deleteDoc(doc(incomingRef(invite.toUsername), invite.id));
    await deleteDoc(doc(sentRef(invite.fromUsername), invite.id));
  } catch (err) {
    console.warn('Could not decline invite:', err);
  }
}
