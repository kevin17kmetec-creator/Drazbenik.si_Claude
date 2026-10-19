import { loadConnectAndInitialize } from '@stripe/connect-js';
import { getAuthHeaders } from './authFetch';

// Kommentar auf Deutsch: Instanzen pro Anwendungsbereich (onboarding oder manage)
const instances: { onboarding?: any; manage?: any } = {};

// Kommentar auf Deutsch: Sprache des eingebetteten Zahlungs-Widgets (folgt der Sprache der Webseite)
const LOCALES: Record<string, string> = { SLO: 'sl-SI', EN: 'en-US', DE: 'de-DE' };
let currentLocale = 'sl-SI';

export function setStripeConnectLanguage(lang: string) {
  currentLocale = LOCALES[String(lang || '').toUpperCase()] || 'sl-SI';
  for (const key of Object.keys(instances) as Array<'onboarding' | 'manage'>) {
    try {
      instances[key]?.update?.({ locale: currentLocale });
    } catch (e) {
      // Kommentar auf Deutsch: Aktualisierung ist optional
    }
  }
}

export function getStripeConnectInstance(scope: 'onboarding' | 'manage') {
  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
  if (!publishableKey || !publishableKey.startsWith('pk_')) {
    return null;
  }

  if (instances[scope]) {
    return instances[scope];
  }

  // Kommentar auf Deutsch: Initialisiert eine Instanz für den angegebenen Bereich
  instances[scope] = loadConnectAndInitialize({
    publishableKey: publishableKey,
    fetchClientSecret: async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/stripe-account-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          body: JSON.stringify({ scope })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const msg = errData.error || 'Fehler beim Erstellen der Account-Session';
          const e: any = new Error(msg);
          e.code = errData.code;
          
          // Kommentar auf Deutsch: Fehlerereignis für die UI auslösen
          window.dispatchEvent(new CustomEvent('connect-fetch-error', { 
            detail: { scope, code: e.code, message: msg } 
          }));
          throw e;
        }

        const data = await res.json();
        return data.client_secret;
      } catch (err: any) {
        console.error("Error in fetchClientSecret:", err);
        throw err;
      }
    },
    locale: currentLocale,
    appearance: {
      variables: {
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        colorPrimary: '#0A1128',
        buttonPrimaryColorBackground: '#0A1128',
        buttonPrimaryColorText: '#FFFFFF',
        borderRadius: '16px'
      }
    }
  });

  return instances[scope];
}

export async function resetStripeConnectInstance(scope: 'onboarding' | 'manage') {
  if (instances[scope]) {
    try {
      await instances[scope].logout();
    } catch (e) {
      console.warn(`Error during Stripe Connect logout for ${scope}:`, e);
    }
    instances[scope] = null;
  }
}

export async function logoutStripeConnect() {
  await resetStripeConnectInstance('onboarding');
  await resetStripeConnectInstance('manage');
}
