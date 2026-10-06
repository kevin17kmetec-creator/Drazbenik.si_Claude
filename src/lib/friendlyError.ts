/**
 * Maps technical errors (Firebase auth codes, network/technical exceptions)
 * to clean, user-friendly Slovenian error messages.
 */
export function friendlyError(err: any, fallback: string): string {
  // 1. Firebase Auth error codes
  if (typeof err?.code === 'string' && err.code.startsWith('auth/')) {
    switch (err.code) {
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
        return 'Prijavni podatki niso pravilni.';
      case 'auth/email-already-in-use':
        return 'Ta e-poštni naslov je že registriran.';
      case 'auth/weak-password':
        return 'Geslo je prešibko.';
      case 'auth/too-many-requests':
        return 'Preveč poskusov. Poskusite znova čez nekaj minut.';
      case 'auth/network-request-failed':
        return 'Ni povezave z internetom. Poskusite znova.';
      case 'auth/requires-recent-login':
        return 'Zaradi varnosti se ponovno prijavite in poskusite znova.';
      default:
        return fallback;
    }
  }

  // 2. Extract error message
  const rawMessage = typeof err?.message === 'string' ? err.message.trim() : '';

  // 3. Fallback on empty message or technical patterns
  const technicalRegex = /(failed to fetch|networkerror|unexpected token|firebase|firestore|permission|insufficient|typeerror|undefined|\bnull\b|json|stripe|gemini|\.js:\d+|^\{)/i;
  if (!rawMessage || technicalRegex.test(rawMessage)) {
    return fallback;
  }

  // 4. Return server-provided or validated clean message
  return rawMessage;
}
