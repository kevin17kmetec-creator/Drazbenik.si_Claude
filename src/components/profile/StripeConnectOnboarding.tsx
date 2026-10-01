import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { getStripeAccountLinkAction } from '@/src/actions/index';

interface Props {
  userId: string;
  isComplete: boolean;
  onComplete: () => void;
  t: (key: string) => string;
  language: string;
}

export const StripeConnectOnboarding: React.FC<Props> = ({ userId, isComplete, onComplete, t, language }) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollTimerRef = useRef<any>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'STRIPE_POPUP_CALLBACK') {
        const { status, action } = event.data;
        if (action === 'stripe_connect' || !action) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          if (popupRef.current && !popupRef.current.closed) {
            try { popupRef.current.close(); } catch (e) {}
          }
          setLoading(false);
          onComplete();
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [onComplete]);

  const handleStartOnboarding = async () => {
    // Open a popup immediately on click to prevent Safari/mobile popup blockers
    const popup = window.open('', 'stripeOnboarding', 'width=800,height=750,left=250,top=100');
    popupRef.current = popup;

    if (popup) {
      popup.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Dražbenik.si - Stripe povezovanje</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0A1128; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .loader { width: 36px; height: 36px; border: 3px solid rgba(254,186,79,0.2); border-top-color: #FEBA4F; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
            @keyframes spin { to { transform: rotate(360deg); } }
            h3 { font-size: 18px; margin-bottom: 8px; color: #FEBA4F; }
            p { font-size: 13px; color: #94a3b8; }
          </style>
        </head>
        <body>
          <div>
            <div class="loader"></div>
            <h3>Pripravljam varno povezavo...</h3>
            <p>Preusmerjanje na sistem Stripe</p>
          </div>
        </body>
        </html>
      `);
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const callbackUrl = `${window.location.origin}/stripe-callback.html`;
      const res = await getStripeAccountLinkAction({ 
        userId: userId, 
        user_id: userId,
        return_url: `${callbackUrl}?stripe=success`,
        refresh_url: `${callbackUrl}?stripe=refresh`
      });
      
      if (!res.success || !res.data?.url) {
        throw new Error(res.error || 'Napaka pri pridobivanju povezave za Stripe račun');
      }

      const data = res.data;
      
      if (data && data.url) {
        if (popup && !popup.closed) {
          popup.location.href = data.url;
        } else {
          window.location.href = data.url;
          return;
        }

        // Monitor popup closure
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        pollTimerRef.current = setInterval(() => {
          if (popup.closed) {
            clearInterval(pollTimerRef.current);
            setLoading(false);
            onComplete();
          }
        }, 1000);
      } else {
        if (popup && !popup.closed) popup.close();
      }
    } catch (err: any) {
      console.error(err);
      if (popup && !popup.closed) popup.close();
      setErrorMessage(err.message || 'Napaka pri povezovanju s Stripe sistemom');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`p-6 rounded-2xl border ${isComplete ? 'bg-green-50/50 border-green-100' : 'bg-slate-50 border-slate-100'}`}>
      <div className="flex items-start md:items-center justify-between flex-col md:flex-row gap-6">
        <div className="flex gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isComplete ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
            {isComplete ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
          </div>
          <div>
            <h4 className={`text-sm font-black uppercase tracking-widest ${isComplete ? 'text-green-800' : 'text-[#0A1128]'}`}>
                {isComplete ? t('stripeAccountAndPayouts') : t('stripeVerificationAndPayouts')}
            </h4>
            <p className="text-xs font-bold text-slate-500 mt-2 max-w-sm">
                {isComplete ? t('stripeConnectedDesc') : t('stripeUnconnectedDesc')}
            </p>
            {errorMessage && (
              <p className="text-xs font-bold text-red-600 mt-2 flex items-center gap-1.5">
                <AlertCircle size={14} className="shrink-0" />
                {errorMessage}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={handleStartOnboarding}
          className="shrink-0 bg-[#0A1128] text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-colors shadow-lg disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (
            <>
              <Clock size={16} className="animate-spin" />
              <span>{t('loading') || 'Nalaganje...'}</span>
            </>
          ) : isComplete ? t('manageBankAccount') : t('startVerification')}
        </button>
      </div>
    </div>
  );
};

