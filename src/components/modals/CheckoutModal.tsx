import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, Lock, CreditCard as CardIcon, ShieldCheck, AlertCircle } from 'lucide-react';
import { createCheckoutSessionAction, confirmCheckoutSessionAction } from '@/src/actions/index';
import { auth } from "../../lib/firebase";
import { Portal } from '../ui/Portal';

export const CheckoutModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  title: string;
  t: any;
  language: string;
  onSuccess: () => void;
  metadata?: any;
}> = ({ isOpen, onClose, amount, title, t, language, onSuccess, metadata }) => {
  if (!isOpen) return null;

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollTimerRef = useRef<any>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'STRIPE_POPUP_CALLBACK') {
        const { status, action, sessionId } = event.data;
        if (status === 'success') {
          setIsLoading(false);
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          if (popupRef.current && !popupRef.current.closed) {
            try { popupRef.current.close(); } catch (e) {}
          }
          onSuccess();
          onClose();
        } else if (status === 'cancel') {
          setIsLoading(false);
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setErrorMessage("Plačilo je bilo preklicano.");
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [onSuccess, onClose]);

  const handlePay = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const isSub = metadata?.type === 'subscription';
      const determinedPlan = metadata?.planId || metadata?.tier || (isSub ? (title.toLowerCase().includes('pro') ? 'pro' : 'basic') : undefined);
      const callbackUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/stripe-callback.html${isSub ? '?type=subscription' : ''}` 
        : '';

      const res = await createCheckoutSessionAction({
        amount,
        title,
        ...(metadata || {}),
        ...(determinedPlan ? { 
          planId: determinedPlan, 
          package_id: String(determinedPlan).toUpperCase(), 
          tier: String(determinedPlan).toUpperCase() 
        } : {}),
        user_id: auth.currentUser?.uid || metadata?.user_id,
        buyer_id: auth.currentUser?.uid || metadata?.buyer_id,
        return_url: callbackUrl
      });

      if (res.url) {
        window.location.href = res.url;
        return;
      } else {
        throw new Error(res.error || "Povezava za plačilo ni na voljo.");
      }
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err.message || "Napaka pri preusmeritvi na plačilo");
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[#0A1128]/95 backdrop-blur-md" onClick={onClose}></div>
        <div className="relative bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-2xl animate-in border-4 border-[#FEBA4F]">
          <button type="button" onClick={onClose} className="absolute top-8 right-8 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24} /></button>
          <h3 className="text-3xl font-black text-[#0A1128] uppercase tracking-tighter mb-2">{t('checkout') || 'PLAČILO'}</h3>
          <p className="text-slate-500 font-bold mb-6">{title}</p>
          
          <div className="bg-slate-50 rounded-2xl p-6 mb-6 border border-slate-100 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('totalAmount') || 'ZA PLAČILO'}</p>
            <p className="text-4xl font-black text-[#FEBA4F]">€{amount.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>

          <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4 mb-6 text-center">
            <p className="text-blue-900 text-xs font-bold leading-relaxed flex items-center justify-center gap-2">
              <ShieldCheck size={16} className="text-blue-600 shrink-0" />
              Varno spletno plačilo preko sistema Stripe.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm font-bold text-center leading-snug flex items-center justify-center gap-2">
              <AlertCircle size={18} className="shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button 
            type="button" 
            onClick={handlePay} 
            disabled={isLoading} 
            className="w-full bg-[#0A1128] text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? <Clock className="animate-spin" size={20} /> : <Lock size={20} />}
            {isLoading ? (t('processing') || 'Obdelujem...') : 'Nadaljuj na plačilo'}
          </button>
        </div>
      </div>
    </Portal>
  );
};

