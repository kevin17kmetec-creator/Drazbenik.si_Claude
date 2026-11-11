import React, { useState } from 'react';
import { Globe } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { toast } from '../../lib/toast';

// Deutscher Kommentar: Auswahl der Hauptsprache des Nutzers (Webseite + Rechnungen), wird im Profil gespeichert
const OPTIONS: { code: 'SLO' | 'EN' | 'DE'; label: string }[] = [
  { code: 'SLO', label: 'Slovenščina' },
  { code: 'EN', label: 'English' },
  { code: 'DE', label: 'Deutsch' }
];

export const PreferredLanguageSelect: React.FC<{
  value?: string;
  currentLanguage: string;
  onLanguageChange?: (l: string) => void;
  onSaved?: (l: string) => void;
  t?: (k: string) => string;
}> = ({ value, currentLanguage, onLanguageChange, onSaved, t }) => {
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string>(value || currentLanguage || 'SLO');

  const choose = async (code: string) => {
    if (saving || code === selected) return;
    const previous = selected;
    setSelected(code);
    setSaving(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/user/preferred-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ language: code })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Napaka pri shranjevanju jezika.');
      }
      if (onLanguageChange) onLanguageChange(code);
      if (onSaved) onSaved(code);
    } catch (e: any) {
      setSelected(previous);
      toast.error(e.message || 'Napaka pri shranjevanju jezika.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
        <Globe size={12} /> Primarni jezik
      </label>
      <div className="flex gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.code}
            type="button"
            disabled={saving}
            onClick={() => choose(o.code)}
            className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider border transition-all min-h-[44px] ${
              selected === o.code
                ? 'bg-[#0A1128] text-[#FEBA4F] border-[#0A1128]'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-[#FEBA4F]'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] font-semibold text-slate-400 mt-1.5 leading-snug">
        Spletna stran se vam bo ob prijavi vedno odprla v izbranem jeziku, računi pa se bodo ustvarjali v tem jeziku.
      </p>
    </div>
  );
};
