import { auth } from './firebase';

// Returns request headers that contain a fresh Firebase ID token when a user is signed in.
export async function getAuthHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {
    // Continue without a token; the server will answer 401.
  }
  return headers;
}
