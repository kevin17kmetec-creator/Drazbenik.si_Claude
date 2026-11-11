import React from 'react';
import { AlertCircle } from 'lucide-react';

export const VerificationBanner: React.FC<{ onAction: () => void; t: any; isVisible: boolean }> = ({ onAction, t, isVisible }) => {
  if (!isVisible) return null;
  return (
    <div className="bg-[#FEBA4F] text-[#0A1128] w-full shadow-xl border-b border-black/10 h-12 relative z-[2000]">
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
