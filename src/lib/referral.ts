// Deutscher Kommentar: Clientseitige Hilfen fuer das Einladungsprogramm (Einladungscode merken, Geraete-ID, Registrierungsdaten ergaenzen)
const REF_KEY = 'dr_ref';
const DEVICE_KEY = 'dr_device_id';

function safeGet(key: string): string {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function safeSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Speicher blockiert */ }
}

// Deutscher Kommentar: Zufaellige, dauerhaft gespeicherte Geraete-ID (nur ein Hinweis; Server vergleicht gehashte Werte)
export function getDeviceId(): string {
  let id = safeGet(DEVICE_KEY);
  if (!id) {
    const bytes = new Uint8Array(16);
    try { crypto.getRandomValues(bytes); } catch { for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256); }
    id = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    safeSet(DEVICE_KEY, id);
  }
  return id;
}

// Deutscher Kommentar: Grober Browser-Fingerabdruck als Zusatzsignal gegen Mehrfachkonten auf demselben Geraet
export function getFingerprint(): string {
  try {
    const parts = [
      navigator.userAgent,
      navigator.language,
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      String(navigator.hardwareConcurrency || ''),
      String((navigator as any).deviceMemory || ''),
      navigator.platform || ''
    ];
    return parts.join('|');
  } catch {
    return '';
  }
}

// Deutscher Kommentar: Liest ?ref=CODE aus der URL und merkt ihn sich bis zur Registrierung
export function captureReferralFromUrl(): void {
  try {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const ref = (params.get('ref') || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (ref) safeSet(REF_KEY, ref);
  } catch { /* ignorieren */ }
}

export function getStoredReferral(): string {
  return safeGet(REF_KEY);
}

export function clearStoredReferral() {
  try { localStorage.removeItem(REF_KEY); } catch { /* ignorieren */ }
}

let installed = false;

// Deutscher Kommentar: Ergaenzt jede POST-Anfrage an /api/profile/init um Einladungscode, Geraete-ID und Fingerabdruck
export function installReferralInterceptor(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  try {
    const originalFetch = window.fetch.bind(window);
    const wrapped = async (input: any, init?: RequestInit): Promise<Response> => {
      try {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (url.includes('/api/profile/init') && init && String(init.method || 'GET').toUpperCase() === 'POST') {
          let body: any = {};
          if (typeof init.body === 'string' && init.body.trim()) {
            try { body = JSON.parse(init.body); } catch { body = null; }
          }
          if (body && typeof body === 'object') {
            const ref = getStoredReferral();
            if (ref && !body.referral_code) body.referral_code = ref;
            body.device_id = getDeviceId();
            body.fingerprint = getFingerprint();
            init = { ...init, body: JSON.stringify(body) };
          }
        }
      } catch { /* Anfrage unveraendert senden */ }
      const response = await originalFetch(input, init);
      try {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (response.ok && url.includes('/api/profile/init') && init && String(init.method || '').toUpperCase() === 'POST' && getStoredReferral()) {
          // Deutscher Kommentar: Erst nach erfolgreicher Registrierung wird der Code vergessen (Anmeldungen ohne neues Konto behalten ihn nicht noetig)
          const sent = typeof init.body === 'string' ? JSON.parse(init.body) : {};
          if (sent && sent.accepted_terms === true) clearStoredReferral();
        }
      } catch { /* ignorieren */ }
      return response;
    };
    try {
      Object.defineProperty(window, 'fetch', { value: wrapped, writable: true, configurable: true, enumerable: true });
    } catch {
      (window as any).fetch = wrapped;
    }
  } catch (e) {
    console.warn('[referral] interceptor init failed:', e);
  }
}
