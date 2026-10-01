
import React, { useState, useEffect } from 'react';
import { AlertCircle, Clock, X } from 'lucide-react';

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
    <div className="bg-[#FEBA4F] text-[#0A1128] fixed top-0 left-0 right-0 z-[2000] shadow-xl border-b border-black/10 h-12">
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
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[#0A1128]/95 backdrop-blur-md" onClick={onClose}></div>
            <div className="relative bg-white w-full max-w-2xl rounded-[3rem] p-10 lg:p-14 shadow-2xl animate-in border-4 border-[#FEBA4F]">
                <button onClick={onClose} className="absolute top-8 right-8 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24} /></button>
                <h3 className="text-3xl font-black text-[#0A1128] uppercase tracking-tighter mb-8">{titles[type]}</h3>
                <div className="text-slate-600 font-bold leading-relaxed text-lg whitespace-pre-line mb-10">
                    {content[type]}
                </div>
                <button onClick={onClose} className="w-full bg-[#0A1128] text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl">Razumem</button>
            </div>
        </div>
    );
};
