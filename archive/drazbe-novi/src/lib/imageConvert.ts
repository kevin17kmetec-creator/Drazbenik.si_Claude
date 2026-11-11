// Deutscher Kommentar: iPhone-Fotos (HEIC/HEIF) in JPEG umwandeln, damit Browser, Komprimierung und Storage-Regeln sie akzeptieren.
// Reihenfolge: 1) nativ dekodieren (Safari kann HEIC), 2) sonst libheif (WebAssembly, wird erst bei Bedarf nachgeladen).

export const MAX_HEIC_INPUT_BYTES = 25 * 1024 * 1024;

export function isHeicFile(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  const n = (file.name || '').toLowerCase();
  return t === 'image/heic' || t === 'image/heif' || t === 'image/heic-sequence' || t === 'image/heif-sequence' || n.endsWith('.heic') || n.endsWith('.heif');
}

async function decodeNatively(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.9));
  } catch {
    return null;
  }
}

// Deutscher Kommentar: Fallback-Dekoder (libheif als WebAssembly, wird erst bei Bedarf nachgeladen). Braucht in der CSP nur 'wasm-unsafe-eval', kein 'unsafe-eval'.
async function decodeWithLibheif(file: File): Promise<Blob> {
  // @ts-ignore - das Paket liefert keine Typen fuer den gebuendelten Einstiegspunkt
  const mod: any = await import('libheif-js/wasm-bundle');
  const factory: any = mod.default ?? mod;
  const lib: any = typeof factory === 'function' ? await factory() : factory;
  const decoder = new lib.HeifDecoder();
  const images = decoder.decode(new Uint8Array(await file.arrayBuffer()));
  const img = images && images[0];
  if (!img) throw new Error('HEIC decode failed');
  const w = img.get_width();
  const h = img.get_height();
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  const imageData = ctx.createImageData(w, h);
  await new Promise<void>((resolve, reject) => img.display(imageData, (d: any) => (d ? resolve() : reject(new Error('HEIC display failed')))));
  ctx.putImageData(imageData, 0, 0);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.9));
  if (!blob) throw new Error('JPEG encode failed');
  return blob;
}

// Gibt fuer HEIC/HEIF eine JPEG-Datei zurueck, alle anderen Dateien unveraendert.
export async function normalizeImageFile(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;
  const newName = (file.name || 'foto').replace(/\.[^/.]+$/, '') + '.jpg';
  const blob = (await decodeNatively(file)) || (await decodeWithLibheif(file));
  return new File([blob], newName, { type: 'image/jpeg' });
}
