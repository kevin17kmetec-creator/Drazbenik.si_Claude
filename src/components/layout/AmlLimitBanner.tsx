import React from 'react';
import { ShieldAlert } from 'lucide-react';

// Deutscher Kommentar: Banner fuer Nutzer, die das Jahreslimit (10.000 EUR) ueberschritten haben und sich ausweisen muessen
export const AmlLimitBanner: React.FC<{ onAction: () => void; t: any; isVisible: boolean; busy?: boolean }> = ({ onAction, t, isVisible, busy }) => {
  if (!isVisible) return null;
  return (
    <div className="bg-red-600 text-white w-full shadow-xl border-b border-black/10 relative z-[2000]">
      <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 px-6 py-2.5">
        <div className="flex items-center gap-3">
          <ShieldAlert size={18} className="flex-shrink-0 animate-pulse" />
          <p className="text-[11px] font-black uppercase tracking-tight leading-tight">
            {t('amlBannerNotice')}
          </p>
        </div>
        <div className="flex items-center">
          <button
            onClick={onAction}
            disabled={busy}
            className="bg-white text-red-700 px-5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-red-50 transition-all flex-shrink-0 shadow-lg disabled:opacity-60"
          >
            {t('amlBannerAction')}
          </button>
        </div>
      </div>
    </div>
  );
};
