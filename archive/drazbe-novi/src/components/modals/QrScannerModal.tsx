import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, AlertCircle } from 'lucide-react';
import { Portal } from '../ui/Portal';

interface QrScannerModalProps {
  isOpen: boolean;
  auctionId: string;
  auctionTitle?: string;
  onClose: () => void;
  onScanSuccess: (data: { auctionId: string; token: string }) => void;
  onSwitchToPin: () => void;
}

// Deutscher Kommentar: In-App-QR-Code-Scanner fuer Verkaeufer mit Rueckkamera und automatischer Freigabe der Videospuren
export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  auctionId,
  auctionTitle,
  onClose,
  onScanSuccess,
  onSwitchToPin,
}) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'qr-reader-container';

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsStarting(true);
    setErrorMessage(null);

    const startScanner = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          if (isMounted) {
            setErrorMessage("Kamera v tej napravi ali brskalniku ni podprta.");
            setIsStarting(false);
          }
          return;
        }

        const html5QrCode = new Html5Qrcode(containerId);
        scannerRef.current = html5QrCode;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        };

        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            // Deutscher Kommentar: Pruefen des dekodierten QR-Codes
            try {
              let url: URL;
              try {
                url = new URL(decodedText);
              } catch {
                // Wenn relative URL
                url = new URL(decodedText, window.location.origin);
              }

              // Deutscher Kommentar: Hostname-Validierung (gleicher Origin oder drazbe.eu)
              const hostname = url.hostname.toLowerCase();
              const currentHostname = window.location.hostname.toLowerCase();
              const isValidHost =
                hostname === currentHostname ||
                hostname === 'drazbe.eu' ||
                hostname === 'www.drazbe.eu' ||
                hostname === 'localhost' ||
                hostname.endsWith('.run.app');

              if (!isValidHost) {
                if (isMounted) setErrorMessage("Koda ne pripada tej platformi.");
                return;
              }

              const prevzemParam = url.searchParams.get('prevzem');
              const tokenParam = url.searchParams.get('t');

              if (!prevzemParam || !tokenParam) {
                if (isMounted) setErrorMessage("QR koda ne vsebuje veljavnih podatkov za prevzem.");
                return;
              }

              if (prevzemParam !== auctionId) {
                if (isMounted) setErrorMessage("Ta koda ne velja za to dražbo.");
                return;
              }

              // Deutscher Kommentar: Kamera stoppen und Token zur Bestaetigung uebergeben
              if (scannerRef.current) {
                scannerRef.current
                  .stop()
                  .then(() => {
                    scannerRef.current?.clear();
                    scannerRef.current = null;
                  })
                  .catch(() => {});
              }

              if (isMounted) {
                onScanSuccess({ auctionId: prevzemParam, token: tokenParam });
              }
            } catch (err: any) {
              if (isMounted) setErrorMessage("Napaka pri branju kode.");
            }
          },
          () => {
            // Scanner-Suchschleife laeuft, Fehler pro Frame ignorieren
          }
        );

        if (isMounted) setIsStarting(false);
      } catch (err: any) {
        if (!isMounted) return;
        setIsStarting(false);
        const errStr = String(err?.message || err).toLowerCase();
        if (errStr.includes('notallowederror') || errStr.includes('permission denied') || errStr.includes('permission')) {
          setErrorMessage("Dostop do kamere je zavrnjen. Vnesite kodo ročno.");
        } else if (errStr.includes('notfounderror') || errStr.includes('no camera') || errStr.includes('devices not found')) {
          setErrorMessage("Kamere ni bilo mogoče najti na tej napravi.");
        } else {
          setErrorMessage("Kamere ni bilo mogoče zagnati. Vnesite kodo ročno.");
        }
      }
    };

    // Kleines Timeout, damit der DOM-Container gerendert ist
    const timer = setTimeout(() => {
      startScanner();
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .then(() => {
            scannerRef.current?.clear();
            scannerRef.current = null;
          })
          .catch(() => {
            try {
              scannerRef.current?.clear();
            } catch {}
            scannerRef.current = null;
          });
      }

      // Deutscher Kommentar: Explizites Stoppen aller Medien-Videospuren
      try {
        navigator.mediaDevices?.getUserMedia({ video: true }).then((stream) => {
          stream.getTracks().forEach((track) => track.stop());
        }).catch(() => {});
      } catch {}
    };
  }, [isOpen, auctionId]);

  if (!isOpen) return null;

  return (
    <Portal>
      {/* Deutscher Kommentar: Responsives Kamera-Scanner-Modal fuer Smartphone und Desktop */}
      <div
        className="fixed inset-0 bg-[#0A1128]/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-3 sm:p-6 animate-in"
        onClick={onClose}
      >
        <div
          className="bg-white w-full max-w-md rounded-3xl sm:rounded-[3rem] p-5 sm:p-8 shadow-2xl relative text-center max-h-[92dvh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 text-slate-400 hover:text-[#0A1128] transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
            aria-label="Zapri"
          >
            <X size={24} />
          </button>

          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl sm:rounded-3xl bg-[#FEBA4F]/20 text-[#0A1128] flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <Camera size={28} className="text-[#FEBA4F]" />
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-[#0A1128] uppercase tracking-tighter mb-1 sm:mb-2">
            Skeniraj kodo
          </h2>

          {auctionTitle && (
            <p className="text-xs sm:text-sm font-bold text-[#0A1128] mb-3 bg-slate-100 py-1.5 px-3 rounded-xl line-clamp-1">
              {auctionTitle}
            </p>
          )}

          <p className="text-slate-500 font-bold mb-4 text-xs sm:text-sm">
            Usmerite kamero v QR kodo na telefonu kupca.
          </p>

          {/* Kamera-Container */}
          <div className="relative w-full aspect-square max-w-[280px] sm:max-w-[300px] mx-auto bg-black rounded-2xl overflow-hidden mb-4 border-2 border-slate-200">
            <div id={containerId} className="w-full h-full" />
            {isStarting && (
              <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-white p-4">
                <div className="w-8 h-8 border-3 border-[#FEBA4F] border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-xs font-bold text-slate-300">Zagon kamere...</p>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-bold mb-4 text-left">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onSwitchToPin}
              className="text-xs font-black uppercase tracking-wider text-[#0A1128] hover:text-[#FEBA4F] transition-colors py-2 min-h-[40px] flex items-center justify-center underline cursor-pointer"
            >
              Raje vnesem kodo ročno
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full bg-slate-100 text-slate-600 py-3 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all min-h-[40px]"
            >
              Prekliči
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};
