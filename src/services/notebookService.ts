import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  getDoc,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage } from '../firebase';
import type { NotebookItem, NotebookFile, NotebookFileType } from '../types/notebook';
import { storeFileBlob, removeFileBlob } from './fileStore';

// Local storage key helper
function getStorageKey(userId: string): string {
  return `rad_user_notebooks_${userId.toLowerCase().trim()}`;
}

// Local storage fallback helpers
export function getLocalNotebooks(userId: string): NotebookItem[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((nb) => ({
          ...nb,
          files: Array.isArray(nb.files) ? nb.files : [],
        }))
      : [];
  } catch (e) {
    console.warn(`Failed reading local notebooks for ${userId}:`, e);
    return [];
  }
}

export function saveLocalNotebooks(userId: string, notebooks: NotebookItem[]) {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(notebooks));
  } catch (e) {
    console.warn(`Failed saving local notebooks for ${userId}:`, e);
  }
}

/**
 * Real-time subscription to user's notebooks in Firebase Firestore:
 * Path: users/{userId}/notebooks
 */
export function subscribeToNotebooks(
  userId: string,
  onUpdate: (notebooks: NotebookItem[]) => void
): () => void {
  if (!userId) {
    onUpdate([]);
    return () => {};
  }

  const userKey = userId.toLowerCase().trim();
  let isFirestoreActive = false;

  try {
    const notebooksCol = collection(db, 'users', userKey, 'notebooks');
    const q = query(notebooksCol, orderBy('updatedAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        isFirestoreActive = true;
        const list: NotebookItem[] = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            title: data.title || 'Untitled Notebook',
            description: data.description || '',
            coverColor: data.coverColor || 'linear-gradient(180deg, #d97757 0%, #b85d3f 100%)',
            createdAt: data.createdAt || Date.now(),
            updatedAt: data.updatedAt || Date.now(),
            files: Array.isArray(data.files) ? data.files : [],
            tags: Array.isArray(data.tags) ? data.tags : [],
            type: data.type || 'folder',
          });
        });

        // If Firestore collection is empty, check if user had local notebooks to backfill to Firestore
        if (list.length === 0) {
          const cached = getLocalNotebooks(userId);
          if (cached.length > 0) {
            cached.forEach(async (nb) => {
              try {
                await setDoc(doc(db, 'users', userKey, 'notebooks', nb.id), {
                  id: nb.id,
                  title: nb.title,
                  description: nb.description || '',
                  coverColor: nb.coverColor,
                  createdAt: nb.createdAt || Date.now(),
                  updatedAt: nb.updatedAt || Date.now(),
                  files: Array.isArray(nb.files) ? nb.files : [],
                  tags: nb.tags || [],
                });
              } catch (err) {
                console.warn('Could not backfill notebook to Firestore:', err);
              }
            });
            onUpdate(cached);
            return;
          }
        }

        saveLocalNotebooks(userId, list);
        onUpdate(list);
      },
      (error) => {
        console.warn(`Firestore notebooks subscription notice for ${userId}:`, error.message);
        if (!isFirestoreActive) {
          onUpdate(getLocalNotebooks(userId));
        }
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn(`Failed to subscribe to notebooks for ${userId}:`, err);
    onUpdate(getLocalNotebooks(userId));
    return () => {};
  }
}

/**
 * Creates a new notebook folder in Firebase Firestore for the user.
 */
export async function createNotebook(
  userId: string,
  title: string,
  description: string = '',
  coverColor: string = 'linear-gradient(180deg, #d97757 0%, #b85d3f 100%)'
): Promise<NotebookItem> {
  const userKey = userId.toLowerCase().trim();
  const id = 'nb_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const now = Date.now();

  const newNotebook: NotebookItem = {
    id,
    title: title.trim(),
    description: description.trim(),
    coverColor,
    createdAt: now,
    updatedAt: now,
    files: [],
    tags: ['Notebook', 'Study Folder'],
    type: 'folder',
  };

  // Optimistic update locally
  const current = getLocalNotebooks(userId);
  saveLocalNotebooks(userId, [newNotebook, ...current]);

  try {
    const notebookDocRef = doc(db, 'users', userKey, 'notebooks', id);
    await setDoc(notebookDocRef, {
      id: newNotebook.id,
      title: newNotebook.title,
      description: newNotebook.description,
      coverColor: newNotebook.coverColor,
      createdAt: newNotebook.createdAt,
      updatedAt: newNotebook.updatedAt,
      files: [],
      tags: newNotebook.tags,
      type: 'folder',
    });
  } catch (err) {
    console.warn('Firestore notebook write notice (cached locally):', err);
  }

  return newNotebook;
}

/**
 * Deletes a notebook folder and its files from Firebase.
 */
export async function deleteNotebook(userId: string, notebookId: string): Promise<void> {
  const userKey = userId.toLowerCase().trim();

  // Optimistic local update
  const current = getLocalNotebooks(userId);
  saveLocalNotebooks(userId, current.filter((nb) => nb.id !== notebookId));

  try {
    const notebookDocRef = doc(db, 'users', userKey, 'notebooks', notebookId);
    await deleteDoc(notebookDocRef);
  } catch (err) {
    console.warn('Firestore notebook delete notice:', err);
  }
}

/**
 * Uploads a document (PDF, PPT, PPTX) to Firebase Storage and updates the notebook in Firestore.
 */
