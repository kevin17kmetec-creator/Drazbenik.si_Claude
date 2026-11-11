// Deutscher Kommentar: Eine einzige Content-Security-Policy fuer die ganze Seite. Der gleiche String steht in vercel.json (Header fuer statische Dateien);
// ein Test stellt sicher, dass beide identisch bleiben. Bewusst OHNE 'unsafe-inline' und 'unsafe-eval' bei Skripten.
export const CSP_DIRECTIVES: string[] = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://js.stripe.com https://*.js.stripe.com https://connect-js.stripe.com https://checkout.stripe.com https://www.google.com https://www.gstatic.com https://apis.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://firebasestorage.googleapis.com https://storage.googleapis.com https://*.stripe.com https://*.googleusercontent.com https://www.gstatic.com https://www.google.com",
  "font-src 'self' data:",
  "connect-src 'self' blob: data: https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://api.stripe.com https://*.stripe.com https://checkout.stripe.com https://www.google.com",
  "frame-src 'self' https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://connect-js.stripe.com https://checkout.stripe.com https://verify.stripe.com https://*.firebaseapp.com https://www.google.com https://accounts.google.com",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
  "report-uri /api/csp-report"
];
export const CSP_HEADER = CSP_DIRECTIVES.join('; ');
