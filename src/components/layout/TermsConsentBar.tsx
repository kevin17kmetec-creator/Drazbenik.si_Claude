import React, { useState } from 'react';
import { toast } from '../../lib/toast';
import { getAuthHeaders } from '../../lib/authFetch';
import { TERMS_VERSION } from '../../lib/termsVersion';

// Deutscher Kommentar: Leiste am unteren Fensterrand (wie bei Online-Shops): Hinweis auf aktualisierte Bedingungen mit Links und Bestaetigungsknopf
export const TermsConsentBar: React.FC<{
  userData: any;
  ready: boolean;
  onConfirmed: (updated: any) => void;
  onLegal: (type: any) => void;
}> = ({ userData, ready, onConfirmed, onLegal }) => {
  const [loading, setLoading] = useState(false);

  const needsConsent =
    ready &&
    !!userData?.id &&
    userData?.profile_loaded === true &&
    userData?.terms_version !== TERMS_VERSION;

  if (!needsConsent) return null;

  const confirm = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/accept-terms', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ terms_version: TERMS_VERSION })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Potrditev ni uspela. Poskusite znova.');
      }
      onConfirmed({ ...userData, terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() });
    } catch (e: any) {
      toast.error(e?.message || 'Potrditev ni uspela. Poskusite znova.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Pogoji uporabe"
      className="fixed bottom-0 inset-x-0 z-[600] bg-[#0A1128] text-white border-t-2 border-[#FEBA4F] shadow-[0_-8px_30px_rgba(0,0,0,0.35)] px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 animate-in slide-in-from-bottom duration-500"
    >
      <p className="text-xs sm:text-sm font-bold text-slate-200 text-center sm:text-left max-w-3xl leading-relaxed">
        Za uporabo platforme potrebujemo vaše soglasje s{' '}
        <button type="button" onClick={() => onLegal('terms')} className="text-[#FEBA4F] underline underline-offset-2 hover:text-white cursor-pointer">Pogoji uporabe</button>{' '}
        in{' '}
        <button type="button" onClick={() => onLegal('privacy')} className="text-[#FEBA4F] underline underline-offset-2 hover:text-white cursor-pointer">Politiko zasebnosti</button>.
      </p>
      <button
        type="button"
        onClick={confirm}
        disabled={loading}
        className="bg-[#FEBA4F] text-[#0A1128] px-8 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-white transition-colors min-h-[40px] shrink-0 disabled:opacity-60 cursor-pointer"
      >
        {loading ? 'Potrjujem...' : 'Potrdi'}
      </button>
    </div>
  );
};
