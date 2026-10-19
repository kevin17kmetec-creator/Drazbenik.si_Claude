// Installiert einmalig einen fetch-Wrapper, der TERMS_REQUIRED-Antworten meldet
let installed = false;
let lastDispatch = 0;

export function installTermsInterceptor(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  try {
    const originalFetch = window.fetch ? window.fetch.bind(window) : globalThis.fetch?.bind(globalThis);
    if (!originalFetch) return;

    const wrappedFetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const response = await originalFetch(...args);
      if (response && response.status === 403) {
        try {
          const data = await response.clone().json();
          if (data?.code === 'TERMS_REQUIRED' && Date.now() - lastDispatch > 3000) {
            lastDispatch = Date.now();
            window.dispatchEvent(new CustomEvent('terms-required'));
          }
        } catch {
          // Keine JSON-Antwort: ignorieren
        }
      }
      return response;
    };

    try {
      Object.defineProperty(window, 'fetch', {
        value: wrappedFetch,
        writable: true,
        configurable: true,
        enumerable: true
      });
    } catch {
      try {
        (window as any).fetch = wrappedFetch;
      } catch (assignErr) {
        console.warn('[termsInterceptor] Could not override window.fetch:', assignErr);
      }
    }
  } catch (err) {
    console.warn('[termsInterceptor] Initialization error:', err);
  }
}

