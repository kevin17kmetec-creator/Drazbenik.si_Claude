import React, { useEffect, useState } from 'react';
import { Cookie } from '../icons';

// Deutscher Kommentar: Hinweis auf technisch notwendige Speicherung (keine Tracking- oder Werbe-Cookies); Auswahl wird 12 Monate gespeichert
const STORAGE_KEY = 'cookie_notice_ack';
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

// Deutscher Kommentar: Sprache aus den Browser-Einstellungen (Slowenisch, Deutsch, Englisch; sonst Englisch)
const COPY = {
  SLO: { label: 'Obvestilo o piškotkih', text: 'Uporabljamo samo nujne in funkcionalne piškotke (prijava, varnost, plačila). Ne uporabljamo sledenja ali oglaševalskih piškotkov.', more: 'Več o piškotkih', ok: 'Razumem' },
  EN: { label: 'Cookie notice', text: 'We only use necessary and functional cookies (sign-in, security, payments). We do not use tracking or advertising cookies.', more: 'More about cookies', ok: 'Got it' },
  DE: { label: 'Cookie-Hinweis', text: 'Wir verwenden nur notwendige und funktionale Cookies (Anmeldung, Sicherheit, Zahlungen). Wir verwenden keine Tracking- oder Werbe-Cookies.', more: 'Mehr zu Cookies', ok: 'Verstanden' },
} as const;

function detectBrowserLang(): 'SLO' | 'EN' | 'DE' {
  try {
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) || [];
    const first = String(list[0] || '').toLowerCase();
    if (first.startsWith('sl')) return 'SLO';
    if (first.startsWith('de')) return 'DE';
    return 'EN';
  } catch (e) {
    return 'EN';
  }
}

export const CookieNotice: React.FC<{ onOpenPolicy: () => void }> = ({ onOpenPolicy }) => {
  const [visible, setVisible] = useState(false);
  const copy = COPY[detectBrowserLang()];

  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(STORAGE_KEY) || '0');
      if (!stored || Date.now() - stored > MAX_AGE_MS) setVisible(true);
    } catch (e) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const acknowledge = () => {
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch (e) {}
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label={copy.label}
      data-no-translate
      className="fixed bottom-0 inset-x-0 z-[1500] p-3 sm:p-4 pointer-events-none"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="pointer-events-auto max-w-3xl mx-auto bg-[#0A1128] text-white rounded-2xl border border-white/10 shadow-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
        <div className="flex items-start gap-3 flex-1">
          <Cookie size={22} className="text-[#FEBA4F] shrink-0 mt-0.5" />
          <p className="text-xs sm:text-sm font-semibold text-slate-200 leading-relaxed">
            {copy.text}{' '}
            <button type="button" onClick={onOpenPolicy} className="underline text-[#FEBA4F] hover:text-white font-black">
              {copy.more}
            </button>
          </p>
        </div>
        <button
          type="button"
          onClick={acknowledge}
          className="bg-[#FEBA4F] text-[#0A1128] px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-white transition-colors min-h-[44px] shrink-0"
        >
          {copy.ok}
        </button>
      </div>
    </div>
  );
};
