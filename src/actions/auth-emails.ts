'use server';

interface ActionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  fallbackToClient?: boolean;
}

function getBaseUrl(): string {
  if (typeof window !== 'undefined') return '';
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL || 'http://localhost:3000';
}

async function safeAuthApiCall<T = any>(endpoint: string, payload: any): Promise<ActionResponse<T>> {
  try {
    const fullUrl = endpoint.startsWith('http') ? endpoint : `${getBaseUrl()}${endpoint}`;
    
    // Poskusi dodati auth token ce obstaja
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (typeof window !== 'undefined') {
      try {
        const { auth } = await import('../lib/firebase');
        const token = await auth.currentUser?.getIdToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch (e) {}
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    let res: Response;
    try {
      res = await fetch(fullUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.success === false) {
      let errorMsg = data.error || data.message || `Napaka strežnika (${res.status})`;
      return { success: false, error: errorMsg, data };
    }

    return { success: true, data };
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError';
    const msg = isTimeout 
      ? 'Strežnik za pošiljanje e-pošte se ni pravočasno odzval. Preverite povezavo ali poskusite ponovno.' 
      : (err?.message || 'Napaka pri povezavi s strežnikom.');
    return { success: false, error: msg };
  }
}

export async function sendEmailVerificationAction(email: string, displayName?: string, userId?: string) {
  return safeAuthApiCall('/api/auth/send-verification', { email, displayName, userId });
}

export async function confirmEmailAction(token: string, email?: string) {
  return safeAuthApiCall('/api/auth/confirm-email', { token, email });
}

export async function sendPasswordResetAction(email: string) {
  return safeAuthApiCall('/api/auth/send-password-reset', { email });
}

export async function sendEmailChangedNotificationAction(email: string) {
  return safeAuthApiCall('/api/auth/send-email-changed', { email });
}


export async function sendMfaEnrollmentNotificationAction(email: string) {
  return safeAuthApiCall('/api/auth/send-mfa-enrollment', { email });
}
