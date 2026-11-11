import React from 'react';
import { Users } from 'lucide-react';

// Deutscher Kommentar: Hinweisleiste fuer Nutzer zwischen 16 und 18 Jahren ohne Zustimmung der Eltern (Bieten gesperrt)
const TEXTS: Record<string, { notice: string; action: string }> = {
  SLO: { notice: 'Oddaja ponudb je zaklenjena, dokler ne potrdite soglasja staršev (starost 16 do 18 let).', action: 'Potrdi soglasje' },
  EN: { notice: 'Bidding is locked until you confirm parental consent (ages 16 to 18).', action: 'Confirm consent' },
  DE: { notice: 'Das Bieten ist gesperrt, bis Sie die Zustimmung der Eltern bestätigen (Alter 16 bis 18).', action: 'Zustimmung bestätigen' }
};

export const ParentalConsentBanner: React.FC<{ isVisible: boolean; language?: string; onAction: () => void }> = ({ isVisible, language = 'SLO', onAction }) => {
  if (!isVisible) return null;
  const tx = TEXTS[language] || TEXTS.SLO;
  return (
    <div className="bg-[#FEBA4F] text-[#0A1128] w-full shadow-xl border-b border-black/10 relative z-[2000]">
      <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 px-6 py-2.5">
        <div className="flex items-center gap-3">
          <Users size={18} className="flex-shrink-0" />
          <p className="text-[11px] font-black uppercase tracking-tight leading-tight">{tx.notice}</p>
        </div>
        <button
          onClick={onAction}
          className="bg-[#0A1128] text-white px-5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all flex-shrink-0 shadow-lg"
        >
          {tx.action}
        </button>
      </div>
    </div>
  );
};
