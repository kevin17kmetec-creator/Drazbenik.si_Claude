import React, { useState } from 'react';
import { loadConnectAndInitialize } from '@stripe/connect-js';
import { ConnectComponentsProvider, ConnectAccountOnboarding } from '@stripe/react-connect-js';
import { CheckCircle2, AlertCircle, AlertTriangle, ShieldCheck, Building2, Info } from 'lucide-react';
import { TERMS_VERSION } from '../../lib/termsVersion';
import { getAuthHeaders } from '../../lib/authFetch';
import { toast } from 'sonner';

interface PayoutSetupViewProps {
  userData: any;
  onRefreshUserData?: () => Promise<void>;
  onNavigateToSettingsProfile: () => void;
  onNavigateToCreateAuction: () => void;
  onOpenTermsModal: () => void;
  t: any;
  language: string;
}

export const PayoutSetupView: React.FC<PayoutSetupViewProps> = ({
  userData,
  onRefreshUserData,
  onNavigateToSettingsProfile,
  onNavigateToCreateAuction,
  onOpenTermsModal,
  t,
  language
}) => {
  const [stripeLoaded, setStripeLoaded] = useState(false);
  const [stripeError, setStripeError] = useState(false);

  // Seller declaration state
  const [acceptedDsa, setAcceptedDsa] = useState(Boolean(userData?.seller_self_certified));
  const [acceptedTerms, setAcceptedTerms] = useState(Boolean(userData?.seller_invoice_authorization));
  const [isSubmittingTerms, setIsSubmittingTerms] = useState(false);

  // Business registration number state
  const isBusiness = userData?.user_type === 'business' || userData?.userType === 'business';
  const hasRegNumber = Boolean(userData?.registration_number || userData?.regNumber);
  const [regNumberInput, setRegNumberInput] = useState(userData?.registration_number || userData?.regNumber || '');
  const [isSavingRegNum, setIsSavingRegNum] = useState(false);

  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

  // Stripe connect instance initialized once
  const [stripeConnectInstance] = useState(() => {
    return loadConnectAndInitialize({
      publishableKey: publishableKey,
      fetchClientSecret: async () => {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/stripe-account-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers
          }
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Napaka pri pridobivanju ključa seje');
        }
        const data = await res.json();
        return data.client_secret;
      },
      locale: 'sl-SI',
      appearance: {
        variables: {
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          colorPrimary: '#0A1128',
          buttonPrimaryColorBackground: '#0A1128',
          buttonPrimaryColorText: '#FFFFFF',
          borderRadius: '16px'
        }
      }
    });
  });

  const handleAcceptTerms = async () => {
    if (!acceptedDsa || !acceptedTerms) {
      toast.error("Za nadaljevanje morate označiti obe izjavi.");
      return;
    }

    setIsSubmittingTerms(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/seller/accept-terms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({
          terms_version: TERMS_VERSION,
          invoice_authorization: true,
          self_certification: true
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Napaka pri potrditvi pogojev.');
      }

      toast.success("Izjavi uspešno sprejeti.");
      if (onRefreshUserData) {
        await onRefreshUserData();
      }
    } catch (err: any) {
      toast.error(err.message || 'Napaka pri shranjevanju izjave.');
    } finally {
      setIsSubmittingTerms(false);
    }
  };

  const handleSaveRegNumber = async () => {
    if (!regNumberInput.trim()) {
      toast.error("Prosimo, vnesite matično številko.");
      return;
    }
    setIsSavingRegNum(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/user/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({
          registration_number: regNumberInput.trim()
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Napaka pri shranjevanju matične številke.');
      }

      toast.success("Matična številka shranjena.");
      if (onRefreshUserData) {
        await onRefreshUserData();
      }
    } catch (err: any) {
      toast.error(err.message || 'Napaka pri shranjevanju matične številke.');
    } finally {
      setIsSavingRegNum(false);
    }
  };

  const handleExit = async () => {
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch('/api/stripe-check-account-status', {
        method: 'POST',
        headers: { ...headers }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (onRefreshUserData) {
          await onRefreshUserData();
        }
        if (data.complete) {
          toast.success("Izplačila so urejena. Sedaj lahko objavite dražbo.");
          onNavigateToCreateAuction();
        }
      }
    } catch (err) {
      console.error("Error checking account status on exit:", err);
    }
  };

  const isProfileComplete = userData?.profile_completed === true;
  const isTermsAccepted = Boolean(userData?.seller_terms_accepted_at);
  const requiresRegNumber = isBusiness && !hasRegNumber;
  const hasRequirements = Array.isArray(userData?.stripe_requirements_due) && userData.stripe_requirements_due.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-in">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#0A1128] uppercase tracking-tight mb-2">
          Izplačila prodajalca
        </h1>
        <p className="text-slate-500 font-bold text-sm">
          Povežite svoj bančni račun za prejemanje izplačil od prodanih predmetov. Postopek poteka varno znotraj naše platforme.
        </p>
      </div>

      {/* Status Card */}
      <div className="mb-6">
        {userData?.stripe_onboarding_complete ? (
          <div className="bg-emerald-50 border-2 border-emerald-200 text-emerald-900 p-5 rounded-3xl font-bold flex items-center gap-4 shadow-sm">
            <CheckCircle2 className="text-emerald-600 shrink-0" size={28} />
            <div>
              <div className="font-black text-base uppercase tracking-tight">Izplačila so urejena</div>
              <div className="text-xs text-emerald-700 font-bold mt-0.5">
                Vaš račun pri Stripe je pripravljen za sprejemanje izplačil.
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border-2 border-amber-200 text-amber-900 p-5 rounded-3xl font-bold flex items-center gap-4 shadow-sm">
            <AlertCircle className="text-amber-600 shrink-0" size={28} />
            <div>
              <div className="font-black text-base uppercase tracking-tight">Izplačila še niso urejena</div>
              {hasRequirements && (
                <div className="text-xs text-amber-800 font-bold mt-0.5">
                  Manjkajo še podatki za preverjanje identitete
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Profile incomplete block */}
      {!isProfileComplete ? (
        <div className="p-8 bg-slate-50 border-2 border-slate-200 rounded-3xl text-center my-6">
          <AlertTriangle className="mx-auto text-amber-500 mb-3" size={44} />
          <h2 className="text-xl font-black text-[#0A1128] uppercase mb-2">Profil še ni dopolnjen</h2>
          <p className="text-slate-600 text-sm font-bold mb-6 max-w-md mx-auto">
            Za ureditev izplačil morate najprej dopolniti svoje osebne ali poslovne podatke v profilu.
          </p>
          <button
            onClick={onNavigateToSettingsProfile}
            className="bg-[#0A1128] text-white px-8 py-3.5 rounded-2xl font-black uppercase tracking-wider text-xs hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-md"
          >
            Dopolni profil
          </button>
        </div>
      ) : (
        <>
          {/* Seller Terms declaration block */}
          {!isTermsAccepted && (
            <div className="p-6 bg-slate-50 border-2 border-slate-200 rounded-3xl mb-6 space-y-4">
              <div className="flex items-center gap-2 text-[#0A1128]">
                <ShieldCheck size={22} className="text-[#FEBA4F]" />
                <h3 className="font-black uppercase tracking-wider text-sm">Izjava prodajalca</h3>
              </div>

              <div className="space-y-3 text-xs font-bold text-slate-700">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptedDsa}
                    onChange={(e) => setAcceptedDsa(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#0A1128] focus:ring-[#0A1128]"
                  />
                  <span>
                    Potrjujem, da bom na platformi ponujal samo predmete in storitve, ki so skladni z veljavno zakonodajo (samopotrditev po 30. členu Akta o digitalnih storitvah).
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#0A1128] focus:ring-[#0A1128]"
                  />
                  <span>
                    Sprejemam{' '}
                    <button
                      type="button"
                      onClick={onOpenTermsModal}
                      className="underline text-[#0A1128] font-black hover:text-[#FEBA4F]"
                    >
                      Pogoje uporabe
                    </button>{' '}
                    in pooblaščam družbo Dizain d.o.o. za izdajo računov za prodane predmete v mojem imenu in za moj račun.
                  </span>
                </label>
              </div>

              <button
                disabled={!acceptedDsa || !acceptedTerms || isSubmittingTerms}
                onClick={handleAcceptTerms}
                className={`w-full py-3.5 rounded-2xl font-black uppercase tracking-wider text-xs transition-all ${
                  acceptedDsa && acceptedTerms && !isSubmittingTerms
                    ? 'bg-[#0A1128] text-white hover:bg-[#FEBA4F] hover:text-[#0A1128] shadow-md'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isSubmittingTerms ? 'Sprejemanje...' : 'Nadaljuj na izplačila'}
              </button>
            </div>
          )}

          {/* Business Registration Number missing input */}
          {isTermsAccepted && requiresRegNumber && (
            <div className="p-6 bg-slate-50 border-2 border-slate-200 rounded-3xl mb-6 space-y-3">
              <div className="flex items-center gap-2 text-[#0A1128]">
                <Building2 size={20} className="text-[#FEBA4F]" />
                <h3 className="font-black uppercase tracking-wider text-sm">Matična številka podjetja</h3>
              </div>
              <p className="text-xs font-bold text-slate-600">
                Za registracijo poslovnega računa pri Stripe vnesite matično številko vašega podjetja.
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={regNumberInput}
                  onChange={(e) => setRegNumberInput(e.target.value)}
                  placeholder="Vnesite matično številko"
                  className="flex-1 px-4 py-3 bg-white rounded-2xl border-2 border-slate-200 text-xs font-bold text-[#0A1128] focus:border-[#0A1128] outline-none"
                />
                <button
                  disabled={isSavingRegNum || !regNumberInput.trim()}
                  onClick={handleSaveRegNumber}
                  className="bg-[#0A1128] text-white px-6 py-3 rounded-2xl font-black uppercase tracking-wider text-xs hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all disabled:opacity-50"
                >
                  {isSavingRegNum ? 'Shranjevanje...' : 'Shrani'}
                </button>
              </div>
            </div>
          )}

          {/* Stripe Embedded Onboarding Component */}
          {isTermsAccepted && !requiresRegNumber && (
            <div className="bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-sm relative min-h-[420px]">
              {!stripeLoaded && !stripeError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 z-10 rounded-3xl">
                  <div className="w-8 h-8 border-4 border-[#0A1128] border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-slate-500 font-black text-xs uppercase tracking-widest">
                    Nalaganje obrazca za izplačila...
                  </p>
                </div>
              )}

              {stripeError ? (
                <div className="p-8 text-center bg-red-50 rounded-2xl border border-red-200 my-4">
                  <AlertCircle className="mx-auto text-red-500 mb-2" size={36} />
                  <p className="text-red-800 font-bold text-sm mb-4">
                    Povezave s sistemom za izplačila ni bilo mogoče vzpostaviti. Osvežite stran.
                  </p>
                  <button
                    onClick={() => { setStripeError(false); setStripeLoaded(false); }}
                    className="bg-[#0A1128] text-white px-6 py-3 rounded-2xl text-xs font-black uppercase hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all"
                  >
                    Osveži
                  </button>
                </div>
              ) : (
                <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
                  <ConnectAccountOnboarding
                    onExit={handleExit}
                    onLoaderStart={() => setStripeLoaded(true)}
                    onLoadError={() => setStripeError(true)}
                  />
                </ConnectComponentsProvider>
              )}
            </div>
          )}
        </>
      )}

      {/* Info list section */}
      <div className="mt-8 p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl">
        <h3 className="text-xs font-black text-[#0A1128] uppercase tracking-wider mb-3 flex items-center gap-2">
          <Info size={16} className="text-[#FEBA4F]" /> Zakaj to potrebujemo?
        </h3>
        <ul className="space-y-2 text-xs font-bold text-slate-600">
          <li className="flex items-start gap-2">
            <span className="text-[#FEBA4F] font-black">•</span>
            <span>Denar od kupca gre neposredno na vaš račun pri Stripe, mi ga ne hranimo.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#FEBA4F] font-black">•</span>
            <span>Izplačilo na vaš bančni račun se sproži, ko kupec potrdi prejem ali ko poteče rok za pritožbo.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#FEBA4F] font-black">•</span>
            <span>Podatke za preverjanje identitete obdeluje Stripe, ne mi.</span>
          </li>
        </ul>
      </div>
    </div>
  );
};
