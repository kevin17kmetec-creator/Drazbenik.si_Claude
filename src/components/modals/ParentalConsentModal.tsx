import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Users } from 'lucide-react';

type Lang = 'SLO' | 'EN' | 'DE';

// Deutscher Kommentar: Texte fuer die Zustimmung der Eltern in allen drei Sprachen
const TEXTS: Record<Lang, { title: string; intro: string; check: string; note: string; confirm: string; later: string; saving: string }> = {
  SLO: {
    title: 'Soglasje staršev',
    intro: 'Ker ste mlajši od 18 let, lahko oddajate ponudbe in objavljate dražbe samo s soglasjem staršev oziroma zakonitih zastopnikov. Do potrditve si dražbe lahko ogledujete, oddaja ponudb pa je zaklenjena.',
    check: 'Potrjujem, da sem za poslovanje na platformi dražbenik.si (oddajanje ponudb, nakupe in prodajo) pridobil/a soglasje staršev oziroma zakonitega zastopnika, ki je seznanjen s splošnimi pogoji.',
    note: 'Potrditev se trajno shrani skupaj z datumom, časom in tehničnimi podatki (IP, naprava) kot dokazilo.',
    confirm: 'Potrjujem soglasje',
    later: 'Kasneje',
    saving: 'Shranjujem...'
  },
  EN: {
    title: 'Parental consent',
    intro: 'As you are under 18, you can place bids and publish auctions only with the consent of your parents or legal guardians. Until you confirm, you can browse auctions but bidding is locked.',
    check: 'I confirm that I have obtained the consent of my parents or legal guardian, who is aware of the terms and conditions, for using dražbenik.si (bidding, buying and selling).',
    note: 'Your confirmation is stored permanently together with the date, time and technical data (IP, device) as evidence.',
    confirm: 'Confirm consent',
    later: 'Later',
    saving: 'Saving...'
  },
  DE: {
    title: 'Zustimmung der Eltern',
    intro: 'Da Sie unter 18 Jahre alt sind, dürfen Sie nur mit Zustimmung Ihrer Eltern bzw. gesetzlichen Vertreter bieten und Auktionen einstellen. Bis zur Bestätigung können Sie Auktionen ansehen, das Bieten ist gesperrt.',
    check: 'Ich bestätige, dass ich für die Nutzung von dražbenik.si (Bieten, Kaufen und Verkaufen) die Zustimmung meiner Eltern bzw. meines gesetzlichen Vertreters eingeholt habe, der die Geschäftsbedingungen kennt.',
    note: 'Die Bestätigung wird dauerhaft mit Datum, Uhrzeit und technischen Daten (IP, Gerät) als Nachweis gespeichert.',
    confirm: 'Zustimmung bestätigen',
    later: 'Später',
    saving: 'Speichere...'
  }
};

export const ParentalConsentModal: React.FC<{
  isOpen: boolean;
  language?: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}> = ({ isOpen, language = 'SLO', onConfirm, onClose }) => {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!isOpen) return null;
  const tx = TEXTS[(language as Lang)] || TEXTS.SLO;

  const submit = async () => {
    if (!checked || busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-[#0A1128]/80 backdrop-blur-sm z-[9000] flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white w-full max-w-lg rounded-3xl p-6 sm:p-10 shadow-2xl max-h-[92dvh] overflow-y-auto">
        <div className="bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5">
          <Users size={30} className="text-amber-600" />
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-[#0A1128] uppercase tracking-tighter text-center mb-3">{tx.title}</h2>
        <p className="text-slate-500 font-bold text-xs sm:text-sm text-center mb-5">{tx.intro}</p>
        <label className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-4 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 w-5 h-5 accent-[#FEBA4F] flex-shrink-0"
          />
          <span className="text-xs sm:text-sm font-bold text-[#0A1128] leading-snug">{tx.check}</span>
        </label>
        <p className="text-[11px] text-slate-400 font-bold mt-3 text-center">{tx.note}</p>
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-slate-500 font-black uppercase text-xs tracking-widest hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            {tx.later}
          </button>
          <button
            onClick={submit}
            disabled={!checked || busy}
            className="flex-1 py-3.5 rounded-2xl bg-[#FEBA4F] text-[#0A1128] font-black uppercase text-xs tracking-widest hover:bg-amber-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? tx.saving : tx.confirm}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
