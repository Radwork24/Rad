import { doc, getDoc, setDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export interface UserProfile {
  username: string;
  stream: string;
  branch: string;
  createdAt: number;
}

interface StoredUserRecord extends UserProfile {
  password: string;
}

const LOCAL_USERS_KEY = 'rad_local_users_db';

// Helper to get local fallback users
function getLocalUsers(): Record<string, StoredUserRecord> {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('Could not read local users cache:', e);
    return {};
  }
}

// Helper to save local fallback users
function saveLocalUsers(users: Record<string, StoredUserRecord>) {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch (e) {
    console.warn('Could not save local users cache:', e);
  }
}

/**
 * Registers a new user in Firebase Firestore (and local cache).
 * Stores username, password, stream, and branch.
 */
export async function registerUser(
  usernameRaw: string,
  passwordRaw: string,
  streamRaw: string,
  branchRaw: string
): Promise<UserProfile> {
  const username = usernameRaw.trim();
  const password = passwordRaw.trim();
  const stream = streamRaw.trim();
  const branch = branchRaw.trim();

  const userKey = username.toLowerCase();
  const now = Date.now();

  const profile: UserProfile = {
    username,
    stream,
    branch,
    createdAt: now,
  };

  const record: StoredUserRecord = {
    ...profile,
    password,
  };

  // 1. Check if user exists in local cache first
  const localUsers = getLocalUsers();
  if (localUsers[userKey]) {
    throw new Error(`Username "${username}" already exists. Please log in or choose a different username.`);
  }

  // 2. Check and persist to Firebase Firestore
  try {
    const userDocRef = doc(db, 'users', userKey);
    const docSnap = await getDoc(userDocRef);

    if (docSnap.exists()) {
      throw new Error(`Username "${username}" already exists in Firebase. Please log in.`);
    }

    // Save user profile & credentials to Firestore
    await setDoc(userDocRef, record);
  } catch (err: any) {
    // If it's the duplicate username error we just threw, rethrow it
    if (err.message && err.message.includes('already exists')) {
      throw err;
    }
    console.warn('Firebase user write notice (saved to local backup):', err?.message);
  }

  // Save to local cache
  localUsers[userKey] = record;
  saveLocalUsers(localUsers);

  return profile;
}

/**
 * Authenticates user credentials against Firebase Firestore (or local cache).
 */
export async function authenticateUser(
  usernameRaw: string,
  passwordRaw: string
): Promise<UserProfile> {
  const username = usernameRaw.trim();
  const password = passwordRaw.trim();
  const userKey = username.toLowerCase();

  // 1. Try reading from Firebase Firestore first
  try {
    const userDocRef = doc(db, 'users', userKey);
    const docSnap = await getDoc(userDocRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as StoredUserRecord;
      if (data.password !== password) {
        throw new Error('Incorrect password. Please try again.');
      }

      // Update local cache
      const localUsers = getLocalUsers();
      localUsers[userKey] = data;
      saveLocalUsers(localUsers);

      return {
        username: data.username,
        stream: data.stream || '',
        branch: data.branch || '',
        createdAt: data.createdAt || Date.now(),
      };
    }
  } catch (err: any) {
    // If it's wrong password, rethrow immediately
    if (err.message && err.message.includes('Incorrect password')) {
      throw err;
    }
    console.warn('Firebase query fallback to local cache:', err?.message);
  }

  // 2. Check local users cache
  const localUsers = getLocalUsers();
  const userRecord = localUsers[userKey];

  if (!userRecord) {
    throw new Error(`User "${username}" not found. Please check your username or sign up.`);
  }

  if (userRecord.password !== password) {
    throw new Error('Incorrect password. Please try again.');
  }

  // Auto-sync this account to Firestore now that database connection is active
  try {
    const userDocRef = doc(db, 'users', userKey);
    await setDoc(userDocRef, userRecord, { merge: true });
    console.log(`Auto-synced user "${username}" to Firestore`);
  } catch (err) {
    console.warn('Sync user to Firestore warning:', err);
  }

  return {
    username: userRecord.username,
    stream: userRecord.stream || '',
    branch: userRecord.branch || '',
    createdAt: userRecord.createdAt || Date.now(),
  };
}

/**
 * Syncs any locally registered users to Firestore database.
 */
export async function syncPendingLocalUsersToFirestore(): Promise<void> {
  try {
    const localUsers = getLocalUsers();
    for (const [key, user] of Object.entries(localUsers)) {
      try {
        const userDocRef = doc(db, 'users', key);
        await setDoc(userDocRef, user, { merge: true });
        console.log(`Synced pending user "${user.username}" to Firestore`);
      } catch (e) {
        console.warn(`Failed to sync user ${key} to Firestore:`, e);
      }
    }
  } catch (err) {
    console.warn('Failed to run user sync:', err);
  }
}

/**
 * Real-time listener for all signed users from Firebase Firestore.
 */
export function subscribeToAllUsers(
  onUpdate: (users: UserProfile[]) => void
): () => void {
  try {
    const usersCol = collection(db, 'users');
    const unsubscribe = onSnapshot(
      usersCol,
      (snapshot) => {
        const users: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          users.push({
            username: data.username || docSnap.id,
            stream: data.stream || '',
            branch: data.branch || '',
            createdAt: data.createdAt || 0,
          });
        });

        // Sort newest first
        users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        // Merge any local users not yet registered in Firestore
        const local = getLocalUsers();
        for (const [key, val] of Object.entries(local)) {
          if (!users.some((u) => u.username.toLowerCase() === key.toLowerCase())) {
            users.push({
              username: val.username,
              stream: val.stream || '',
              branch: val.branch || '',
              createdAt: val.createdAt || 0,
            });
          }
        }

        onUpdate(users);
      },
      (error) => {
        console.warn('Firestore users subscription notice:', error.message);
        const local = getLocalUsers();
        const fallback = Object.values(local).map((u) => ({
          username: u.username,
          stream: u.stream || '',
          branch: u.branch || '',
          createdAt: u.createdAt || 0,
        }));
        onUpdate(fallback);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('Failed to subscribe to users:', err);
    const local = getLocalUsers();
    const fallback = Object.values(local).map((u) => ({
      username: u.username,
      stream: u.stream || '',
      branch: u.branch || '',
      createdAt: u.createdAt || 0,
    }));
    onUpdate(fallback);
    return () => {};
  }
}
