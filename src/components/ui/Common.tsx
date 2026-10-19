
import React, { useState, useEffect } from 'react';
import { AlertCircle, Clock, X } from 'lucide-react';
import { Portal } from './Portal';

export const formatSeconds = (totalSeconds: number) => {
  if (totalSeconds <= 0) return "00:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

export const VerificationBanner: React.FC<{ onAction: () => void; t: any; isVisible: boolean }> = ({ onAction, t, isVisible }) => {
  if (!isVisible) return null;
  return (
    <div className="bg-[#FEBA4F] text-[#0A1128] fixed top-0 left-0 right-0 z-[3000] shadow-xl border-b border-black/10 h-12">
      <div className="max-w-[1600px] mx-auto flex h-full items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-3">
          <AlertCircle size={18} className="flex-shrink-0 animate-pulse" />
          <p className="text-[11px] font-black uppercase tracking-tight leading-tight">
            {t('verifyNotice')}
          </p>
        </div>
        <div className="flex items-center">
          <button onClick={onAction} className="bg-[#0A1128] text-white px-5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex-shrink-0 shadow-lg">
            {t('verifyAction')}
          </button>
        </div>
      </div>
    </div>
  );
};

export const StaticTimer: React.FC<{ endTime: Date }> = ({ endTime }) => {
  const [timeLeftStr, setTimeLeftStr] = useState('');
  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Math.floor((endTime.getTime() - Date.now()) / 1000));
      setTimeLeftStr(formatSeconds(diff));
    };
    update(); const t = setInterval(update, 1000); return () => clearInterval(t);
  }, [endTime]);
  return (
    <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl border-2 bg-[#FEBA4F]/10 border-[#FEBA4F]/30 text-[#FEBA4F] font-mono font-black text-2xl tabular-nums shadow-xl">
      <Clock size={20} /><span>{timeLeftStr}</span>
    </div>
  );
};

export const LegalModal: React.FC<{ type: 'terms' | 'privacy' | 'how'; onClose: () => void; t: any }> = ({ type, onClose, t }) => {
    const titles = { terms: t('legalTerms'), privacy: t('legalPrivacy'), how: t('legalHow') };
    const content = {
        terms: "Splošni pogoji poslovanja spletne platforme dražbenik.si urejajo pravice in obveznosti ponudnikov in dražiteljev. Vsaka oddana ponudba je pravno zavezujoča po 18. členu Zakona o dražbah. Neplačilo v 48 urah po končani dražbi se obravnava kot kršitev pogodbe.",
        privacy: "Skladno z uredbo GDPR vaše podatke varujemo z najvišjimi varnostnimi standardi. Podatki se uporabljajo izključno za namene izvedbe dražb in verifikacije uporabnikov. Vaši podatki ne bodo posredovani tretjim osebam brez vaše privolitve.",
        how: "Za sodelovanje se registrirajte, opravite verifikacijo in oddajte svojo prvo ponudbo. Dražbe delujejo po sistemu 'videno-kupljeno'. Vsako prebitje ponudbe v zadnji minuti podaljša dražbo za dodatni 2 minuti."
    };

    return (
        <Portal>
            <div className="fixed inset-0 z-[2000] flex items-center justify-center p-2.5 sm:p-4">
                <div className="absolute inset-0 bg-[#0A1128]/95 backdrop-blur-md" onClick={onClose}></div>
                {/* Deutsches Kommentar: Responsives Modal fuer mobile Geraete mit max-h-[92dvh] und Innenabstand */}
                <div className="relative bg-white w-full max-w-2xl rounded-3xl sm:rounded-[3rem] p-5 sm:p-10 lg:p-14 shadow-2xl animate-in border-4 border-[#FEBA4F] max-h-[92dvh] overflow-y-auto">
                    <button onClick={onClose} className="absolute top-4 right-4 sm:top-8 sm:right-8 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 min-w-[40px] min-h-[40px] flex items-center justify-center"><X size={24} /></button>
                    <h3 className="text-xl sm:text-3xl font-black text-[#0A1128] uppercase tracking-tighter mb-4 sm:mb-8">{titles[type]}</h3>
                    <div className="text-slate-600 font-bold leading-relaxed text-sm sm:text-base md:text-lg whitespace-pre-line mb-6 sm:mb-10">
                        {content[type]}
                    </div>
                    <button onClick={onClose} className="w-full bg-[#0A1128] text-white py-3.5 sm:py-5 rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl min-h-[44px] flex items-center justify-center">Razumem</button>
                </div>
            </div>
        </Portal>
    );
};

export const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-3.5 h-3.5 border-2',
    md: 'w-4 h-4 border-2',
    lg: 'w-6 h-6 border-3'
  };
  return (
    <div
      className={`inline-block rounded-full border-current border-t-transparent animate-spin ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label="Nalaganje..."
    />
  );
};

export interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void | Promise<any>;
}

// Deutscher Kommentar: Wiederverwendbarer LoadingButton, der asynchrone Klicks abfaengt, Ladezustand anzeigt und Doppelklicks verhindert
export const LoadingButton: React.FC<LoadingButtonProps> = ({
  children,
  loading: externalLoading,
  loadingText,
  onClick,
  disabled,
  className = '',
  ...props
}) => {
  const [internalLoading, setInternalLoading] = useState(false);

  const isActuallyLoading = externalLoading || internalLoading;

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isActuallyLoading || disabled) return;
    if (!onClick) return;

    const result = onClick(e);
    if (result && typeof result.then === 'function') {
      setInternalLoading(true);
      try {
        await result;
      } catch (err) {
        // Fehler wird im Handler behandelt
      } finally {
        setInternalLoading(false);
      }
    }
  };

  return (
    <button
      {...props}
      disabled={disabled || isActuallyLoading}
      aria-busy={isActuallyLoading}
      onClick={handleClick}
      className={`relative inline-flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      {isActuallyLoading ? (
        <>
          <Spinner size="sm" />
          <span>{loadingText || "Nalagam..."}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};
