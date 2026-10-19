import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Camera, SwitchCamera, Check, ImagePlus } from '../icons';
import { Portal } from './Portal';

interface CameraCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  // Deutscher Kommentar: Wird nach jedem Foto sofort aufgerufen, die Kamera bleibt offen
  onCapture: (file: File) => void;
  // Wie viele weitere Fotos noch erlaubt sind (Kamera sperrt den Ausloeser danach)
  remaining: number;
  // Optional: Wechsel zur Galerie, wenn die Kamera nicht verfuegbar ist
  onPickFromGallery?: () => void;
}

export const isCameraSupported = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';

// Deutscher Kommentar: Dauerhaft geoeffnete Live-Kamera - mehrere Fotos hintereinander ohne erneutes Oeffnen der Kamera-App
export const CameraCapture: React.FC<CameraCaptureProps> = ({ isOpen, onClose, onCapture, remaining, onPickFromGallery }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [flash, setFlash] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setError(null);
    setReady(false);
    (async () => {
      try {
        stopStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (e: any) {
        setError('Kamera ni na voljo. Dovolite dostop do kamere v brskalniku ali izberite slike iz galerije.');
      }
    })();
    return () => { cancelled = true; stopStream(); };
  }, [isOpen, facing, stopStream]);

  // Deutscher Kommentar: Beim Schliessen alte Vorschauen freigeben
  useEffect(() => {
    if (!isOpen) {
      setThumbs(prev => { prev.forEach(u => URL.revokeObjectURL(u)); return []; });
    }
  }, [isOpen]);

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !ready || remaining - thumbs.length <= 0) return;
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return;
    const scale = Math.min(1, 1600 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setThumbs(prev => [...prev, URL.createObjectURL(blob)]);
      setFlash(true);
      setTimeout(() => setFlash(false), 120);
      try { navigator.vibrate?.(30); } catch {}
      onCapture(file);
    }, 'image/jpeg', 0.9);
  };

  if (!isOpen) return null;
  const left = remaining - thumbs.length;

  return (
    <Portal>
      <div className="fixed inset-0 z-[400] bg-black flex flex-col" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between p-3 text-white">
          <button onClick={onClose} className="p-2 rounded-full bg-white/10" aria-label="Zapri"><X size={22} /></button>
          <p className="text-xs font-bold uppercase tracking-widest">{`Posneto: ${thumbs.length} · še ${Math.max(0, left)}`}</p>
          <button onClick={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))} className="p-2 rounded-full bg-white/10" aria-label="Zamenjaj kamero"><SwitchCamera size={22} /></button>
        </div>

        <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
          {error ? (
            <div className="text-center text-white px-8 space-y-4">
              <p className="text-sm font-bold">{error}</p>
              {onPickFromGallery && (
                <button onClick={() => { onClose(); onPickFromGallery(); }} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#FEBA4F] text-[#0A1128] text-xs font-black uppercase tracking-wider"><ImagePlus size={16} /> Izberi iz galerije</button>
              )}
            </div>
          ) : (
            <video ref={videoRef} playsInline muted autoPlay className="max-h-full max-w-full object-contain" />
          )}
          {flash && <div className="absolute inset-0 bg-white/70 pointer-events-none" />}
        </div>

        <div className="p-4 space-y-3 bg-black/80">
          {thumbs.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {thumbs.map((u, i) => <img key={u} src={u} alt={`Posnetek ${i + 1}`} className="h-14 w-14 object-cover rounded-lg border border-white/30 shrink-0" />)}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="w-24" />
            <button
              onClick={shoot}
              disabled={!ready || left <= 0}
              className="w-[72px] h-[72px] rounded-full border-4 border-white bg-white/20 flex items-center justify-center disabled:opacity-30 active:scale-95 transition"
              aria-label="Fotografiraj"
            >
              <Camera size={28} className="text-white" />
            </button>
            <button onClick={onClose} className="w-24 flex items-center justify-center gap-1 px-3 py-3 rounded-2xl bg-[#FEBA4F] text-[#0A1128] text-xs font-black uppercase tracking-wider"><Check size={16} /> Končano</button>
          </div>
          {left <= 0 && <p className="text-center text-[11px] font-bold text-white/70">Dosegli ste največje število slik.</p>}
        </div>
      </div>
    </Portal>
  );
};
