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
import type { NotebookItem, NotebookFile, ShareSelection } from '../types/notebook';
import { saveSharedNotebookToUser, markNotebookAsSharedWith } from './notebookService';

export type InviteType = 'chat' | 'notebook' | 'document';

export interface ChatInvite {
  id: string;
  chatId?: string;
  chatTitle?: string;
  fromUsername: string;
  toUsername: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
  inviteType?: InviteType;
  notebookId?: string;
  notebookTitle?: string;
  notebookData?: NotebookItem;
  sharedFile?: NotebookFile;
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

/**
 * Sends a pending notebook or document share invite.
 */
export async function sendNotebookShareInvite(
  inviterUsername: string,
  inviteeUsername: string,
  selection: ShareSelection
): Promise<ChatInvite> {
  const fromKey = userKey(inviterUsername);
  const toKey = userKey(inviteeUsername);

  if (!fromKey || !toKey || fromKey === toKey) {
    throw new Error('You cannot share with yourself.');
  }

  const isDoc = selection.type === 'document' && Boolean(selection.file);
  const targetId = isDoc && selection.file ? selection.file.id : selection.notebook.id;
  const id = `share_${targetId}_${fromKey}_${toKey}`;

  const invite: ChatInvite = {
    id,
    fromUsername: inviterUsername,
    toUsername: inviteeUsername,
    status: 'pending',
    createdAt: Date.now(),
    inviteType: isDoc ? 'document' : 'notebook',
    notebookId: selection.notebook.id,
    notebookTitle: selection.notebook.title,
    notebookData: selection.notebook,
    sharedFile: isDoc ? selection.file : undefined,
    chatTitle: isDoc && selection.file
      ? `${selection.file.name} (Document)`
      : `${selection.notebook.title} (Notebook)`,
  };

  try {
    await writeInviteCopies(invite);
  } catch (err) {
    console.warn('Firestore share invite write warning:', err);
  }

  // Also mark in inviter's local notebook that it has been shared with invitee
  try {
    await markNotebookAsSharedWith(inviterUsername, selection.notebook.id, inviteeUsername);
  } catch (err) {
    console.warn('Could not mark notebook as shared:', err);
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

export interface AcceptedInviteResult {
  chatSession?: ChatSession;
  notebook?: NotebookItem;
}

export async function acceptChatInvite(
  invite: ChatInvite,
  currentUsername?: string
): Promise<AcceptedInviteResult> {
  const recipientUser = currentUsername || invite.toUsername;

  // 1. Notebook Invite
  if (invite.inviteType === 'notebook' && invite.notebookData) {
    const sharedNotebook: NotebookItem = {
      ...invite.notebookData,
      id: `nb_shared_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: `${invite.notebookData.title} (from ${invite.fromUsername})`,
      description: invite.notebookData.description || `Shared by ${invite.fromUsername}`,
      isShared: true,
      sharedBy: invite.fromUsername,
      sharedWith: [recipientUser],
      sharedAt: Date.now(),
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };
    await saveSharedNotebookToUser(recipientUser, sharedNotebook);

    try {
      await deleteDoc(doc(incomingRef(invite.toUsername), invite.id));
      await deleteDoc(doc(sentRef(invite.fromUsername), invite.id));
    } catch (err) {
      console.warn('Could not clear accepted notebook invite:', err);
    }

    return { notebook: sharedNotebook };
  }

  // 2. Document Invite (shares 1 PDF/document from a notebook)
  if (invite.inviteType === 'document' && invite.sharedFile) {
    const docName = invite.sharedFile.name.replace(/\.[^/.]+$/, '');
    const sharedNotebook: NotebookItem = {
      id: `nb_shared_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: `${docName} (from ${invite.fromUsername})`,
      description: `Document "${invite.sharedFile.name}" shared by ${invite.fromUsername} from ${invite.notebookTitle || 'Notebook'}`,
      coverColor: invite.notebookData?.coverColor || 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)',
      files: [invite.sharedFile],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: ['Shared', 'Document'],
      type: 'folder',
      isShared: true,
      sharedBy: invite.fromUsername,
      sharedWith: [recipientUser],
      sharedAt: Date.now(),
    };
    await saveSharedNotebookToUser(recipientUser, sharedNotebook);

    try {
      await deleteDoc(doc(incomingRef(invite.toUsername), invite.id));
      await deleteDoc(doc(sentRef(invite.fromUsername), invite.id));
    } catch (err) {
      console.warn('Could not clear accepted document invite:', err);
    }

    return { notebook: sharedNotebook };
  }

  // 3. Regular Chat Invite
  const session = await inviteUserToChat(invite.fromUsername, invite.toUsername, invite.chatId || '');
  if (!session) {
    throw new Error('Shared chat could not be opened. Ask your friend to send the invite again.');
  }

  try {
    await deleteDoc(doc(incomingRef(invite.toUsername), invite.id));
    await deleteDoc(doc(sentRef(invite.fromUsername), invite.id));
  } catch (err) {
    console.warn('Could not clear accepted invite:', err);
  }

  return { chatSession: session };
}

export async function declineChatInvite(invite: ChatInvite): Promise<void> {
  try {
    await deleteDoc(doc(incomingRef(invite.toUsername), invite.id));
    await deleteDoc(doc(sentRef(invite.fromUsername), invite.id));
  } catch (err) {
    console.warn('Could not decline invite:', err);
  }
}
