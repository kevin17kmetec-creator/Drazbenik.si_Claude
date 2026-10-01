import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAIBpZLRkpmgUION6mLrz5Us04Sk4LRrso",
  authDomain: "drazbesi.firebaseapp.com",
  projectId: "drazbesi",
  storageBucket: "drazbesi.firebasestorage.app",
  messagingSenderId: "922499036814",
  appId: "1:922499036814:web:bf668f4bd612570265bbdf"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
// Fixed default production database mapping
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);

// Listener cleanup registry to prevent AbortError upon signOut
type UnsubscribeFn = () => void;
const activeListeners = new Set<UnsubscribeFn>();

export function registerSnapshotListener(unsubscribe: UnsubscribeFn): UnsubscribeFn {
  activeListeners.add(unsubscribe);
  return () => {
    activeListeners.delete(unsubscribe);
    try {
      unsubscribe();
    } catch {
      // ignore
    }
  };
}

export function cleanupAllListeners(): void {
  activeListeners.forEach((unsub) => {
    try {
      unsub();
    } catch (e) {
      console.warn("Error unsubscribing listener before signOut:", e);
    }
  });
  activeListeners.clear();
}

export async function safeSignOut(authInstance = auth): Promise<void> {
  cleanupAllListeners();
  return signOut(authInstance);
}

// Global flag to coordinate registration lifecycle with App.tsx auth observer
let registeringAuth = false;
export function isRegisteringAuth(): boolean {
  return registeringAuth;
}
export function setRegisteringAuth(val: boolean): void {
  registeringAuth = val;
}