export async function uploadFileToNotebook(
  userId: string,
  notebookId: string,
  file: File
): Promise<NotebookFile> {
  const userKey = userId.toLowerCase().trim();
  const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  let fileType: NotebookFileType = 'other';
  let pageEstimate = 'Document';

  if (ext === 'pdf') {
    fileType = 'pdf';
    pageEstimate = `${Math.max(4, Math.floor(file.size / (1024 * 70)) || 12)} pages`;
  } else if (ext === 'ppt' || ext === 'pptx') {
    fileType = 'ppt';
    pageEstimate = `${Math.max(6, Math.floor(file.size / (1024 * 120)) || 18)} slides`;
  } else if (ext === 'doc' || ext === 'docx') {
    fileType = 'doc';
    pageEstimate = 'Doc';
  } else if (ext === 'txt') {
    fileType = 'txt';
    pageEstimate = 'Text Notes';
  }

  const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
  const formattedSize = `${sizeMb} MB`;

  let downloadUrl: string | undefined = undefined;
  let sPath: string | undefined = undefined;

  // Attempt Firebase Storage direct upload
  try {
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    sPath = `users/${userKey}/notebooks/${notebookId}/${Date.now()}_${safeFileName}`;
    const fileRef = storageRef(storage, sPath);
    const uploadResult = await uploadBytes(fileRef, file, {
      contentType: file.type || 'application/octet-stream',
    });
    downloadUrl = await getDownloadURL(uploadResult.ref);
  } catch (storageErr) {
    console.warn('Firebase Storage upload notice (proceeding with metadata in Firestore):', storageErr);
  }

  // Cache file blob locally in IndexedDB for instant, offline in-app viewing
  try {
    await storeFileBlob(fileId, file);
  } catch (blobErr) {
    console.warn('Could not store blob in IndexedDB:', blobErr);
  }

  const notebookFile: NotebookFile = {
    id: fileId,
    name: file.name,
    size: formattedSize,
    sizeBytes: file.size,
    type: fileType,
    uploadedAt: Date.now(),
    pageCount: pageEstimate,
    downloadUrl,
    storagePath: sPath,
    summary: `${file.name} uploaded to study notebook.`,
  };

  // Update local cache
  const cached = getLocalNotebooks(userId);
  const updatedList = cached.map((nb) => {
    if (nb.id === notebookId) {
      const currentFiles = Array.isArray(nb.files) ? nb.files : [];
      return {
        ...nb,
        updatedAt: Date.now(),
        files: [notebookFile, ...currentFiles],
      };
    }
    return nb;
  });
  saveLocalNotebooks(userId, updatedList);

  // Update Firestore document
  try {
    const notebookDocRef = doc(db, 'users', userKey, 'notebooks', notebookId);
    const snap = await getDoc(notebookDocRef);
    if (snap.exists()) {
      const data = snap.data();
      const existingFiles = Array.isArray(data.files) ? data.files : [];
      await updateDoc(notebookDocRef, {
        files: [notebookFile, ...existingFiles],
        updatedAt: Date.now(),
      });
    } else {
      // If doc didn't exist in Firestore yet, write whole notebook
      const target = updatedList.find((nb) => nb.id === notebookId);
      if (target) {
        await setDoc(notebookDocRef, {
          ...target,
          files: target.files,
        });
      }
    }
  } catch (firestoreErr) {
    console.warn('Firestore notebook file update notice:', firestoreErr);
  }

  return notebookFile;
}

/**
 * Deletes a file from a notebook in Firebase.
 */
export async function deleteFileFromNotebook(
  userId: string,
  notebookId: string,
  fileId: string
): Promise<void> {
  const userKey = userId.toLowerCase().trim();

  // Update local cache
  const cached = getLocalNotebooks(userId);
  let storagePathToDelete: string | undefined = undefined;

  const updatedList = cached.map((nb) => {
    if (nb.id === notebookId) {
      const currentFiles = Array.isArray(nb.files) ? nb.files : [];
      const target = currentFiles.find((f) => f.id === fileId);
      if (target?.storagePath) {
        storagePathToDelete = target.storagePath;
      }
      return {
        ...nb,
        updatedAt: Date.now(),
        files: currentFiles.filter((f) => f.id !== fileId),
      };
    }
    return nb;
  });
  saveLocalNotebooks(userId, updatedList);

  // Update Firestore
  try {
    const notebookDocRef = doc(db, 'users', userKey, 'notebooks', notebookId);
    const snap = await getDoc(notebookDocRef);
    if (snap.exists()) {
      const data = snap.data();
      const existingFiles = Array.isArray(data.files) ? data.files : [];
      const filtered = existingFiles.filter((f: NotebookFile) => f.id !== fileId);
      await updateDoc(notebookDocRef, {
        files: filtered,
        updatedAt: Date.now(),
      });
    }
  } catch (err) {
    console.warn('Firestore file delete notice:', err);
  }

  // Delete from Storage if path exists
  if (storagePathToDelete) {
    try {
      const fileRef = storageRef(storage, storagePathToDelete);
      await deleteObject(fileRef);
    } catch (storageErr) {
      console.warn('Firebase Storage delete file notice:', storageErr);
    }
  }

  // Remove local cached blob
  try {
    await removeFileBlob(fileId);
  } catch (err) {
    console.warn('IndexedDB remove blob notice:', err);
  }
}
