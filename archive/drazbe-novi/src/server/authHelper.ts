import { adminAuth } from '../lib/firebase-admin';
import type { Request } from 'express';

export class AuthenticationError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
  }
}

/**
 * Server-only authentication helper using Firebase Admin only:
 * adminAuth.verifyIdToken(firebaseBearerToken)
 *
 * Requirements:
 * - Reads Authorization: Bearer <Firebase ID token>.
 * - Rejects missing, malformed, expired, or invalid tokens with HTTP 401.
 * - Returns the verified Firebase UID.
 * - Does not accept user_id from the request body as authentication authority.
 * - Does not expose tokens, decoded claims, service-account credentials, or user data in logs.
 * - Does not use jwks-rsa, express-jwt, jose, or dynamic imports.
 */
export async function authenticateFirebaseUser(req: Request): Promise<string> {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    throw new AuthenticationError('Missing Authorization header');
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    throw new AuthenticationError('Malformed Authorization header');
  }

  const token = parts[1];

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    if (!decodedToken || !decodedToken.uid) {
      throw new AuthenticationError('Invalid token payload');
    }
    return decodedToken.uid;
  } catch (err: any) {
    // Strictly do not expose tokens, decoded claims, or credentials in logs
    console.warn('[AUTH] Authentication verification failed');
    throw new AuthenticationError('Invalid or expired token');
  }
}
