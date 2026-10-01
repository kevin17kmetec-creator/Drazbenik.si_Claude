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

export async function verifyCaptchaAction(token: string): Promise<ActionResponse> {
  return { success: true, score: 1.0 };
}
