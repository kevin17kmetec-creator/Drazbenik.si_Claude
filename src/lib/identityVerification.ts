import { loadStripe } from '@stripe/stripe-js';
import { getAuthHeaders } from './authFetch';

export interface AmlStatus {
  verified: boolean;
  limitEur: number;
  paidEur: number;
  pendingEur: number;
  totalEur: number;
  exceeded: boolean;
  pending: { auctionId: string; title: string; totalEur: number }[];
}

// Deutscher Kommentar: Holt den Stand des Jahreslimits vom Server
export async function fetchAmlStatus(): Promise<AmlStatus | null> {
  try {
    const resp = await fetch('/api/aml-status', { headers: await getAuthHeaders() });
    if (!resp.ok) return null;
    return (await resp.json()) as AmlStatus;
  } catch {
    return null;
  }
}

export type IdentityResult = 'submitted' | 'cancelled' | 'error';

// Deutscher Kommentar: Startet die Stripe-Identity-Pruefung (Dokument + Selfie) in Stripes eigenem Fenster.
// Das Ergebnis setzt der Webhook identity.verification_session.verified auf dem Nutzerkonto.
export async function startIdentityVerification(): Promise<{ result: IdentityResult; message?: string }> {
  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
  if (!publishableKey || !publishableKey.startsWith('pk_')) {
    return { result: 'error', message: 'Stripe ni pravilno nastavljen (manjka javni ključ).' };
  }
  try {
    const resp = await fetch('/api/create-verification-session', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({}),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.clientSecret) {
      return { result: 'error', message: data.error || 'Verifikacije ni bilo mogoče začeti.' };
    }
    const stripe = await loadStripe(publishableKey);
    if (!stripe) return { result: 'error', message: 'Stripe ni na voljo.' };
    const { error } = await stripe.verifyIdentity(data.clientSecret);
    if (error) {
      // Deutscher Kommentar: Abbruch durch den Nutzer ist kein Fehler
      if (error.code === 'session_cancelled') return { result: 'cancelled' };
      return { result: 'error', message: error.message || 'Verifikacija ni uspela.' };
    }
    return { result: 'submitted' };
  } catch (e: any) {
    return { result: 'error', message: e?.message || 'Verifikacija ni uspela.' };
  }
}
