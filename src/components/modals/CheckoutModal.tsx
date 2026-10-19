import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, Lock, CreditCard as CardIcon, ShieldCheck, AlertCircle } from '../icons';
import { createCheckoutSessionAction, confirmCheckoutSessionAction } from '@/src/actions/index';
import { auth } from "../../lib/firebase";
import { Portal } from '../ui/Portal';
import { LoadingButton } from '../ui/Common';
import { isBankTransferAvailable, resolvePaymentDeadlineMs } from '@/src/lib/bankTransfer';
import { toast } from 'sonner';
import { openCenteredPopup } from '@/src/lib/popup';

// Deutscher Kommentar: Modal-Komponente zur Wahl der Zahlungsmethode (Karte oder Bankueberweisung) und Initiierung des Checkouts
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
  const [isLoading, setIsLoading] = useState(false);
  const [isWaitingForPopup, setIsWaitingForPopup] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank_transfer'>('card');
  const [bankTransferBlocked, setBankTransferBlocked] = useState(false);
  const pollTimerRef = useRef<any>(null);
  const popupRef = useRef<Window | null>(null);

  // Deutscher Kommentar: Bereinigt das Polling-Intervall
  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  // Deutscher Kommentar: Schliesst das Popup-Fenster sicher
  const closePopup = () => {
    if (popupRef.current && !popupRef.current.closed) {
      try {
        popupRef.current.close();
      } catch (e) {}
    }
    popupRef.current = null;
  };

  // Deutscher Kommentar: Setzt das Modal zurueck
  const resetModalState = () => {
    stopPolling();
    closePopup();
    setIsLoading(false);
    setIsWaitingForPopup(false);
    setActiveSessionId(null);
  };

  useEffect(() => {
    if (isOpen) {
      setIsLoading(false);
      setIsWaitingForPopup(false);
      setActiveSessionId(null);
      setErrorMessage(null);
      setPaymentMethod('card');
      setBankTransferBlocked(false);
    } else {
      resetModalState();
    }
  }, [isOpen]);

  const isSub = metadata?.type === 'subscription';
  const isAuction = !isSub;
  
  const paymentDeadlineMs = resolvePaymentDeadlineMs({
      payment_deadline: metadata?.payment_deadline,
      endTime: metadata?.endTime || metadata?.end_time
  });
  
  const showBankTransferOption = isAuction && !bankTransferBlocked && isBankTransferAvailable({
      amountCents: Math.round(amount * 100),
      paymentDeadlineMs,
      nowMs: Date.now(),
      alreadyUsed: !!metadata?.bank_transfer_used
  });

  useEffect(() => {
    if (!isOpen) return;
    const handleMessage = (event: MessageEvent) => {
      // Deutscher Kommentar: Ursprung pruefen, um fremde Nachrichten zu ignorieren
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === 'STRIPE_POPUP_CALLBACK') {
        const { status, action, sessionId } = event.data;
        if (status === 'success') {
          stopPolling();
          closePopup();
          setIsLoading(false);
          setIsWaitingForPopup(false);
          onSuccess();
          onClose();
        } else if (status === 'cancel') {
          resetModalState();
          setErrorMessage("Plačilo je bilo preklicano.");
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      stopPolling();
    };
  }, [onSuccess, onClose, isOpen]);

  // Deutscher Kommentar: Polling fuer Zahlungsbestaetigung alle 3 Sekunden, maximal 20 Minuten
  const startPolling = (sessionId: string) => {
    stopPolling();
    const startTime = Date.now();
    const maxPollMs = 20 * 60 * 1000; // 20 Minuten

    pollTimerRef.current = setInterval(async () => {
      if (Date.now() - startTime > maxPollMs) {
        stopPolling();
        return;
      }

      // Deutscher Kommentar: Wenn das Popup geschlossen wurde, letzte Pruefung durchfuehren bevor abgebrochen wird
      if (popupRef.current && popupRef.current.closed) {
        stopPolling();
        try {
          const finalConfirm = await confirmCheckoutSessionAction({ sessionId });
          const finalData = (finalConfirm as any)?.data || finalConfirm;
          if (finalConfirm.success && finalData && !finalData.pending && (finalData.paid || finalData.success)) {
            closePopup();
            setIsWaitingForPopup(false);
            setIsLoading(false);
            onSuccess();
            onClose();
            return;
          }
          if (finalData && finalData.pending === true && finalData.payment_method === 'bank_transfer') {
            closePopup();
            setIsWaitingForPopup(false);
            setIsLoading(false);
            onClose();
            onSuccess();
            toast.success("Nakazilo je potrjeno. Navodila za nakazilo odprete na kartici dražbe z gumbom 'Odpri navodila za nakazilo'.");
            return;
          }
        } catch (e) {
          // Deutscher Kommentar: Fehler bei letzter Pruefung ignorieren
        }
        setIsWaitingForPopup(false);
        setIsLoading(false);
        setErrorMessage("Plačilo je bilo prekinjeno.");
        return;
      }

      try {
        const confirmRes = await confirmCheckoutSessionAction({ sessionId });
        const resData = (confirmRes as any)?.data || confirmRes;

        // Deutscher Kommentar: Kartenzahlung erfolgreich
        if (confirmRes.success && resData && !resData.pending && (resData.paid || resData.success)) {
          stopPolling();
          closePopup();
          setIsWaitingForPopup(false);
          setIsLoading(false);
          onSuccess();
          onClose();
          return;
        }

        // Deutscher Kommentar: Bankueberweisung bestaetigt (pending: true, payment_method: bank_transfer)
        if (resData && resData.pending === true && resData.payment_method === 'bank_transfer') {
          stopPolling();
          closePopup();
          setIsWaitingForPopup(false);
          setIsLoading(false);
          onClose();
          onSuccess();
          toast.success("Nakazilo je potrjeno. Navodila za nakazilo odprete na kartici dražbe z gumbom 'Odpri navodila za nakazilo'.");
          return;
        }
      } catch (pollErr) {
        // Fehler beim Polling ignorieren
      }
    }, 3000);
  };

  if (!isOpen) return null;

  const handlePay = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    // Deutscher Kommentar: Synchrones Oeffnen des Popups vor jedem await zur Vermeidung von Popup-Blockern
    let popup: Window | null = null;
    try {
      popup = openCenteredPopup('', 'payment', 520, 800);
      popupRef.current = popup;
    } catch (e) {
      popupRef.current = null;
    }

    try {
      const determinedPlan = metadata?.planId || metadata?.tier || (isSub ? (title.toLowerCase().includes('pro') ? 'pro' : 'basic') : undefined);
      const callbackUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/stripe-callback.html${isSub ? '?type=subscription' : ''}` 
        : '';

      const res = await createCheckoutSessionAction({
        amount,
        title,
        ...(metadata || {}),
        payment_method: paymentMethod,
        ...(determinedPlan ? { 
          planId: determinedPlan, 
          package_id: String(determinedPlan).toUpperCase(), 
          tier: String(determinedPlan).toUpperCase() 
        } : {}),
        user_id: auth.currentUser?.uid || metadata?.user_id,
        buyer_id: auth.currentUser?.uid || metadata?.buyer_id,
        return_url: callbackUrl
      });

      if (!res.url) {
        if (popup && !popup.closed) {
          try { popup.close(); } catch (e) {}
        }
        popupRef.current = null;
        throw new Error(res.error || "Povezava za plačilo ni na voljo.");
      }

      const sid = res.sessionId || '';
      setActiveSessionId(sid);

      // Deutscher Kommentar: Wenn Popup verfuegbar ist, URL darin laden und Polling starten, sonst Fallback
      if (popup && !popup.closed) {
        try {
          popup.location.href = res.url;
        } catch (e) {
          window.location.href = res.url;
          return;
        }
        setIsLoading(false);
        setIsWaitingForPopup(true);
        if (sid) {
          startPolling(sid);
        }
      } else {
        window.location.href = res.url;
      }
    } catch (err: any) {
      if (popup && !popup.closed) {
        try { popup.close(); } catch (e) {}
      }
      popupRef.current = null;
      setIsLoading(false);
      setIsWaitingForPopup(false);
      setErrorMessage(err.message || "Napaka pri preusmeritvi na plačilo");
      // Deutscher Kommentar: Bei abgelehnter Bankueberweisung auf Karte zurueckschalten und Option ausblenden
      if (paymentMethod === 'bank_transfer') {
        setPaymentMethod('card');
        setBankTransferBlocked(true);
      }
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[2000] flex items-center justify-center p-2.5 sm:p-4">
        <div className="absolute inset-0 bg-[#0A1128]/95 backdrop-blur-md" onClick={() => { resetModalState(); onClose(); }}></div>
        {/* Deutscher Kommentar: Das Kassenmodal erhaelt max-h-[92dvh] overflow-y-auto und responsive Abstaende fuer Mobilgeraete */}
        <div className="relative bg-white w-full max-w-lg rounded-3xl sm:rounded-[1.35rem] p-5 sm:p-10 shadow-2xl animate-in border-2 border-[#FEBA4F] max-h-[92dvh] overflow-y-auto">
          <button 
            type="button" 
            onClick={() => { resetModalState(); onClose(); }} 
            className="absolute top-4 right-4 sm:top-8 sm:right-8 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
            aria-label="Zapri"
          >
            <X size={24} />
          </button>
          <h3 className="text-xl sm:text-3xl font-black text-[#0A1128] uppercase tracking-tighter mb-2">{t('checkout') || 'PLAČILO'}</h3>
          <p className="text-slate-500 font-bold mb-4 sm:mb-6 text-sm">{title}</p>
          
          <div className="bg-slate-50 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border border-slate-100 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('totalAmount') || 'ZA PLAČILO'}</p>
            <p className="text-2xl sm:text-4xl font-black text-[#FEBA4F]">€{amount.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>

          {isWaitingForPopup ? (
            <div className="py-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 border-2 border-[#FEBA4F] flex items-center justify-center mb-5 text-[#FEBA4F]">
                <Clock size={32} className="animate-spin" />
              </div>
              <h4 className="text-lg sm:text-xl font-black text-[#0A1128] uppercase tracking-tight mb-2">
                Čakanje na zaključek plačila
              </h4>
              <p className="text-slate-600 font-bold text-xs sm:text-sm mb-6 max-w-sm leading-relaxed">
                Dokončajte plačilo v odprtem oknu. To okno ostane odprto.
              </p>
              <button
                type="button"
                onClick={() => {
                  resetModalState();
                  setErrorMessage("Plačilo je bilo prekinjeno.");
                }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3.5 sm:py-4 rounded-2xl font-black uppercase tracking-wider text-xs sm:text-sm transition-all cursor-pointer min-h-[44px] flex items-center justify-center"
              >
                Prekliči
              </button>
            </div>
          ) : (
            <>
              {showBankTransferOption && (
                <div className="mb-4 sm:mb-6">
                  <p className="text-xs font-black uppercase tracking-wider text-[#0A1128] mb-3 text-center">Način plačila</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('card')}
                      className={`p-3.5 sm:p-4 rounded-2xl border-2 text-left transition-all flex flex-col justify-between cursor-pointer min-h-[44px] ${
                        paymentMethod === 'card'
                          ? 'border-[#FEBA4F] bg-amber-50/40 text-[#0A1128]'
                          : 'border-slate-100 bg-white hover:border-slate-200 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                        <CardIcon size={18} className={paymentMethod === 'card' ? 'text-[#FEBA4F]' : 'text-slate-400'} />
                        <span className="text-sm font-black uppercase tracking-tight">Kartica</span>
                      </div>
                      <span className="text-[11px] font-medium leading-tight text-slate-500">Takojšnje plačilo in potrditev</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('bank_transfer')}
                      className={`p-3.5 sm:p-4 rounded-2xl border-2 text-left transition-all flex flex-col justify-between cursor-pointer min-h-[44px] ${
                        paymentMethod === 'bank_transfer'
                          ? 'border-[#FEBA4F] bg-amber-50/40 text-[#0A1128]'
                          : 'border-slate-100 bg-white hover:border-slate-200 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                        <ShieldCheck size={18} className={paymentMethod === 'bank_transfer' ? 'text-[#FEBA4F]' : 'text-slate-400'} />
                        <span className="text-sm font-black uppercase tracking-tight text-nowrap">Nakazilo</span>
                      </div>
                      <span className="text-[11px] font-medium leading-tight text-slate-500">Bančno nakazilo (SEPA)</span>
                    </button>
                  </div>
                  <p className="mt-2.5 text-[10px] sm:text-[11px] font-medium leading-snug text-slate-500 text-center">
                    Po potrditvi imate za nakazilo do 3 delovne dni. Nakazilo lahko izberete samo enkrat; če ne uspe, imate še eno priložnost za plačilo s kartico.
                  </p>
                </div>
              )}

              <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-3 sm:p-4 mb-4 sm:mb-6 text-center">
                <p className="text-blue-900 text-[11px] sm:text-xs font-bold leading-relaxed flex items-center justify-center gap-2">
                  <ShieldCheck size={16} className="text-blue-600 shrink-0" />
                  {paymentMethod === 'bank_transfer' 
                    ? 'Varne podatke za bančno nakazilo bo posredoval naš plačilni partner.' 
                    : 'Varno spletno plačilo prek našega plačilnega partnerja.'}
                </p>
              </div>

              {errorMessage && (
                <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs sm:text-sm font-bold text-center leading-snug flex items-center justify-center gap-2">
                  <AlertCircle size={18} className="shrink-0 text-red-500" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <LoadingButton
                type="button"
                onClick={handlePay}
                loading={isLoading}
                loadingText={t('processing') || 'Odpiram plačilo...'}
                className="w-full bg-[#0A1128] text-white py-3.5 sm:py-5 rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm hover:bg-[#FEBA4F] hover:text-[#0A1128] transition-all shadow-xl min-h-[44px]"
              >
                <Lock size={20} />
                Nadaljuj na plačilo
              </LoadingButton>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
};
