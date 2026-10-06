import React, { useState } from 'react';
import { ShieldCheck, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAuthHeaders } from '../../lib/authFetch';
import { TERMS_VERSION } from '../../lib/termsVersion';

export const TermsUpdateView: React.FC<{
  t: any;
  userData: any;
  onSuccess: (updatedData: any) => void;
  onBack: () => void;
}> = ({ t, userData, onSuccess, onBack }) => {
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/accept-terms', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ terms_version: TERMS_VERSION })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Napaka pri potrjevanju pogojev.');
      }

      const updatedData = {
        ...userData,
        terms_version: TERMS_VERSION,
        terms_accepted_at: new Date().toISOString()
      };

      toast.success('Pogoji uporabe so bili uspešno sprejeti.');
      onSuccess(updatedData);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-20 animate-in flex justify-center">
      <div className="bg-white w-full max-w-4xl rounded-[4rem] p-10 lg:p-16 shadow-2xl border border-slate-100 flex flex-col">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 mb-8 font-black uppercase text-[10px] tracking-widest hover:text-[#0A1128] transition-colors self-start">
          <ArrowLeft size={16}/> Nazaj
        </button>
        
        <div className="text-center mb-10">
          <div className="bg-[#FEBA4F] w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-lg">
            <ShieldCheck size={40} className="text-[#0A1128]" />
          </div>
          <h2 className="text-4xl font-black text-[#0A1128] uppercase tracking-tighter mb-4">Posodobljeni pogoji uporabe</h2>
          <p className="text-slate-400 font-bold text-sm">Za nadaljnjo uporabo platforme drazbenik.si morate prebrati in sprejeti nove pogoje uporabe.</p>
        </div>

        <div className="flex-1 bg-slate-50 rounded-[2rem] p-8 md:p-10 mb-10 overflow-y-auto max-h-[50vh] border border-slate-100 custom-scrollbar">
          <div className="text-slate-600 font-bold leading-relaxed text-sm md:text-base whitespace-pre-line text-justify">
            {t('termsText')}
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-start gap-3 px-4 py-6 bg-emerald-50 rounded-2xl border border-emerald-100">
            <CheckCircle2 size={24} className="text-emerald-500 shrink-0 mt-1" />
            <p className="text-emerald-900 font-bold text-sm leading-relaxed">
              S klikom na spodnji gumb potrjujete, da ste prebrali Pogoje uporabe (verzija {TERMS_VERSION}) in se z njimi v celoti strinjate.
            </p>
          </div>

          <button 
            onClick={handleAccept} 
            disabled={loading}
            className="w-full bg-[#0A1128] text-white py-6 rounded-[2rem] font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Obdelujem...
              </>
            ) : (
              'Sprejemam pogoje in želim nadaljevati'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
