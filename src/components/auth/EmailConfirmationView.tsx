import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { confirmEmailAction } from '../../actions/auth-emails';

interface EmailConfirmationViewProps {
  token: string;
  email?: string;
  onGoToLogin: (email?: string) => void;
  onClose: () => void;
}

export const EmailConfirmationView: React.FC<EmailConfirmationViewProps> = ({
  token,
  email,
  onGoToLogin,
  onClose
}) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmedEmail, setConfirmedEmail] = useState(email || '');

  const handleConfirm = async () => {
    if (!token) return;
    setLoading(true);
    setErrorMessage('');

    try {
      const res = await confirmEmailAction(token, email);
      if (res.success) {
        setStatus('success');
        if (res.data?.email) {
          setConfirmedEmail(res.data.email);
        }
      } else {
        setStatus('error');
        setErrorMessage(res.error || 'Potrditev e-poštnega naslova ni uspela. Povezava je morda potekla.');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err?.message || 'Prišlo je do nepričakovane napake pri povezavi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0A1128] border border-white/10 rounded-3xl p-8 md:p-10 shadow-2xl text-center">
        
        {/* Brand Logo */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-1.5 text-2xl font-black text-white tracking-tight">
            <span>dražbenik</span>
            <span className="text-amber-400">.si</span>
          </div>
          <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mt-1">
            Slovenska dražbena platforma
          </p>
        </div>

        {/* State 1: Ready to confirm */}
        {status === 'idle' && (
          <div className="space-y-6">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
              <ShieldCheck className="w-9 h-9" />
            </div>

            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">
                Potrditev e-poštnega naslova
              </h2>
              <p className="text-slate-300 text-sm mt-3 leading-relaxed">
                Pozdravljeni! Za dokončanje registracije in aktivacijo računa za{' '}
                <strong className="text-amber-400 font-semibold">{email || 'vaš e-poštni naslov'}</strong>{' '}
                kliknite spodnji gumb.
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-base uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-3 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Potrjevanje...</span>
                  </>
                ) : (
                  <>
                    <span>POTRDI E-POŠTNI NASLOV</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-slate-400">
              S klikom na gumb boste potrdili lastništvo svojega e-poštnega predala.
            </p>
          </div>
        )}

        {/* State 2: Success */}
        {status === 'success' && (
          <div className="space-y-6 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">
                E-poštni naslov uspešno potrjen!
              </h2>
              <p className="text-slate-300 text-sm mt-3 leading-relaxed">
                Vaš e-poštni naslov <strong className="text-white font-semibold">{confirmedEmail}</strong> je bil uspešno verificiran. Vaš uporabniški račun je sedaj polno aktiviran.
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={() => onGoToLogin(confirmedEmail)}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-black text-base uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3 cursor-pointer"
              >
                <span>PRIJAVI SE V RAČUN</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* State 3: Error */}
        {status === 'error' && (
          <div className="space-y-6 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-inner">
              <AlertCircle className="w-9 h-9" />
            </div>

            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">
                Potrditev ni uspela
              </h2>
              <p className="text-rose-300 text-sm mt-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-left">
                {errorMessage}
              </p>
              <p className="text-slate-400 text-xs mt-3">
                Povezava je morda že bila uporabljena ali pa je potekel njen čas veljavnosti.
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-3">
              <button
                onClick={() => onGoToLogin(email)}
                className="w-full py-3.5 px-6 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer"
              >
                ODPRI PRIJAVO
              </button>
              <button
                onClick={onClose}
                className="w-full py-3 px-6 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-semibold text-xs tracking-wider transition-all cursor-pointer"
              >
                ZAPRI IN NADALJUJ NA STRAN
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
