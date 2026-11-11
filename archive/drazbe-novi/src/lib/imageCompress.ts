// Deutscher Kommentar: browser-image-compression laedt sein Worker-Skript standardmaessig von cdn.jsdelivr.net (Drittanbieter, IP-Weitergabe, CSP-Problem).
// Wir liefern die Datei selbst aus (public/vendor/browser-image-compression.js) - bei einem Versions-Update des Pakets die Datei aus node_modules/browser-image-compression/dist/ neu kopieren.
import imageCompression from 'browser-image-compression';

type Options = Parameters<typeof imageCompression>[1];

export function compressImage(file: File, options: Options = {}): Promise<File> {
  const libURL = typeof window !== 'undefined' ? `${window.location.origin}/vendor/browser-image-compression.js` : undefined;
  return imageCompression(file, { ...(libURL ? { libURL } : {}), ...(options as any) });
}
