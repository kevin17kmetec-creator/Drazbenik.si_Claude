'use client';

interface ActionResponse<T = any> {
  success: boolean;
  score?: number;
  data?: T;
  error?: string;
}

function getBaseUrl(): string {
  if (typeof window !== 'undefined') return '';
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL || 'http://localhost:3000';
}

export async function verifyCaptchaAction(token: string, action: string = 'login'): Promise<ActionResponse> {
  try {
    const response = await fetch('/api/auth/verify-captcha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action })
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      return { success: false, error: data.error || 'Preverjanje varnosti reCAPTCHA ni uspelo.' };
    }
    return { success: true, score: data.score, data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Napaka pri preverjanju varnosti reCAPTCHA.' };
  }
}
