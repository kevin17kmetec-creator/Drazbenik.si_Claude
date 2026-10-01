import { initializeApp, getApps, cert, App, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';
import type { Auth } from 'firebase-admin/auth';

let adminApp: App | null = null;
let adminDbInstance: Firestore | null = null;
let adminStorageInstance: Storage | null = null;
let adminAuthInstance: Auth | null = null;

function getServiceAccountCredentials(): any | null {
  const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saEnv) return null;

  if (typeof saEnv === 'object') {
    return saEnv;
  }

  if (typeof saEnv === 'string') {
    const trimmed = saEnv.trim();
    // Check if direct JSON string
    if (trimmed.startsWith('{')) {
      try {
        return JSON.parse(trimmed);
      } catch (e: any) {
        console.error('[Firebase Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e.message);
      }
    }

    // Check if base64 encoded JSON
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      if (decoded.trim().startsWith('{')) {
        return JSON.parse(decoded);
      }
    } catch (e: any) {
      // Not base64
    }
  }

  return null;
}

export function getAdminApp(): App {
  if (adminApp) return adminApp;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
    return adminApp;
  }

  const defaultBucket = process.env.FIREBASE_STORAGE_BUCKET || 'drazbesi.firebasestorage.app';
  const credentials = getServiceAccountCredentials();

  try {
    if (credentials) {
      adminApp = initializeApp({
        credential: cert(credentials),
        storageBucket: defaultBucket,
        projectId: credentials.project_id || 'drazbesi'
      });
      console.log('[Firebase Admin] Initialized with service account for project:', credentials.project_id || 'drazbesi');
    } else {
      adminApp = initializeApp({
        credential: applicationDefault(),
        storageBucket: defaultBucket,
        projectId: process.env.FIREBASE_PROJECT_ID || 'drazbesi'
      });
      console.log('[Firebase Admin] Initialized with application default credentials');
    }
  } catch (error: any) {
    console.error('[Firebase Admin] Initialization error:', error.message);
    // Fallback minimal initialization if not already initialized
    if (!getApps().length) {
      adminApp = initializeApp({
        storageBucket: defaultBucket,
        projectId: 'drazbesi'
      });
    } else {
      adminApp = getApps()[0];
    }
  }

  return adminApp;
}

export function getAdminDb(): Firestore {
  if (adminDbInstance) return adminDbInstance;
  const app = getAdminApp();
  adminDbInstance = getFirestore(app);
  return adminDbInstance;
}

export function getAdminStorage(): Storage {
  if (adminStorageInstance) return adminStorageInstance;
  const app = getAdminApp();
  adminStorageInstance = getStorage(app);
  return adminStorageInstance;
}

export function getAdminAuth(): Auth {
  if (adminAuthInstance) return adminAuthInstance;
  const app = getAdminApp();
  // Lazy require firebase-admin/auth so it does not run during module startup
  const { getAuth: getFirebaseAuth } = require('firebase-admin/auth');
  adminAuthInstance = getFirebaseAuth(app);
  return adminAuthInstance!;
}

// Lazy-initialized getters/proxies for db, storage, and auth
export const adminDb = new Proxy({} as Firestore, {
  get(_target, prop) {
    const firestore = getAdminDb();
    const val = (firestore as any)[prop];
    if (typeof val === 'function') {
      return val.bind(firestore);
    }
    return val;
  }
});

export const adminStorage = new Proxy({} as Storage, {
  get(_target, prop) {
    const storage = getAdminStorage();
    const val = (storage as any)[prop];
    if (typeof val === 'function') {
      return val.bind(storage);
    }
    return val;
  }
});

export const adminAuth = new Proxy({} as Auth, {
  get(_target, prop) {
    const auth = getAdminAuth();
    const val = (auth as any)[prop];
    if (typeof val === 'function') {
      return val.bind(auth);
    }
    return val;
  }
});

export function getAuth(_app?: any): Auth {
  return getAdminAuth();
}

// Alias db to adminDb for seamless drop-in
export const db = adminDb;
export { FieldValue };

/**
 * Uploads a Buffer (such as a generated PDF invoice) to Firebase Storage using the Admin SDK
 * and returns a accessible storage URL.
 */
export async function uploadBufferToStorage(
  buffer: Buffer,
  destinationPath: string,
  contentType: string = 'application/pdf'
): Promise<string> {
  try {
    const storage = getAdminStorage();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'drazbesi.firebasestorage.app';
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(destinationPath);

    await file.save(buffer, {
      metadata: {
        contentType,
        metadata: {
          firebaseStorageDownloadTokens: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        }
      },
      resumable: false
    });

    try {
      await file.makePublic();
      return `https://storage.googleapis.com/${bucket.name}/${destinationPath}`;
    } catch (makePublicErr) {
      // If uniform bucket-level access is enabled, get a long-lived signed URL or standard public link
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: '2030-01-01'
      });
      return signedUrl;
    }
  } catch (error: any) {
    console.error(`[Firebase Admin Storage] Upload error for ${destinationPath}:`, error.message);
    // Fallback direct URL format
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'drazbesi.firebasestorage.app';
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(destinationPath)}?alt=media`;
  }
}

/**
 * Helper to safely check if a DocumentSnapshot exists in Admin SDK (where .exists is a boolean)
 * or client SDK (where .exists() was a function).
 */
export function isDocSnapshotExists(snap: any): boolean {
  if (!snap) return false;
  if (typeof snap.exists === 'function') return snap.exists();
  return Boolean(snap.exists);
}

/**
 * Helper to safely get data from a DocumentSnapshot
 */
export function getDocSnapshotData<T = any>(snap: any): T | null {
  if (!snap) return null;
  if (typeof snap.data === 'function') return snap.data() as T;
  return (snap.data || null) as T;
}
