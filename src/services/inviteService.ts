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
import { saveSharedNotebookToUser, markNotebookAsSharedWith } from './notebookService';
import type { ChatSession } from '../types/chat';
import type { NotebookItem, NotebookFile } from '../types/notebook';

export interface ChatInvite {
  id: string;
  chatId: string;
  chatTitle: string;
  fromUsername: string;
  toUsername: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
  type?: 'chat' | 'notebook' | 'document';
  notebookId?: string;
  notebookTitle?: string;
  fileId?: string;
  fileName?: string;
  notebookData?: NotebookItem;
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

/**
 * Sends a pending notebook or individual document invite.
 */
export async function sendNotebookInvite(
  inviterUsername: string,
  inviteeUsername: string,
  notebook: NotebookItem,
  file?: NotebookFile
): Promise<ChatInvite> {
  const fromKey = userKey(inviterUsername);
  const toKey = userKey(inviteeUsername);

  if (!fromKey || !toKey || fromKey === toKey) {
    throw new Error('You cannot invite yourself.');
  }

  const isDoc = !!file;
  const inviteType: 'notebook' | 'document' = isDoc ? 'document' : 'notebook';
  const targetId = isDoc ? `doc_${notebook.id}_${file.id}` : `nb_${notebook.id}`;
  const id = inviteDocId(targetId, inviterUsername, inviteeUsername);
  const title = isDoc ? `Document "${file.name}"` : `Notebook "${notebook.title}"`;

  // Prepare a copy of the notebook or single-file notebook for recipient
  const preparedNotebook: NotebookItem = isDoc
    ? {
        id: `shared_doc_${notebook.id}_${file.id}_${Date.now()}`,
        title: `${notebook.title} (${file.name})`,
        description: `Shared document from ${inviterUsername} (from folder "${notebook.title}")`,
        coverColor: notebook.coverColor,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        files: [file],
        tags: notebook.tags || [],
        type: 'folder',
        isShared: true,
        sharedBy: inviterUsername,
        sharedWith: [inviteeUsername],
        sharedAt: Date.now(),
      }
    : {
        ...notebook,
        isShared: true,
        sharedBy: inviterUsername,
        sharedWith: [inviteeUsername],
        sharedAt: Date.now(),
        updatedAt: Date.now(),
      };

  const invite: ChatInvite = {
    id,
    chatId: targetId,
    chatTitle: title,
    fromUsername: inviterUsername,
    toUsername: inviteeUsername,
    status: 'pending',
    createdAt: Date.now(),
    type: inviteType,
    notebookId: notebook.id,
    notebookTitle: notebook.title,
    fileId: file?.id,
    fileName: file?.name,
    notebookData: preparedNotebook,
  };

  try {
    await writeInviteCopies(invite);
  } catch (err) {
    console.warn('Firestore notebook invite write warning:', err);
  }

  return invite;
}

export interface AcceptInviteResult {
  session?: ChatSession;
  notebook?: NotebookItem;
}

export async function acceptInvite(invite: ChatInvite): Promise<AcceptInviteResult> {
  if (invite.type === 'notebook' || invite.type === 'document') {
    let savedNb: NotebookItem | undefined;
    if (invite.notebookData) {
      savedNb = await saveSharedNotebookToUser(invite.toUsername, invite.notebookData);
    }
    if (invite.notebookId) {
      await markNotebookAsSharedWith(invite.fromUsername, invite.notebookId, invite.toUsername);
    }
    try {
      await deleteDoc(doc(incomingRef(invite.toUsername), invite.id));
      await deleteDoc(doc(sentRef(invite.fromUsername), invite.id));
    } catch (err) {
      console.warn('Could not clear accepted invite:', err);
    }
    return { notebook: savedNb || invite.notebookData };
  }

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

  return { session };
}

export async function acceptChatInvite(invite: ChatInvite): Promise<ChatSession> {
  const result = await acceptInvite(invite);
  return result.session!;
}

export async function declineChatInvite(invite: ChatInvite): Promise<void> {
  try {
    await deleteDoc(doc(incomingRef(invite.toUsername), invite.id));
    await deleteDoc(doc(sentRef(invite.fromUsername), invite.id));
  } catch (err) {
    console.warn('Could not decline invite:', err);
  }
}
